#!/usr/bin/env node
/**
 * educa-navarra-mcp: introduce las notas de evaluación en Educa (Gobierno de
 * Navarra) automatizando el navegador del propio profesor.
 *
 * Flujo pensado:
 *   1. educa_login            -> abre Educa; el profesor inicia sesión a mano
 *   2. educa_click / educa_select_filter / educa_inspect_page
 *                             -> llegar a la pantalla de calificaciones (grupo, materia, evaluación)
 *   3. educa_preview_grades   -> cruza el Excel/CSV con la tabla de Educa (no cambia nada)
 *   4. educa_fill_grades      -> escribe las notas en los campos (no guarda)
 *   5. educa_save_grades      -> pulsa Guardar, solo con confirmación expresa
 *
 * Solo stdio: controla un navegador en el ordenador del profesor.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { EducaBrowser, FieldGone } from "./browser.js";
import { loadConfig, PROJECT_DIR } from "./config.js";
import { registerGuide, SERVER_INSTRUCTIONS } from "./guide.js";
import { buildPlan, describeScale, parseGradesFile, summarizePlan, type GradePlan, type GradeScale, type GradeSheet, type InputGrade, type PlanItem } from "./grades.js";

const CHARACTER_LIMIT = 25_000;
const PACKAGE_VERSION: string = (JSON.parse(readFileSync(join(PROJECT_DIR, "package.json"), "utf8")) as { version: string }).version;
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(PACKAGE_VERSION);
  process.exit(0);
}
if (process.stdin.isTTY) {
  process.stderr.write(
    `educa-navarra-mcp ${PACKAGE_VERSION}\n` +
      "Este programa no se usa desde la terminal: lo abre tu aplicación de IA (Claude Desktop, Claude Code...).\n" +
      "Instrucciones: https://github.com/vTanco/educa-navarra-mcp#readme\n" +
      "Pulsa Ctrl+C para salir.\n"
  );
}
const { config, path: configPath } = loadConfig();
const browser = new EducaBrowser(config);

interface StoredPlan {
  id: string;
  column: string | null;
  createdAt: number;
  plan: GradePlan;
  filled: boolean;
}
const plans = new Map<string, StoredPlan>();
let lastFilledPlan: StoredPlan | null = null;

// ---------- Utilidades de respuesta ----------

type Content = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown> };

function text(t: string): Content {
  return { content: [{ type: "text", text: t.length > CHARACTER_LIMIT ? `${t.slice(0, CHARACTER_LIMIT)}\n\n[Respuesta recortada: usa response_format="json" o filtra más.]` : t }] };
}

function json(data: Record<string, unknown>): Content {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

const ResponseFormat = z.enum(["markdown", "json"]).default("markdown").describe("'markdown' para leerlo, 'json' para datos estructurados");

async function requireLogin(): Promise<void> {
  if (!browser.isOpen) throw new Error("El navegador no está abierto. Llama primero a educa_login.");
  if (!(await browser.isLoggedIn())) throw new Error("No hay sesión iniciada en Educa (o la sesión ha caducado). Llama a educa_login y pide al profesor que inicie sesión en la ventana del navegador.");
}

const STATUS_LABEL: Record<PlanItem["status"], string> = {
  cambia: "✏️ se escribirá",
  igual: "✔️ ya está igual",
  sin_coincidencia: "❌ alumno no encontrado",
  ambigua: "⚠️ coincidencia dudosa",
  nota_no_valida: "❌ nota no válida",
  campo_bloqueado: "🔒 campo bloqueado",
  duplicada: "⚠️ fila duplicada"
};

function planMarkdown(stored: StoredPlan, sheet: GradeSheet, scale: GradeScale): string {
  const { plan } = stored;
  const counts = summarizePlan(plan);
  const fuzzy = plan.items.filter(i => i.fuzzyMatch && i.status === "cambia").length;
  const lines = [
    `# Vista previa de notas (plan ${stored.id})`,
    "",
    `Columna de Educa: **${stored.column ?? "(única)"}** · ${sheet.rows.filter(r => r.field).length} alumnos en la tabla`,
    ...(sheet.context ? [`Pantalla: ${sheet.context}`] : []),
    `Escala detectada: ${scale.description}`,
    "",
    `- Se escribirán: **${counts.cambia}**${fuzzy ? ` (de ellas ${fuzzy} por coincidencia aproximada de nombre, revísalas)` : ""}`,
    `- Ya estaban igual: ${counts.igual}`,
    `- Con problemas: ${counts.sin_coincidencia + counts.ambigua + counts.nota_no_valida + counts.campo_bloqueado + counts.duplicada}`,
    "",
    "| Alumno (fichero) | Alumno (Educa) | Nota actual | Nota nueva | Estado |",
    "|---|---|---|---|---|"
  ];
  for (const i of plan.items) {
    const status = `${STATUS_LABEL[i.status]}${i.fuzzyMatch ? " (nombre aproximado)" : ""}${i.note ? `: ${i.note}` : ""}`;
    lines.push(`| ${i.student} | ${i.educaName ?? "—"} | ${i.currentDisplay ?? "—"} | ${i.newDisplay ?? i.grade} | ${status} |`);
  }
  if (plan.rowsWithoutGrade.length) {
    lines.push("", `**Alumnos de Educa sin nota en el fichero (${plan.rowsWithoutGrade.length}):** ${plan.rowsWithoutGrade.join(", ")}`);
  }
  lines.push(
    "",
    "Nada se ha cambiado todavía. Enseña esta tabla al profesor; si da el visto bueno, llama a educa_fill_grades con este plan_id" +
      (fuzzy ? " (con include_fuzzy=true solo si confirma las coincidencias aproximadas)" : "") +
      "."
  );
  return lines.join("\n");
}

// ---------- Servidor ----------

function createServer(): McpServer {
  const server = new McpServer({ name: "educa-mcp", version: PACKAGE_VERSION }, { instructions: SERVER_INSTRUCTIONS });
  registerGuide(server);

  server.registerTool(
    "educa_login",
    {
      title: "Iniciar sesión en Educa",
      description: `Abre Educa en una ventana de navegador del ordenador del profesor e inicia sesión. Si el profesor ha guardado sus credenciales en el fichero local de credenciales, el formulario se rellena solo (un único intento); si no, espera a que inicie sesión él mismo (usuario de Educa, Cl@ve o certificado). La contraseña nunca pasa por el modelo. Si ya hay sesión (el perfil del navegador la recuerda), vuelve enseguida.

Llámala antes que cualquier otra herramienta. Avisa al profesor de que debe iniciar sesión en la ventana que se abre.`,
      inputSchema: z.strictObject({
        wait_minutes: z.number().min(0.1).max(15).optional().describe(`Minutos máximos de espera al login manual (por defecto ${config.loginTimeoutMinutes})`)
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ wait_minutes }) => {
      const res = await browser.login(wait_minutes ?? config.loginTimeoutMinutes);
      if (!res.loggedIn) {
        return { isError: true, content: [{ type: "text", text: `No se ha detectado el inicio de sesión a tiempo (página actual: ${res.url}). Pide al profesor que inicie sesión en la ventana del navegador y vuelve a llamar a educa_login.` }] };
      }
      return text(`Sesión iniciada en Educa${res.usedCredentials ? " con las credenciales guardadas" : ""}. Página actual: ${res.url}\n\nSiguiente paso: ir a la pantalla de calificaciones (educa_inspect_page para ver menús y filtros, educa_click y educa_select_filter para navegar).`);
    }
  );

  server.registerTool(
    "educa_status",
    {
      title: "Estado de la sesión",
      description: "Indica si el navegador está abierto, si hay sesión en Educa, la página actual y qué fichero de configuración se usa.",
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      const open = browser.isOpen;
      const page = open ? await browser.page() : null;
      return json({
        browser_open: open,
        logged_in: open ? await browser.isLoggedIn() : false,
        url: page?.url() ?? null,
        title: page ? await page.title() : null,
        config_file: configPath,
        pending_plans: [...plans.values()].map(p => ({ plan_id: p.id, column: p.column, filled: p.filled }))
      });
    }
  );

  server.registerTool(
    "educa_navigate",
    {
      title: "Ir a una URL de Educa",
      description: "Abre una URL concreta de Educa en el navegador. Solo se permiten los dominios de allowedHosts (por defecto educa.navarra.es). Para moverse por menús es mejor educa_click.",
      inputSchema: z.strictObject({ url: z.string().describe("URL completa, p. ej. https://educa.navarra.es/...") }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ url }) => {
      const page = await browser.goto(url);
      return text(`Abierta: ${page.url()} (${await page.title()})`);
    }
  );

  server.registerTool(
    "educa_inspect_page",
    {
      title: "Ver qué hay en la página",
      description: `Resume la página actual de Educa: títulos, tablas (cabeceras, nº de filas y ejemplo), desplegables y campos de filtro con sus opciones, enlaces y botones visibles, y mensajes. Recorre también los marcos (iframes). Úsala para orientarte antes de educa_click o educa_select_filter, y para saber qué columna pasar a educa_preview_grades.`,
      inputSchema: z.strictObject({
        max_items: z.number().int().min(5).max(200).default(60).describe("Máximo de campos y de enlaces/botones a listar por marco"),
        response_format: ResponseFormat
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ max_items, response_format }) => {
      await requireLogin();
      const summary = await browser.inspect(max_items);
      if (response_format === "json") return json(summary as unknown as Record<string, unknown>);
      const lines = [`# ${summary.title}`, summary.url];
      for (const f of summary.frames) {
        lines.push("", `## ${f.isMain ? "Página principal" : `Marco ${f.url}`}`);
        if (f.headings.length) lines.push(`Títulos: ${f.headings.join(" · ")}`);
        if (f.messages.length) lines.push(`Mensajes: ${f.messages.join(" · ")}`);
        for (const t of f.tables) {
          lines.push(`- Tabla ${t.index}: ${t.rows} filas (${t.rowsWithFields} con campos editables). Cabeceras: ${t.headers.join(" | ") || "(sin cabecera)"}`);
          for (const s of t.sample) lines.push(`  - ${s.join(" | ")}`);
        }
        if (f.fields.length) {
          lines.push("Campos y desplegables:");
          for (const fl of f.fields) lines.push(`- ${fl.label || fl.name || fl.id || fl.tag} [${fl.tag}${fl.name ? ` name=${fl.name}` : ""}] = "${fl.value}"${fl.options ? ` · opciones: ${fl.options.join(" / ")}` : ""}`);
        }
        if (f.clickables.length) lines.push(`Enlaces y botones: ${f.clickables.join(" · ")}`);
      }
      return text(lines.join("\n"));
    }
  );

  server.registerTool(
    "educa_dump_html",
    {
      title: "Ver la estructura HTML",
      description: `Devuelve el HTML simplificado de la página actual (sin scripts ni estilos, solo atributos útiles: id, name, class, role, formcontrolname...), de todos los marcos. Si hay un diálogo abierto, solo el diálogo. Úsala cuando educa_inspect_page no basta para entender un formulario o para averiguar selectores CSS para educa_click o la configuración. No cambia nada.`,
      inputSchema: z.strictObject({
        selector: z.string().optional().describe("Selector CSS de la zona a mostrar (por defecto el diálogo abierto o toda la página)"),
        frame_url_contains: z.string().optional().describe("Solo los marcos cuya URL contenga este texto"),
        max_chars: z.number().int().min(1000).max(24000).default(12000).describe("Tamaño máximo por marco")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ selector, frame_url_contains, max_chars }) => {
      await requireLogin();
      const dumps = await browser.dumpHtml(selector, max_chars, frame_url_contains);
      if (!dumps.length) throw new Error(selector ? `Ningún marco tiene un elemento que encaje con ${selector}.` : "No hay marcos que leer.");
      return text(dumps.map(d => `## Marco ${d.url}\n${d.html}`).join("\n\n"));
    }
  );

  server.registerTool(
    "educa_click",
    {
      title: "Pulsar un enlace o botón",
      description: `Pulsa un enlace, pestaña o botón visible de Educa por su texto (p. ej. "Evaluación", "Calificaciones", "1º ESO A") o por selector CSS. Sirve para navegar hasta la pantalla de notas. Por seguridad se niega a pulsar cualquier cosa que suene a cerrar, firmar, bloquear, borrar o publicar; para guardar notas usa educa_save_grades.`,
      inputSchema: z.strictObject({
        text: z.string().min(1).optional().describe("Texto visible del elemento"),
        selector: z.string().min(1).optional().describe("Selector CSS, si el texto no basta"),
        exact: z.boolean().default(false).describe("Exigir coincidencia exacta del texto")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ text: t, selector, exact }) => {
      if (!t && !selector) throw new Error("Indica text o selector.");
      await requireLogin();
      const label = await browser.click({ text: t, selector, exact });
      const page = await browser.page();
      return text(`Pulsado "${label}". Página actual: ${page.url()} (${await page.title()})`);
    }
  );

  server.registerTool(
    "educa_select_filter",
    {
      title: "Elegir en un desplegable de filtro",
      description: `Elige una opción en un desplegable de la página (normal o con buscador, como los de Educa-Gestión; si hay un diálogo abierto, el del diálogo) por la etiqueta o nombre del desplegable, p. ej. field="Evaluación", option="1ª Evaluación"; field="Grupo", option="2º ESO B"; field="Materia", option="Matemáticas". No toca los desplegables de nota de la tabla de alumnos (para eso está educa_fill_grades).`,
      inputSchema: z.strictObject({
        field: z.string().min(1).describe("Parte de la etiqueta, name o id del desplegable"),
        option: z.string().min(1).describe("Texto de la opción a elegir")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ field, option }) => {
      await requireLogin();
      const res = await browser.selectFilter(field, option);
      return text(`En "${res.field}" se ha elegido "${res.selected}".`);
    }
  );

  server.registerTool(
    "educa_screenshot",
    {
      title: "Captura de pantalla",
      description: "Guarda una captura de la página actual en el ordenador del profesor y devuelve la ruta. Útil para dejar constancia antes y después de guardar.",
      inputSchema: z.strictObject({ label: z.string().default("captura").describe("Texto corto para el nombre del fichero") }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ label }) => {
      if (!browser.isOpen) throw new Error("El navegador no está abierto. Llama primero a educa_login.");
      return text(`Captura guardada en ${await browser.screenshot(label)}`);
    }
  );

  server.registerTool(
    "educa_read_grade_sheet",
    {
      title: "Leer la tabla de notas",
      description: `Lee la tabla de calificaciones abierta en Educa: alumnos y nota actual de cada uno, y la escala de calificación que pide esa pantalla (términos IN/SU/BI/NT/SB en ESO, número de 0 a 10 en Bachillerato, de 1 a 10 en FP, Apto/No apto...). La escala se deduce de la propia pantalla, no del nombre del grupo. No cambia nada. Si la tabla tiene varias columnas editables (p. ej. nota y observaciones, o varias evaluaciones), indica cuál con column; la respuesta lista las columnas editables.`,
      inputSchema: z.strictObject({
        column: z.string().optional().describe("Parte del texto de la cabecera de la columna de nota, p. ej. 'Final' o '1ª Ev'"),
        response_format: ResponseFormat
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ column, response_format }) => {
      await requireLogin();
      const sheet = await browser.readGradeSheet(column, true);
      const scale = describeScale(sheet, config.grades);
      const data = {
        context: sheet.context ?? null,
        stage: scale.stage,
        scale,
        column: sheet.column,
        editable_columns: sheet.editableColumns,
        students: sheet.rows.map(r => ({ name: r.name, ...(r.studentId ? { id: r.studentId } : {}), grade: r.field ? r.field.valueText || r.field.value : null, editable: r.field ? !r.field.disabled : false }))
      };
      if (response_format === "json") return json(data);
      if (!sheet.column) {
        return text(`La tabla tiene varias columnas editables y no sé cuál es la nota: ${sheet.editableColumns.join(" | ")}. Vuelve a llamar con column.`);
      }
      const lines = [`# Tabla de notas · columna "${sheet.column}" · ${data.students.length} alumnos`, ...(sheet.context ? [`Pantalla: ${sheet.context}`] : []), `Escala detectada: ${scale.description}`, "", "| # | Alumno | Nota actual |", "|---|---|---|"];
      data.students.forEach((s, i) => lines.push(`| ${i + 1} | ${s.name} | ${s.grade || "(vacía)"}${s.editable ? "" : " 🔒"} |`));
      return text(lines.join("\n"));
    }
  );

  server.registerTool(
    "educa_load_grades_file",
    {
      title: "Leer el fichero de notas",
      description: `Lee un Excel (.xlsx) o CSV del ordenador del profesor y devuelve la lista alumno → nota que se ha entendido. No toca Educa. Detecta solas las columnas tipo "Alumno"/"Apellidos"+"Nombre" y "Nota"/"Nota final"/"Calificación"; si no, indícalas.`,
      inputSchema: z.strictObject({
        file_path: z.string().describe("Ruta absoluta al .xlsx o .csv"),
        sheet: z.string().optional().describe("Hoja del Excel (por defecto la primera)"),
        name_column: z.string().optional().describe("Cabecera de la columna del alumno"),
        grade_column: z.string().optional().describe("Cabecera de la columna de la nota"),
        id_column: z.string().optional().describe("Cabecera de una columna de identificador (NIA), opcional")
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ file_path, sheet, name_column, grade_column, id_column }) => {
      const res = await parseGradesFile(file_path, { sheet, nameColumn: name_column, gradeColumn: grade_column, idColumn: id_column });
      return json({ headers: res.headers, count: res.grades.length, grades: res.grades, students_without_grade: res.skipped });
    }
  );

  server.registerTool(
    "educa_preview_grades",
    {
      title: "Vista previa: cruzar notas con Educa",
      description: `Cruza las notas (de un fichero o pasadas directamente) con la tabla de calificaciones abierta en Educa y devuelve, sin cambiar nada, qué se escribiría: alumno del fichero, alumno de Educa, nota actual, nota nueva y avisos (alumno no encontrado, nombre dudoso, nota fuera de rango o que no existe en el desplegable, campo bloqueado). Indica también la escala detectada en la pantalla y convierte cada nota a ella: si Educa pide términos (ESO) y el fichero trae números, aplica 0–4 IN, 5 SU, 6 BI, 7–8 NT, 9–10 SB; si pide número (Bachillerato, FP) rechaza los términos y los decimales. Devuelve un plan_id para educa_fill_grades.

Los nombres se emparejan sin importar mayúsculas, tildes ni el orden "Apellidos, Nombre" / "Nombre Apellidos". Las coincidencias aproximadas se marcan y no se escriben salvo que se pida.

Enseña siempre el resultado al profesor antes de rellenar.`,
      inputSchema: z.strictObject({
        file_path: z.string().optional().describe("Ruta a un .xlsx o .csv con las notas"),
        grades: z
          .array(z.strictObject({ student: z.string().min(2), grade: z.string().min(1), id: z.string().optional() }))
          .optional()
          .describe('Alternativa al fichero: [{"student":"García López, Ana","grade":"7"}, ...]'),
        sheet: z.string().optional(),
        name_column: z.string().optional(),
        grade_column: z.string().optional(),
        id_column: z.string().optional(),
        column: z.string().optional().describe("Columna de Educa donde va la nota, si hay varias editables"),
        stage: z.enum(["primaria", "eso", "bachillerato", "fp"]).optional().describe("Etapa del grupo, solo si la detección automática falla (afecta al rango numérico: en FP 1–10, en Bachillerato 0–10)"),
        response_format: ResponseFormat
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async args => {
      if (!args.file_path && !args.grades?.length) throw new Error("Indica file_path o grades.");
      await requireLogin();
      let inputs: InputGrade[] = args.grades ?? [];
      if (args.file_path) {
        inputs = (await parseGradesFile(args.file_path, { sheet: args.sheet, nameColumn: args.name_column, gradeColumn: args.grade_column, idColumn: args.id_column })).grades;
      }
      if (!inputs.length) throw new Error("El fichero no contiene ninguna nota.");
      const sheet = await browser.readGradeSheet(args.column, true);
      if (!sheet.column && !config.gradeSheet.gradeFieldSelector) {
        throw new Error(`La tabla de Educa tiene varias columnas editables: ${sheet.editableColumns.join(" | ")}. Indica en column cuál es la de la nota.`);
      }
      const plan = buildPlan(sheet, inputs, config.grades, args.stage);
      const scale = describeScale(sheet, config.grades, args.stage);
      const stored: StoredPlan = { id: randomUUID().slice(0, 8), column: args.column ?? null, createdAt: Date.now(), plan, filled: false };
      plans.set(stored.id, stored);
      if (args.response_format === "json") {
        return json({ plan_id: stored.id, column: sheet.column, context: sheet.context ?? null, scale, summary: summarizePlan(plan), items: plan.items, rows_without_grade: plan.rowsWithoutGrade });
      }
      return text(planMarkdown({ ...stored, column: sheet.column }, sheet, scale));
    }
  );

  server.registerTool(
    "educa_fill_grades",
    {
      title: "Escribir las notas (sin guardar)",
      description: `Escribe en los campos de Educa las notas de un plan de educa_preview_grades, solo las marcadas "se escribirá". NO guarda: los cambios quedan en pantalla para que el profesor los revise (en el Cuaderno de aula de Educa-Gestión aparecen los botones Aceptar/Cancelar; se guarda después con educa_save_grades). Comprueba antes que la tabla sigue siendo la misma (mismos alumnos) y después relee cada campo.

Úsala solo después de que el profesor haya visto la vista previa y dado el visto bueno.`,
      inputSchema: z.strictObject({
        plan_id: z.string().describe("plan_id devuelto por educa_preview_grades"),
        include_fuzzy: z.boolean().default(false).describe("Escribir también las filas emparejadas por nombre aproximado (solo si el profesor las ha confirmado)"),
        confirm_autosave: z.boolean().default(false).describe("Solo hace falta (true) en pantallas que guardan cada nota al elegirla, si alguna lo hiciera: confirma que el profesor ha autorizado que las notas queden guardadas")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ plan_id, include_fuzzy, confirm_autosave }) => {
      await requireLogin();
      const stored = plans.get(plan_id);
      if (!stored) throw new Error(`No existe el plan ${plan_id}. Genera uno con educa_preview_grades.`);
      if (Date.now() - stored.createdAt > 30 * 60_000) throw new Error("El plan tiene más de 30 minutos; vuelve a generar la vista previa por si la tabla ha cambiado.");

      let sheet = await browser.readGradeSheet(stored.column ?? undefined);
      if (sheet.autoSaves && !confirm_autosave) {
        throw new Error("En esta pantalla de Educa no hay botón Guardar: cada nota queda guardada en cuanto se elige. Enseña la vista previa al profesor y, solo si autoriza expresamente guardar, vuelve a llamar con confirm_autosave=true.");
      }
      const todo = stored.plan.items.filter(i => i.status === "cambia" && (include_fuzzy || !i.fuzzyMatch));
      // La tabla debe seguir teniendo a los mismos alumnos en las mismas filas
      for (const item of todo) {
        const row = sheet.rows.find(r => r.index === item.rowIndex);
        if (!row || row.name !== item.educaName || !row.field) {
          throw new Error(`La tabla de Educa ha cambiado desde la vista previa (no encuentro a ${item.educaName} en su fila). ¿Has cambiado de grupo, materia o evaluación? Vuelve a hacer educa_preview_grades.`);
        }
      }

      const results: { student: string; educaName: string; wanted: string; ok: boolean; note?: string }[] = [];
      for (const item of todo) {
        let row = sheet.rows.find(r => r.name === item.educaName)!;
        try {
          await browser.setField(row.field!.key, row.field!.tag, item.newValue!);
        } catch (e) {
          if (!(e instanceof FieldGone)) throw e;
          // La página se ha recargado tras un cambio (formularios con postback): relee y reintenta
          sheet = await browser.readGradeSheet(stored.column ?? undefined);
          row = sheet.rows.find(r => r.name === item.educaName)!;
          if (!row?.field) {
            results.push({ student: item.student, educaName: item.educaName!, wanted: item.newDisplay!, ok: false, note: "la fila desapareció tras recargar" });
            continue;
          }
          await browser.setField(row.field.key, row.field.tag, item.newValue!);
        }
        results.push({ student: item.student, educaName: item.educaName!, wanted: item.newDisplay!, ok: true });
      }

      // Verificación final releyendo la tabla
      sheet = await browser.readGradeSheet(stored.column ?? undefined);
      for (const r of results.filter(x => x.ok)) {
        const item = todo.find(i => i.educaName === r.educaName)!;
        const row = sheet.rows.find(x => x.name === r.educaName);
        if (!row?.field || row.field.value !== item.newValue) {
          r.ok = false;
          r.note = `tras escribir, el campo muestra "${row?.field?.valueText ?? "?"}"`;
        }
      }
      stored.filled = true;
      lastFilledPlan = stored;

      const ok = results.filter(r => r.ok).length;
      const skippedFuzzy = stored.plan.items.filter(i => i.status === "cambia" && i.fuzzyMatch && !include_fuzzy).length;
      const lines = [sheet.autoSaves ? `Puestas ${ok} de ${todo.length} notas. **Esta pantalla guarda cada nota al elegirla, así que ya están guardadas en Educa** (sin publicar ni cerrar la evaluación).` : `Escritas ${ok} de ${todo.length} notas en pantalla. **Todavía no se ha guardado nada en Educa.**`];
      for (const r of results.filter(x => !x.ok)) lines.push(`- ❌ ${r.educaName}: ${r.note}`);
      if (skippedFuzzy) lines.push(`- ${skippedFuzzy} filas con nombre aproximado no se han tocado (include_fuzzy=false).`);
      if (sheet.autoSaves) return text(lines.join("\n"));
      lines.push("", "Pide al profesor que revise la pantalla. Si está conforme, llama a educa_save_grades con confirm=true; si no, puede recargar la página en Educa para descartar los cambios.");
      return text(lines.join("\n"));
    }
  );

  server.registerTool(
    "educa_save_grades",
    {
      title: "Guardar las notas en Educa",
      description: `Pulsa el botón Guardar/Grabar de la pantalla de calificaciones para que Educa registre las notas escritas con educa_fill_grades. Hace una captura antes y otra después y devuelve el mensaje que muestre Educa.

IMPORTANTE: llama solo cuando el profesor haya dicho expresamente que guarde, y pasa confirm=true. No cierra ni firma la evaluación (eso debe hacerlo el profesor a mano).`,
      inputSchema: z.strictObject({
        confirm: z.literal(true).describe("Debe ser true: confirma que el profesor ha autorizado guardar")
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    },
    async () => {
      await requireLogin();
      if (!lastFilledPlan) throw new Error("No se ha rellenado ninguna nota en esta sesión. Usa educa_preview_grades y educa_fill_grades primero.");
      const before = await browser.screenshot("antes-de-guardar");
      const res = await browser.save();
      const after = await browser.screenshot("despues-de-guardar");
      const verdict =
        res.outcome === "ok" ? "✅ Educa confirma que se ha guardado." : res.outcome === "error" ? "❌ Educa muestra un error." : "❓ No he visto un mensaje claro de confirmación; comprueba la pantalla.";
      if (res.outcome !== "error") {
        plans.delete(lastFilledPlan.id);
        lastFilledPlan = null;
      }
      return {
        isError: res.outcome === "error",
        content: [{ type: "text", text: `Pulsado "${res.button}". ${verdict}${res.message ? `\nMensaje: ${res.message.slice(0, 500)}` : ""}\nCapturas: ${before} · ${after}\n\nRecuerda: el cierre o la firma de la evaluación los hace el profesor a mano en Educa.` }]
      };
    }
  );

  server.registerTool(
    "educa_close_browser",
    {
      title: "Cerrar el navegador",
      description: "Cierra la ventana del navegador que controla el servidor. La sesión puede quedar recordada en el perfil para la próxima vez.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async () => {
      await browser.close();
      plans.clear();
      lastFilledPlan = null;
      return text("Navegador cerrado.");
    }
  );

  return server;
}

serveStdio(createServer);
console.error(`educa-navarra-mcp ${PACKAGE_VERSION} en marcha (stdio). Configuración: ${configPath ?? "valores por defecto"}`);

const shutdown = async () => {
  await browser.close().catch(() => undefined);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
