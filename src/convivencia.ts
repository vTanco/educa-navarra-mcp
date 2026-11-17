/**
 * Partes de convivencia ("informes de convivencia" en Educa-Gestión): lógica pura,
 * sin navegador. Catálogo normativo de Navarra, emparejado de alumnos y conductas,
 * y validación del parte redactado antes de tocar Educa.
 */
import { normalize } from "./grades.js";

/** Límite del cuadro "Observaciones de lo sucedido" de Educa. */
export const REPORT_MAX_CHARS = 4000;

export type ConductCategory = "contraria" | "perjudicial";

export interface NormativeConduct {
  /** Artículo y letra del Decreto Foral 47/2010 (modificado por el DF 57/2014). */
  ref: string;
  category: ConductCategory;
  description: string;
  /** Rótulo con el que suele aparecer en Educa. La lista buena es siempre la que lee el conector. */
  educaLabel: string;
}

/**
 * Conductas del Decreto Foral 47/2010, de 23 de agosto, de derechos y deberes del alumnado y de la
 * convivencia en los centros educativos no universitarios de Navarra (modificado por el DF 57/2014).
 * Art. 14: contrarias a la convivencia. Art. 17: gravemente perjudiciales para la convivencia.
 * Las descripciones están resumidas; el texto legal manda. Los centros pueden concretarlas en su
 * reglamento de convivencia (art. 17.3), y Educa puede mostrar otra lista: el conector usa la de Educa.
 */
export const NORMATIVE_CONDUCTS: NormativeConduct[] = [
  { ref: "art. 14 a)", category: "contraria", educaLabel: "NO ESTUDIA", description: "No cumplir el deber de estudio o perturbar la clase dificultando el estudio de los compañeros." },
  { ref: "art. 14 b)", category: "contraria", educaLabel: "NO JUSTIFICA", description: "Faltas de puntualidad o de asistencia sin justificar." },
  { ref: "art. 14 c)", category: "contraria", educaLabel: "NO TRAE MATERIAL", description: "Acudir de forma reiterada a clase sin el material necesario, por causas imputables al alumno." },
  { ref: "art. 14 d)", category: "contraria", educaLabel: "ACTITUD PASIVA", description: "No realizar de forma continuada las tareas, en casa o en clase." },
  { ref: "art. 14 e)", category: "contraria", educaLabel: "COPIA", description: "Copiar o dejar copiar en exámenes, trabajos o tareas." },
  { ref: "art. 14 f)", category: "contraria", educaLabel: "CONTRA DIGNIDAD", description: "Manifestaciones expresas contrarias a la dignidad de las personas, a los derechos democráticos o al proyecto educativo." },
  { ref: "art. 14 g)", category: "contraria", educaLabel: "FALTA DE RESPETO", description: "Falta de respeto a la autoridad del profesorado o desobediencia al personal del centro." },
  { ref: "art. 14 h)", category: "contraria", educaLabel: "DESCONSIDERACIÓN", description: "Trato incorrecto o desconsiderado hacia miembros de la comunidad educativa o el personal del centro." },
  { ref: "art. 14 i)", category: "contraria", educaLabel: "INASISTENCIA GRUPAL", description: "Participar en ausencias colectivas de clase no autorizadas." },
  { ref: "art. 14 j)", category: "contraria", educaLabel: "INFORMACIÓN FALSA", description: "Faltar deliberadamente a la verdad ante el personal del centro, sin perjuicio grave para nadie." },
  { ref: "art. 14 k)", category: "contraria", educaLabel: "LLEVAR SIN AUTORIZACIÓN", description: "Llevar o usar sin autorización objetos prohibidos (por ejemplo, el móvil cuando no está permitido)." },
  { ref: "art. 14 l)", category: "contraria", educaLabel: "UTILIZAR SIN AUTORIZACIÓN", description: "Usar espacios o equipos del centro sin autorización o con fines no educativos." },
  { ref: "art. 14 m)", category: "contraria", educaLabel: "INDUMENTARIA", description: "Incumplir las normas del centro sobre indumentaria." },
  { ref: "art. 14 n)", category: "contraria", educaLabel: "HIGIENE", description: "Descuido reiterado y voluntario de la higiene y el aseo personal." },
  { ref: "art. 14 ñ)", category: "contraria", educaLabel: "DETERIORO DE INSTALACIÓN", description: "Causar intencionadamente daños leves en instalaciones, materiales, transporte o pertenencias ajenas." },
  { ref: "art. 14 o)", category: "contraria", educaLabel: "PERJUDICAR LIMPIEZA", description: "Perjudicar la limpieza de las instalaciones o su entorno, incluidas pintadas." },
  { ref: "art. 14 p)", category: "contraria", educaLabel: "CONSUMIR TABACO O ALCOHOL", description: "Fumar o beber alcohol en el centro, en el transporte escolar o en actividades del centro." },
  { ref: "art. 14 q)", category: "contraria", educaLabel: "NO ENTREGAR A FAMILIA", description: "No entregar o no comunicar a la familia la información del centro." },
  { ref: "art. 14 r)", category: "contraria", educaLabel: "OTRA CUALQUIERA", description: "Cualquier otra incorrección que altere la actividad del centro sin ser gravemente perjudicial." },
  { ref: "art. 17.1 a)", category: "perjudicial", educaLabel: "OFENSA O AGRESIÓN GRAVE", description: "Injurias, amenazas, violencia, acoso o agresiones a miembros de la comunidad educativa, con especial gravedad si tienen componente sexual, racial, xenófobo o se dirigen a alumnado vulnerable." },
  { ref: "art. 17.1 b)", category: "perjudicial", educaLabel: "GRABACIÓN", description: "Grabar sin autorización clases o actividades, o escenas de la vida privada." },
  { ref: "art. 17.1 c)", category: "perjudicial", educaLabel: "DIFUNDE IMAGEN", description: "Difundir por cualquier medio esas grabaciones o conductas." },
  { ref: "art. 17.1 d)", category: "perjudicial", educaLabel: "DETERIORO MATERIAL", description: "Causar intencionadamente daños graves en bienes del centro o pertenencias ajenas." },
  { ref: "art. 17.1 e)", category: "perjudicial", educaLabel: "AGRESIÓN", description: "Conductas temerarias que pongan en riesgo la integridad física de otras personas." },
  { ref: "art. 17.1 f)", category: "perjudicial", educaLabel: "FALSIFICAR", description: "Faltar deliberadamente a la verdad con perjuicio grave para alguien." },
  { ref: "art. 17.1 g)", category: "perjudicial", educaLabel: "SUSTRAER", description: "Sustraer pertenencias del centro o de otras personas." },
  { ref: "art. 17.1 h)", category: "perjudicial", educaLabel: "SUPLANTAR", description: "Suplantar la personalidad, falsificar o sustraer documentos académicos o material de examen." },
  { ref: "art. 17.1 i)", category: "perjudicial", educaLabel: "NO COMUNICAR", description: "Conocer conductas gravemente perjudiciales y no comunicarlas al equipo directivo." },
  { ref: "art. 17.1 j)", category: "perjudicial", educaLabel: "INSUBORDINACIÓN", description: "Insubordinación, en especial incumplir las medidas impuestas." },
  { ref: "art. 17.1 k)", category: "perjudicial", educaLabel: "APOLOGÍA", description: "Carteles, pintadas o escritos que atenten contra los derechos constitucionales o hagan apología del terrorismo." },
  { ref: "art. 17.1 l)", category: "perjudicial", educaLabel: "DROGAS / ALCOHOL", description: "Consumir o traficar con drogas, fumar o beber alcohol de forma reiterada en el centro, o incitar a ello." },
  { ref: "art. 17.1 m)", category: "perjudicial", educaLabel: "REITERAR CONDUCTA", description: "Reiterar conductas contrarias a la convivencia." },
  { ref: "art. 17.1 n)", category: "perjudicial", educaLabel: "IMPEDIR ACTIVIDADES", description: "Cualquier acto dirigido directamente a impedir el normal desarrollo de las actividades del centro." },
  { ref: "art. 17.1 ñ)", category: "perjudicial", educaLabel: "INCUMPLIMIENTO DE COMPROMISOS", description: "Incumplir los compromisos de convivencia firmados." },
  { ref: "art. 17.2", category: "perjudicial", educaLabel: "INCITAR", description: "Incitar a otros alumnos a cometer conductas gravemente perjudiciales." }
];

export const CATEGORY_LABEL: Record<ConductCategory, string> = {
  contraria: "contraria a la convivencia",
  perjudicial: "gravemente perjudicial para la convivencia"
};

/** Conducta tal como la lista Educa en el diálogo "Añadir conducta". */
export interface EducaConduct {
  label: string;
  /** Casilla de categoría bajo la que aparece en Educa ("Conductas contrarias", "Conductas perjudiciales"...). */
  category: string;
}

/** Referencia normativa que corresponde a un rótulo de Educa, si se reconoce. */
export function normativeFor(label: string): NormativeConduct | undefined {
  const n = normalize(label);
  return NORMATIVE_CONDUCTS.find(c => normalize(c.educaLabel) === n);
}

export type Match<T> = { ok: true; item: T; approximate: boolean } | { ok: false; reason: "ninguno" | "varios"; candidates: T[] };

/**
 * Empareja un nombre dicho por el docente ("Iker Muro", "Muro, Iker", "iker") con los de Educa
 * ("Muro Pérez, Iker"). Exige que todas las palabras dichas estén en el nombre de Educa.
 */
export function matchStudent(names: string[], wanted: string): Match<string> {
  const words = normalize(wanted).split(" ").filter(Boolean);
  if (!words.length) return { ok: false, reason: "ninguno", candidates: [] };
  const exact = names.filter(n => normalize(n).split(" ").sort().join(" ") === [...words].sort().join(" "));
  if (exact.length === 1) return { ok: true, item: exact[0], approximate: false };
  const all = names.filter(n => {
    const have = normalize(n).split(" ");
    return words.every(w => have.includes(w));
  });
  if (all.length === 1) return { ok: true, item: all[0], approximate: false };
  if (all.length > 1) return { ok: false, reason: "varios", candidates: all };
  // Aproximado: palabras que empiezan igual (abreviaturas, nombres compuestos)
  const prefix = names.filter(n => {
    const have = normalize(n).split(" ");
    return words.every(w => have.some(h => h.startsWith(w) || (w.length >= 4 && w.startsWith(h))));
  });
  if (prefix.length === 1) return { ok: true, item: prefix[0], approximate: true };
  return { ok: false, reason: prefix.length ? "varios" : "ninguno", candidates: prefix };
}

/**
 * Elige la conducta de Educa a partir de lo que diga el modelo: el rótulo exacto, parte de él
 * o una referencia normativa ("art. 14 g", "14g", "17.1 a").
 */
export function matchConduct(options: EducaConduct[], wanted: string): Match<EducaConduct> {
  const w = normalize(wanted);
  if (!w) return { ok: false, reason: "ninguno", candidates: [] };
  const exact = options.filter(o => normalize(o.label) === w);
  if (exact.length === 1) return { ok: true, item: exact[0], approximate: false };
  const ref = parseRef(wanted);
  if (ref) {
    const norm = NORMATIVE_CONDUCTS.find(c => parseRef(c.ref) === ref);
    const hit = norm ? options.filter(o => normalize(o.label) === normalize(norm.educaLabel)) : [];
    if (hit.length === 1) return { ok: true, item: hit[0], approximate: false };
  }
  const partial = options.filter(o => ` ${normalize(o.label)} `.includes(` ${w} `));
  if (partial.length === 1) return { ok: true, item: partial[0], approximate: false };
  return { ok: false, reason: partial.length > 1 ? "varios" : "ninguno", candidates: partial };
}

/** "art. 14 g)" / "14g" / "17.1 a" / "17.2" -> "14g" / "17a" / "17.2" */
function parseRef(text: string): string | null {
  const m = normalize(text).replace(/^art(iculo)?\s*/, "").match(/^(14|17)(?:\s*1)?\s*([a-zñ])?$/) ?? normalize(text).replace(/^art(iculo)?\s*/, "").match(/^(17)\s*(2)$/);
  if (!m) return null;
  if (m[1] === "17" && m[2] === "2") return "17.2";
  return m[2] ? `${m[1]}${m[2]}` : null;
}

/** Elige una opción de una lista por texto exacto o parcial, sin tildes ni mayúsculas. */
export function matchOption(options: string[], wanted: string): Match<string> {
  const w = normalize(wanted);
  const exact = options.filter(o => normalize(o) === w);
  if (exact.length === 1) return { ok: true, item: exact[0], approximate: false };
  const partial = options.filter(o => normalize(o).includes(w));
  if (partial.length === 1) return { ok: true, item: partial[0], approximate: false };
  return { ok: false, reason: partial.length > 1 ? "varios" : "ninguno", candidates: partial };
}

/** Acepta "16/11/2026", "16-11-2026", "2026-11-16", "hoy" y "ayer". Devuelve la fecha local sin hora. */
export function parseIncidentDate(text: string | undefined, today = new Date()): Date | null {
  const t = (text ?? "hoy").trim().toLowerCase();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (t === "hoy") return base;
  if (t === "ayer") return new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1);
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  let d: Date | null = null;
  if (m) d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!d || Number.isNaN(d.getTime())) return null;
  // Rechaza fechas imposibles como 31/02 (Date las desplaza al mes siguiente)
  const parts = t.includes("/") || /^\d{1,2}[.-]/.test(t) ? t.split(/[/.-]/).map(Number) : null;
  if (parts && (d.getDate() !== parts[0] || d.getMonth() !== parts[1] - 1)) return null;
  return d;
}

export function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Limpia el texto del parte: sin espacios sobrantes ni más de una línea en blanco seguida. */
export function cleanReport(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(l => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "12:40", "12.40", "12h40" -> "12:40"; null si no parece una hora. */
export function normalizeTime(text: string | undefined): string | null {
  const m = (text ?? "").trim().match(/^(\d{1,2})\s*[:.h]\s*(\d{2})$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export interface SessionRow {
  time: string;
  subject: string;
  teacher: string;
  /** Sesión que imparte el propio docente (Educa la marca). */
  mine: boolean;
}

/** Elige la sesión del día: por hora de inicio si se indica; si no, la única que imparte el docente. */
export function pickSession(rows: SessionRow[], time: string | null): { ok: true; index: number } | { ok: false; message: string } {
  const list = rows.map(r => `${r.time} ${r.subject}${r.mine ? " (tuya)" : ""}`).join(" · ") || "(ninguna)";
  if (time) {
    // Hora de inicio exacta; si no, la sesión en curso a esa hora
    const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    const spans = rows.map(r => (r.time.match(/\d{1,2}:\d{2}/g) ?? []).map(t => toMin(t.padStart(5, "0"))));
    let i = spans.findIndex(s => s[0] === toMin(time));
    if (i < 0) i = spans.findIndex(s => s.length === 2 && s[0] <= toMin(time) && toMin(time) < s[1]);
    if (i >= 0) return { ok: true, index: i };
    return { ok: false, message: `Ese día el alumno no tiene ninguna sesión que empiece a las ${time}. Sesiones: ${list}` };
  }
  const mine = rows.map((r, i) => (r.mine ? i : -1)).filter(i => i >= 0);
  if (mine.length === 1) return { ok: true, index: mine[0] };
  return { ok: false, message: mine.length ? `Ese día das varias sesiones a este alumno; indica la hora (session_time). Sesiones: ${list}` : `Ese día no das clase a este alumno según Educa; indica la hora de la sesión (session_time) o elige otro espacio. Sesiones: ${list}` };
}

export interface IncidentDraft {
  group: string;
  student: string;
  date: Date;
  place: string;
  sessionTime: string | null;
  conduct: string;
  report: string;
  familyContacted: boolean;
  measure: string | null;
}

/** Problemas del borrador que no dependen de Educa. */
export function draftProblems(draft: Omit<IncidentDraft, "date"> & { date: Date | null }, today = new Date()): string[] {
  const out: string[] = [];
  if (!draft.date) out.push('La fecha no se entiende: usa dd/mm/aaaa, "hoy" o "ayer".');
  else {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (draft.date.getTime() > t.getTime()) out.push("La fecha del suceso no puede ser posterior a hoy.");
    if (t.getTime() - draft.date.getTime() > 60 * 86_400_000) out.push("La fecha tiene más de dos meses: Educa puede no ofrecer esas sesiones. Revísala con el docente.");
  }
  const report = cleanReport(draft.report);
  if (report.length < 40) out.push("El relato de lo sucedido es demasiado corto: describe qué pasó, cuándo y dónde.");
  if (report.length > REPORT_MAX_CHARS) out.push(`El relato tiene ${report.length} caracteres y Educa admite ${REPORT_MAX_CHARS}. Resúmelo.`);
  return out;
}
