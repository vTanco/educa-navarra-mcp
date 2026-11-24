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
import { INCIDENT_INSTRUCTIONS } from "./incident-tools.js";

/** Carpeta donde el docente guarda sus Excel/CSV de notas. */
export function notesDir(): string {
  const env = process.env.EDUCA_NOTES_DIR?.trim();
  if (env && !env.startsWith("${")) return env.replace(/^~(?=$|[\\/])/, homedir());
  return join(homedir(), "Documents", "Notas Educa");
}

export const SERVER_INSTRUCTIONS = `Conector no oficial para meter notas de evaluación en Educa (Gobierno de Navarra) desde el Excel o CSV del docente, y para redactar y registrar partes de convivencia. Quien lo usa suele ser un docente sin conocimientos técnicos: háblale claro y en español, sin jerga.

Flujo:
1. Averigua grupo, materia y evaluación. Si falta algo, pregúntalo antes de abrir Educa.
2. Busca el fichero con educa_list_grade_files (carpeta de notas del docente). Los ficheros suelen llamarse EVALUACIÓN_GRUPO_MATERIA, p. ej. "1EV_BTO-1A_TIC.xlsx". Si hay varios candidatos o ninguno, pregunta; no adivines. Si el docente adjunta el fichero en el chat en vez de dejarlo en la carpeta, puedes pasar las notas directamente a educa_preview_grades.
3. educa_login y abre la pantalla de notas con educa_open_group (grupo, materia y evaluación; vale el nombre parcial). Si el grupo no aparece, educa_refresh_groups relee los grupos del docente desde Educa. Solo si eso falla, navega a mano: Educa-Gestión → Cuaderno de aula → Calificaciones (educa_inspect_page, educa_click, educa_select_filter).
4. educa_preview_grades y enseña la tabla completa: alumnos sin emparejar, nombres aproximados, notas rechazadas y alumnos de Educa sin nota. No cambia nada.
5. Solo si el docente da el visto bueno, educa_fill_grades (escribe en pantalla sin guardar). Pídele que lo revise en la ventana del navegador.
6. educa_save_grades únicamente tras una confirmación expresa del docente en este momento ("sí, guarda"). Nunca la des por supuesta.

Modo privado (activado por defecto; las respuestas lo indican con "Modo privado" o private_mode):
- Los alumnos aparecen con códigos (A01, A02...). Úsalos tal cual; no pidas al docente nombres, NIA ni notas por el chat, y no intentes adivinar quién es cada código.
- La vista previa completa, con nombres y observaciones, se abre en una pestaña del navegador del conector, solo en el ordenador del docente. Pídele que la revise allí y enséñale en el chat el resumen y los avisos con códigos.
- Para las observaciones que redactes a petición del docente, usa {nombre} donde vaya el nombre del alumno: el conector lo sustituye en local por su nombre de pila.
- En los partes, deja que el docente elija al alumno en la ventana de Educa (educa_preview_incident sin student) y no pongas nombres de alumnos en el relato.
- Si el docente escribe un nombre en el chat, no lo repitas: refiérete al alumno por su código.

Reglas:
- No redondees ni inventes notas: si una nota no vale para la escala de la pantalla, díselo y que la corrija en su fichero.
- Las coincidencias de nombre aproximadas no se escriben sin confirmación.
- Observaciones para las familias: si el fichero tiene una columna "Observaciones" (o el docente te dicta los comentarios), educa_preview_grades las prepara junto a la nota; un alumno puede llevar solo observación. Enséñale el texto antes de escribirlo y no lo redactes ni lo cambies por tu cuenta salvo que te lo pida. Las observaciones que ya hay en Educa no se sustituyen salvo que el docente lo pida (overwrite_comments=true).
- Nunca cierres, firmes, bloquees ni publiques una evaluación: eso lo hace el docente a mano.
- Minimiza los datos personales en el chat: no pidas capturas ni volcados de la página si no hacen falta.
- Los grupos de "Grupos en los que no pongo notas" se pueden consultar, pero no prepares ni escribas notas en ellos.
- La sesión de Educa caduca a los 30-40 minutos; si caduca, vuelve a llamar a educa_login.
- Si el docente pregunta cómo preparar sus ficheros, resume esto: una hoja por grupo y materia, la primera fila con cabeceras (Alumno o Apellidos + Nombre, y Nota), un alumno por fila con el nombre igual que en Educa, notas enteras (o IN/SU/BI/NT/SB en ESO), celdas vacías para quien no tenga nota, una columna opcional "Observaciones" con el comentario para las familias, nombre de fichero EVALUACIÓN_GRUPO_MATERIA y todos en la carpeta de notas. Guía completa: https://github.com/vTanco/educa-navarra-mcp/blob/main/docs/BUENAS-PRACTICAS.md

${INCIDENT_INSTRUCTIONS}`;

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
    "poner_parte",
    {
      title: "Poner un parte de convivencia",
      description: "Redacta un parte a partir de lo que cuentes y lo registra en Educa tras tu visto bueno.",
      argsSchema: z.object({
        grupo: z.string().describe("Grupo del alumno (p. ej. ESO 3º D)"),
        alumno: z.string().optional().describe("Opcional. Con el modo privado, déjalo vacío y elige al alumno en la ventana de Educa"),
        que_paso: z.string().describe("Qué ha pasado, cuándo y dónde, con tus palabras")
      })
    },
    ({ grupo, alumno, que_paso }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Quiero poner un parte en Educa a ${alumno?.trim() ? alumno : "un alumno (lo elegiré en la ventana de Educa)"}, de ${grupo}. Lo que ha pasado: ${que_paso}\n\nRedáctalo con tono formal, propón el tipo de conducta y enséñame la vista previa. No guardes nada hasta que yo te lo diga.`
          }
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
