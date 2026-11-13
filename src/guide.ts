/**
 * Ayudas para el docente que no dependen de Educa:
 *  - instrucciones del servidor (cómo debe trabajar Claude con este conector),
 *  - la carpeta de notas y la herramienta que lista sus ficheros,
 *  - prompts listos para usar desde el menú de Claude.
 *
 * Resumen de docs/BUENAS-PRACTICAS.md: si cambias una, revisa la otra.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, relative } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

/** Carpeta donde el docente guarda sus Excel/CSV de notas. */
export function notesDir(): string {
  const env = process.env.EDUCA_NOTES_DIR?.trim();
  if (env && !env.startsWith("${")) return env.replace(/^~(?=$|[\\/])/, homedir());
  return join(homedir(), "Documents", "Notas Educa");
}

export const SERVER_INSTRUCTIONS = `Conector no oficial para meter notas de evaluación en Educa (Gobierno de Navarra) desde el Excel o CSV del docente. Quien lo usa suele ser un docente sin conocimientos técnicos: háblale claro y en español, sin jerga.

Flujo:
1. Averigua grupo, materia y evaluación. Si falta algo, pregúntalo antes de abrir Educa.
2. Busca el fichero con educa_list_grade_files (carpeta de notas del docente). Los ficheros suelen llamarse EVALUACIÓN_GRUPO_MATERIA, p. ej. "1EV_BTO-1A_TIC.xlsx". Si hay varios candidatos o ninguno, pregunta; no adivines. Si el docente adjunta el fichero en el chat en vez de dejarlo en la carpeta, puedes pasar las notas directamente a educa_preview_grades.
3. educa_login, y navega a Educa-Gestión → Cuaderno de aula → Calificaciones (educa_inspect_page, educa_click, educa_select_filter). Elige grupo y materia exactamente como los nombra el docente.
4. educa_preview_grades y enseña la tabla completa: alumnos sin emparejar, nombres aproximados, notas rechazadas y alumnos de Educa sin nota. No cambia nada.
5. Solo si el docente da el visto bueno, educa_fill_grades (escribe en pantalla sin guardar). Pídele que lo revise en la ventana del navegador.
6. educa_save_grades únicamente tras una confirmación expresa del docente en este momento ("sí, guarda"). Nunca la des por supuesta.

Reglas:
- No redondees ni inventes notas: si una nota no vale para la escala de la pantalla, díselo y que la corrija en su fichero.
- Las coincidencias de nombre aproximadas no se escriben sin confirmación.
- Nunca cierres, firmes, bloquees ni publiques una evaluación: eso lo hace el docente a mano.
- Minimiza los datos personales en el chat: no pidas capturas ni volcados de la página si no hacen falta.
- La sesión de Educa caduca a los 30-40 minutos; si caduca, vuelve a llamar a educa_login.
- Si el docente pregunta cómo preparar sus ficheros, resume esto: una hoja por grupo y materia, la primera fila con cabeceras (Alumno o Apellidos + Nombre, y Nota), un alumno por fila con el nombre igual que en Educa, notas enteras (o IN/SU/BI/NT/SB en ESO), celdas vacías para quien no tenga nota, nombre de fichero EVALUACIÓN_GRUPO_MATERIA y todos en la carpeta de notas. Guía completa: https://github.com/vTanco/educa-navarra-mcp/blob/main/docs/BUENAS-PRACTICAS.md`;

const GRADE_EXTENSIONS = new Set([".xlsx", ".csv"]);
const MAX_DEPTH = 3;
const MAX_FILES = 300;

interface GradeFile {
  file: string;
  path: string;
  folder: string;
  modified: string;
  /** Pistas sacadas del nombre EVALUACIÓN_GRUPO_MATERIA, si sigue la convención. */
  evaluation?: string;
  group?: string;
  subject?: string;
}

function listFiles(root: string): GradeFile[] {
  const out: GradeFile[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (out.length >= MAX_FILES) return;
      if (name.startsWith(".") || name.startsWith("~$")) continue; // ocultos y temporales de Excel
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (depth < MAX_DEPTH) walk(full, depth + 1);
      } else if (GRADE_EXTENSIONS.has(extname(name).toLowerCase())) {
        const parts = basename(name, extname(name)).split("_").map(p => p.trim()).filter(Boolean);
        out.push({
          file: name,
          path: full,
          folder: relative(root, dir) || ".",
          modified: st.mtime.toISOString().slice(0, 16).replace("T", " "),
          ...(parts.length >= 3 ? { evaluation: parts[0], group: parts[1], subject: parts.slice(2).join(" ") } : {})
        });
      }
    }
  };
  walk(root, 0);
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}

type Content = { content: { type: "text"; text: string }[] };
const text = (t: string): Content => ({ content: [{ type: "text", text: t }] });

export function registerGuide(server: McpServer): void {
  server.registerTool(
    "educa_list_grade_files",
    {
      title: "Ver mis ficheros de notas",
      description: `Lista los Excel (.xlsx) y CSV de la carpeta de notas del docente (y sus subcarpetas), del más reciente al más antiguo, con la ruta completa para educa_load_grades_file o educa_preview_grades. Si el nombre sigue la convención EVALUACIÓN_GRUPO_MATERIA (p. ej. "1EV_BTO-1A_TIC.xlsx"), devuelve también esas tres partes para elegir el fichero que encaja con lo que pide el docente. No toca Educa.`,
      inputSchema: z.strictObject({
        filter: z.string().optional().describe("Texto que debe aparecer en el nombre o la carpeta (sin distinguir mayúsculas ni tildes), p. ej. '1A' o 'TIC'")
      }),
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ filter }) => {
      const root = notesDir();
      if (!existsSync(root)) {
        return text(
          `La carpeta de notas no existe: ${root}\n\n` +
            `Pide al docente que la cree y guarde ahí sus Excel, o que te diga dónde están sus ficheros. ` +
            `En Claude Desktop se puede cambiar en Ajustes → Extensiones → Educa Navarra → Carpeta de notas; en otras aplicaciones, con la variable EDUCA_NOTES_DIR.`
        );
      }
      const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      let files = listFiles(root);
      if (filter) files = files.filter(f => norm(`${f.folder}/${f.file}`).includes(norm(filter)));
      const lines = [`Carpeta de notas: ${root}`, ""];
      if (!files.length) {
        lines.push(filter ? `No hay ficheros .xlsx o .csv que contengan "${filter}".` : "No hay ficheros .xlsx o .csv.");
        return text(lines.join("\n"));
      }
      lines.push("| Fichero | Carpeta | Evaluación | Grupo | Materia | Modificado |", "|---|---|---|---|---|---|");
      for (const f of files) lines.push(`| ${f.file} | ${f.folder} | ${f.evaluation ?? "—"} | ${f.group ?? "—"} | ${f.subject ?? "—"} | ${f.modified} |`);
      lines.push("", "Rutas completas:", ...files.map(f => `- ${f.path}`));
      if (files.length >= MAX_FILES) lines.push("", `(Mostrando los ${MAX_FILES} primeros; usa filter para acotar.)`);
      return text(lines.join("\n"));
    }
  );

  server.registerPrompt(
    "meter_notas",
    {
      title: "Meter notas en Educa",
      description: "Mete las notas de un grupo y materia desde tu Excel, con vista previa antes de guardar.",
      argsSchema: z.object({
        grupo: z.string().describe("Grupo, como aparece en Educa (p. ej. BTO N 1ºA, ESO 3ºDEFH cd)"),
        materia: z.string().describe("Materia o módulo (p. ej. TIC, Matemáticas)"),
        evaluacion: z.string().describe("Evaluación (p. ej. 1ª evaluación, final, extraordinaria)")
      })
    },
    ({ grupo, materia, evaluacion }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Quiero meter en Educa las notas de ${evaluacion} de ${grupo}, ${materia}. Busca el fichero en mi carpeta de notas, enséñame la vista previa y no guardes nada hasta que yo te lo diga.`
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "revisar_notas",
    {
      title: "Revisar mis notas en Educa",
      description: "Lee las notas que hay ahora en Educa para un grupo y materia, sin cambiar nada.",
      argsSchema: z.object({
        grupo: z.string().describe("Grupo, como aparece en Educa"),
        materia: z.string().describe("Materia o módulo")
      })
    },
    ({ grupo, materia }) => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: `Abre Educa y enséñame las notas que hay ahora en ${grupo}, ${materia}. Solo lectura: no cambies nada.` }
        }
      ]
    })
  );

  server.registerPrompt(
    "preparar_excel",
    {
      title: "Cómo preparo mi Excel de notas",
      description: "Consejos para preparar el fichero de notas y dónde guardarlo."
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Explícame en pocos pasos cómo debo preparar y guardar mis Excel de notas para que el conector de Educa los encuentre y los entienda sin problemas. Mi carpeta de notas es: ${notesDir()}`
          }
        }
      ]
    })
  );
}
