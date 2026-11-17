/**
 * Herramientas MCP de partes de convivencia: vista previa (no escribe), rellenar en pantalla
 * (no guarda) y guardar (solo con confirmación expresa del docente).
 */
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { EducaBrowser } from "./browser.js";
import type { EducaConfig } from "./config.js";
import {
  CATEGORY_LABEL,
  cleanReport,
  draftProblems,
  formatDate,
  matchConduct,
  matchOption,
  normalizeTime,
  normativeFor,
  parseIncidentDate,
  REPORT_MAX_CHARS,
  type EducaConduct
} from "./convivencia.js";
import { normalize } from "./grades.js";
import { IncidentScreen, type IncidentCatalog } from "./incidents.js";

interface StoredIncident {
  id: string;
  createdAt: number;
  group: string;
  student: string;
  date: Date;
  place: string;
  sessionTime: string | null;
  conduct: EducaConduct;
  report: string;
  familyContacted: boolean;
  measure: string | null;
  filled: boolean;
}

type Content = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const text = (t: string): Content => ({ content: [{ type: "text", text: t }] });

export const INCIDENT_INSTRUCTIONS = `Partes de convivencia (informes de convivencia de Educa-Gestión):
1. Recoge del docente: grupo, alumno, qué pasó, cuándo (fecha y hora o sesión) y dónde. Si falta algo esencial, pregúntalo; no inventes hechos, palabras textuales ni testigos.
2. Redacta el relato de "Observaciones de lo sucedido" con tono formal y objetivo: tercera persona, hechos observables en orden (qué hizo y dijo el alumno, cómo respondió a las indicaciones del docente, qué medida inmediata se tomó), sin juicios sobre la persona, sin diagnósticos ni adjetivos valorativos, sin nombres de otros alumnos (usa "un compañero" o iniciales) y sin datos de salud o familiares que no hagan falta. Cita entre comillas las palabras textuales solo si el docente las da. Máximo ${REPORT_MAX_CHARS} caracteres; lo normal son 3 a 8 frases.
3. Clasifica la conducta con la lista que devuelve educa_preview_incident (es la de Educa; cada opción lleva su referencia al Decreto Foral 47/2010 de Navarra cuando se reconoce). Si dudas entre contraria y gravemente perjudicial, explica la duda al docente y que decida él.
4. educa_preview_incident y enseña al docente el parte completo tal cual se registrará (relato entero, conducta, fecha, sesión, espacio, contacto con la familia y medida). No escribe nada en Educa.
5. Si da el visto bueno, educa_fill_incident (rellena el formulario en pantalla, sin guardar) y pídele que lo revise en la ventana.
6. educa_save_incident con confirm=true solo tras un "sí, guárdalo" expreso en ese momento. Por defecto pulsa "Guardar" (el informe queda en borrador y el docente puede revisarlo y enviarlo desde Educa). Usa send=true ("Guardar y enviar") solo si el docente lo pide expresamente.`;

function catalogMarkdown(catalog: IncidentCatalog): string[] {
  const lines: string[] = [];
  for (const category of catalog.categories) {
    lines.push("", `**${category}**`);
    for (const c of catalog.conducts.filter(x => x.category === category)) {
      const n = normativeFor(c.label);
      lines.push(`- ${c.label}${n ? ` (${n.ref}): ${n.description}` : ""}`);
    }
  }
  return lines;
}

function sameStudent(a: string | null, b: string): boolean {
  return a !== null && normalize(a).split(" ").sort().join(" ") === normalize(b).split(" ").sort().join(" ");
}

export function registerIncidentTools(server: McpServer, browser: EducaBrowser, config: EducaConfig, requireLogin: () => Promise<void>): { reset: () => void } {
  const screen = new IncidentScreen(browser, config);
  const incidents = new Map<string, StoredIncident>();
  let lastFilled: StoredIncident | null = null;

  server.registerTool(
    "educa_preview_incident",
    {
      title: "Preparar un parte de convivencia (vista previa)",
      description: `Prepara un parte (informe de convivencia) para un alumno y devuelve la vista previa tal como se registrará. Abre en Educa-Gestión el formulario de "Nuevo informe" del alumno para comprobar que existe y leer las opciones reales del centro (espacios y tipos de conducta), pero NO escribe nada en él.

Si no indicas conducta, o no encaja con ninguna de Educa, devuelve la lista de conductas por categoría (con su referencia al Decreto Foral 47/2010 de convivencia de Navarra) para que elijas. El relato lo redactas tú a partir de lo que cuente el docente, con tono formal y objetivo (ver instrucciones del servidor).

Después: enseña la vista previa al docente y, si da el visto bueno, educa_fill_incident.`,
      inputSchema: z.strictObject({
        group: z.string().min(1).describe('Grupo del alumno, como en Educa o parte del nombre (p. ej. "ESO 3º D", "3ºDEFH", "BTO N 1ºA")'),
        student: z.string().min(1).describe('Alumno: nombre y apellido(s) en cualquier orden (p. ej. "Iker Muro")'),
        report: z.string().min(1).describe(`Relato formal de lo sucedido para "Observaciones de lo sucedido" (máximo ${REPORT_MAX_CHARS} caracteres)`),
        conduct: z.string().optional().describe('Tipo de conducta: el rótulo de Educa (p. ej. "FALTA DE RESPETO") o la referencia normativa (p. ej. "art. 14 g"). Omítelo para recibir la lista.'),
        date: z.string().default("hoy").describe('Fecha del suceso: dd/mm/aaaa, "hoy" o "ayer"'),
        place: z.string().default("Sesión presencial").describe('Espacio, como en Educa (p. ej. "Sesión presencial", "Recreo", "Pasillos")'),
        session_time: z.string().optional().describe('Hora de la sesión (p. ej. "12:40"). Si se omite, se usa la única sesión de ese día que el docente da al alumno.'),
        family_contacted: z.boolean().default(false).describe('Marca "Contacto con la familia" (solo si el docente ya ha hablado con la familia)'),
        measure: z.string().optional().describe("Propuesta de medida, si el docente la indica (se valida contra la lista de Educa al rellenar)"),
        response_format: z.enum(["markdown", "json"]).default("markdown")
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async args => {
      const date = parseIncidentDate(args.date);
      const sessionTime = args.session_time ? normalizeTime(args.session_time) : null;
      const problems = draftProblems({ group: args.group, student: args.student, date, place: args.place, sessionTime, conduct: args.conduct ?? "", report: args.report, familyContacted: args.family_contacted, measure: args.measure ?? null });
      if (args.session_time && !sessionTime) problems.push(`La hora "${args.session_time}" no se entiende: usa hh:mm, p. ej. 12:40.`);
      const blocking = problems.filter(p => !p.startsWith("La fecha tiene más de dos meses"));
      if (blocking.length) return { isError: true, content: [{ type: "text", text: `No preparo el parte todavía:\n${blocking.map(p => `- ${p}`).join("\n")}` }] };

      await requireLogin();
      const opened = await screen.openNewForm(args.group, args.student);
      const catalog = await screen.readCatalog();

      const place = matchOption(catalog.places, args.place);
      if (!place.ok) throw new Error(`El espacio "${args.place}" no está entre los de Educa: ${catalog.places.join(" / ")}`);

      const conduct = args.conduct ? matchConduct(catalog.conducts, args.conduct) : null;
      if (!conduct || !conduct.ok) {
        const lines = [
          args.conduct
            ? conduct && !conduct.ok && conduct.reason === "varios"
              ? `"${args.conduct}" encaja con varias conductas de Educa: ${conduct.candidates.map(c => c.label).join(" / ")}. Elige una.`
              : `"${args.conduct}" no coincide con ninguna conducta de Educa. Elige una de esta lista.`
            : "Falta el tipo de conducta. Estas son las que ofrece Educa en este centro:",
          ...catalogMarkdown(catalog),
          "",
          `Alumno encontrado: ${opened.student} (${opened.group}). Nada se ha escrito en Educa. Vuelve a llamar a educa_preview_incident con conduct=<rótulo>.`
        ];
        if (args.response_format === "json") return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: { needs_conduct: true, student: opened.student, group: opened.group, categories: catalog.categories, conducts: catalog.conducts.map(c => ({ ...c, normative: normativeFor(c.label) ?? null })), places: catalog.places } };
        return text(lines.join("\n"));
      }

      const stored: StoredIncident = {
        id: randomUUID().slice(0, 8),
        createdAt: Date.now(),
        group: opened.group,
        student: opened.student,
        date: date!,
        place: place.item,
        sessionTime,
        conduct: conduct.item,
        report: cleanReport(args.report),
        familyContacted: args.family_contacted,
        measure: args.measure?.trim() || null,
        filled: false
      };
      incidents.set(stored.id, stored);
      const norm = normativeFor(stored.conduct.label);
      const warnings = [...problems];
      if (opened.approximate) warnings.push(`El alumno se ha encontrado por nombre aproximado: confirma con el docente que es ${opened.student}.`);
      if (!/sesi[oó]n/i.test(stored.place) && sessionTime) warnings.push("Se ha indicado hora, pero el espacio elegido no suele pedir sesión; se ignorará si Educa no la pide.");

      if (args.response_format === "json") {
        return {
          content: [{ type: "text", text: JSON.stringify({ incident_id: stored.id }) }],
          structuredContent: {
            incident_id: stored.id,
            student: stored.student,
            group: stored.group,
            date: formatDate(stored.date),
            place: stored.place,
            session_time: stored.sessionTime,
            conduct: stored.conduct,
            normative: norm ?? null,
            family_contacted: stored.familyContacted,
            measure: stored.measure,
            report: stored.report,
            warnings
          }
        };
      }
      const lines = [
        `# Vista previa del parte (${stored.id})`,
        "",
        `- Alumno: **${stored.student}** (${stored.group})`,
        `- Fecha del suceso: ${formatDate(stored.date)}`,
        `- Espacio: ${stored.place}${/sesi[oó]n/i.test(stored.place) ? ` · sesión: ${stored.sessionTime ?? "la que das ese día a este alumno"}` : ""}`,
        `- Tipo de conducta: **${stored.conduct.label}** (${stored.conduct.category}${norm ? `; ${norm.ref} del DF 47/2010, ${CATEGORY_LABEL[norm.category]}` : ""})`,
        ...(norm ? [`  ${norm.description}`] : []),
        `- Contacto con la familia: ${stored.familyContacted ? "sí" : "no"}`,
        `- Propuesta de medida: ${stored.measure ?? "ninguna"}`,
        "",
        "**Observaciones de lo sucedido:**",
        "",
        ...stored.report.split("\n").map(l => `> ${l}`),
        "",
        `(${stored.report.length} de ${REPORT_MAX_CHARS} caracteres)`,
        ...(warnings.length ? ["", ...warnings.map(w => `- Aviso: ${w}`)] : []),
        "",
        "Nada se ha escrito en Educa. Enseña el parte completo al docente; si lo aprueba, llama a educa_fill_incident con este incident_id. Si pide cambios, vuelve a generar la vista previa."
      ];
      return text(lines.join("\n"));
    }
  );

  server.registerTool(
    "educa_fill_incident",
    {
      title: "Rellenar el parte en Educa (sin guardar)",
      description: `Rellena en Educa-Gestión el formulario del informe de convivencia con un parte de educa_preview_incident: fecha, espacio, sesión, relato, contacto con la familia, tipo de conducta y propuesta de medida. NO guarda: el formulario queda en pantalla para que el docente lo revise. Después relee lo escrito.

Úsala solo después de que el docente haya aprobado la vista previa.`,
      inputSchema: z.strictObject({ incident_id: z.string().describe("incident_id devuelto por educa_preview_incident") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ incident_id }) => {
      await requireLogin();
      const stored = incidents.get(incident_id);
      if (!stored) throw new Error(`No existe el parte ${incident_id}. Prepáralo con educa_preview_incident.`);
      if (Date.now() - stored.createdAt > 30 * 60_000) throw new Error("La vista previa tiene más de 30 minutos; vuelve a generarla.");
      // Formulario limpio del mismo alumno: si hay otro abierto (o ya tocado), se descarta y se abre uno nuevo
      if (!(await screen.isPristineFormFor(stored.student))) await screen.openNewForm(stored.group, stored.student);
      const res = await screen.fill({
        date: stored.date,
        place: stored.place,
        sessionTime: stored.sessionTime,
        report: stored.report,
        familyContacted: stored.familyContacted,
        conduct: stored.conduct,
        measure: stored.measure
      });
      stored.filled = true;
      lastFilled = stored;
      const lines = [
        `Parte de ${stored.student} rellenado en pantalla. **Todavía no se ha guardado nada en Educa.**`,
        "",
        `- Fecha: ${res.date}`,
        `- Espacio: ${res.place}${res.session ? ` · sesión: ${res.session}` : ""}`,
        `- Conducta: ${res.conduct}`,
        `- Relato: ${res.reportOk ? "escrito completo" : "revisar"}`,
        `- Contacto con la familia: ${res.familyContacted ? "sí" : "no"}`,
        `- Propuesta de medida: ${res.measure ?? "ninguna"}${!res.measure && res.measureOptions.length ? ` (Educa ofrece: ${res.measureOptions.join(" / ")})` : ""}`,
        ...res.warnings.map(w => `- Aviso: ${w}`),
        "",
        'Pide al docente que lo revise en la ventana del navegador. Si está conforme y lo dice expresamente, llama a educa_save_incident con confirm=true (queda guardado en borrador; send=true solo si pide "guardar y enviar"). Si no, puede pulsar Cancelar en Educa para descartarlo.'
      ];
      return text(lines.join("\n"));
    }
  );

  server.registerTool(
    "educa_save_incident",
    {
      title: "Guardar el parte en Educa",
      description: `Guarda en Educa el informe de convivencia rellenado con educa_fill_incident. Por defecto pulsa "Guardar": el informe queda registrado como borrador y el docente puede revisarlo y enviarlo desde Educa. Con send=true pulsa "Guardar y enviar" y describe el paso siguiente que muestre Educa, sin pulsar nada más. Hace capturas antes y después.

IMPORTANTE: llama solo cuando el docente haya dicho expresamente que lo guarde, y pasa confirm=true.`,
      inputSchema: z.strictObject({
        confirm: z.literal(true).describe("Debe ser true: confirma que el docente ha autorizado guardar el parte"),
        send: z.boolean().default(false).describe('true pulsa "Guardar y enviar" en vez de "Guardar" (solo si el docente lo pide)')
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    },
    async ({ send }) => {
      await requireLogin();
      if (!lastFilled) throw new Error("No se ha rellenado ningún parte en esta sesión. Usa educa_preview_incident y educa_fill_incident primero.");
      const current = await screen.openFormStudent();
      if (!sameStudent(current, lastFilled.student)) throw new Error(`El formulario abierto no es el del parte rellenado (${lastFilled.student}). Vuelve a usar educa_fill_incident.`);
      const before = await browser.screenshot("parte-antes-de-guardar");
      const res = await screen.save(send);
      const after = await browser.screenshot("parte-despues-de-guardar");
      const verdict = res.outcome === "ok" ? "Educa confirma que se ha guardado." : res.outcome === "error" ? "Educa muestra un error." : "No he visto un mensaje claro de confirmación; comprueba la pantalla.";
      const lines = [`Pulsado "${res.button}" en el parte de ${lastFilled.student}. ${verdict}`];
      if (res.message) lines.push(`Mensaje: ${res.message.slice(0, 500)}`);
      if (res.state) lines.push(`Estado del informe: ${res.state}`);
      if (res.step) lines.push(`Paso de Educa: ${res.step}`);
      if (send && res.outcome !== "error") lines.push("", "Lo que muestra Educa ahora (no he pulsado nada más):", await screen.stepSummary());
      lines.push(`Capturas: ${before} · ${after}`);
      if (!send && res.outcome !== "error") lines.push("", 'El informe queda en Educa → Gestión académica → Convivencia. Para que llegue a tutoría o jefatura, el docente puede abrirlo allí y pulsar "Guardar y enviar".');
      if (res.outcome !== "error") {
        incidents.delete(lastFilled.id);
        lastFilled = null;
      }
      return { isError: res.outcome === "error", content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  return {
    reset: () => {
      incidents.clear();
      lastFilled = null;
    }
  };
}
