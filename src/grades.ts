/**
 * Lógica pura (sin navegador): leer el fichero de notas, emparejar alumnos
 * con las filas de Educa y convertir cada nota al valor que espera el campo.
 */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import ExcelJS from "exceljs";
import type { EducaConfig } from "./config.js";

// ---------- Tipos compartidos con browser.ts ----------

export interface FieldOption {
  value: string;
  text: string;
}

export interface SheetField {
  /** Marca data-educa-mcp puesta en el elemento al leer la tabla. */
  key: string;
  tag: "select" | "input" | "textarea" | "pselect";
  type: string;
  header: string;
  value: string;
  /** Texto visible del valor actual (para <select>, el texto de la opción). */
  valueText: string;
  disabled: boolean;
  /** Opciones del desplegable. En un campo tecleado: valores no numéricos que ofrece además (p. ej. FPEX). */
  options?: FieldOption[];
  /** Límites que declara el propio campo (input type=number min/max), si los hay. */
  min?: number;
  max?: number;
}

export interface SheetRow {
  index: number;
  name: string;
  studentId?: string;
  field: SheetField | null;
}

export interface GradeSheet {
  frameUrl: string;
  headers: string[];
  column: string | null;
  rows: SheetRow[];
  /** Cabeceras de las columnas que tienen campos editables (para elegir columna). */
  editableColumns: string[];
  /** true si la pantalla guarda cada nota al elegirla (no hay botón Guardar), como en Educa-Gestión. */
  autoSaves?: boolean;
  /** Texto de la pantalla que identifica grupo y materia (para deducir la etapa). */
  context?: string;
}

export interface InputGrade {
  student: string;
  grade: string;
  id?: string;
}

// ---------- Normalización de nombres ----------

const STOPWORDS = new Set(["de", "del", "la", "las", "los", "y", "i", "e", "san"]);

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

function significant(text: string): string[] {
  return tokens(text).filter(t => !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((t, i) => t === sb[i]);
}

function isSubset(small: string[], big: string[]): boolean {
  const pool = [...big];
  for (const t of small) {
    const i = pool.indexOf(t);
    if (i === -1) return false;
    pool.splice(i, 1);
  }
  return true;
}

// ---------- Lectura del fichero de notas ----------

const NAME_HEADERS = ["alumno", "alumna", "alumnado", "nombre completo", "estudiante", "nombre y apellidos", "apellidos y nombre", "apellidos, nombre"];
const SURNAME_HEADERS = ["apellidos", "apellido"];
const FIRSTNAME_HEADERS = ["nombre"];
const GRADE_HEADERS = ["nota final", "nota", "calificacion final", "calificacion", "final", "media", "nota evaluacion"];
const ID_HEADERS = ["nia", "id", "codigo", "dni", "n lista", "numero"];

function findHeader(headers: string[], wanted: string[], explicit?: string): number {
  if (explicit) {
    const target = normalize(explicit);
    const i = headers.findIndex(h => normalize(h) === target);
    if (i === -1) throw new Error(`No hay ninguna columna llamada "${explicit}". Columnas del fichero: ${headers.join(" | ")}`);
    return i;
  }
  for (const w of wanted) {
    const i = headers.findIndex(h => normalize(h) === normalize(w));
    if (i !== -1) return i;
  }
  for (const w of wanted) {
    const i = headers.findIndex(h => normalize(h).includes(normalize(w)));
    if (i !== -1) return i;
  }
  return -1;
}

export interface ParseOptions {
  sheet?: string;
  nameColumn?: string;
  gradeColumn?: string;
  idColumn?: string;
}

export async function parseGradesFile(path: string, opts: ParseOptions = {}): Promise<{ grades: InputGrade[]; headers: string[]; skipped: string[] }> {
  const ext = extname(path).toLowerCase();
  let table: string[][];
  if (ext === ".xlsx") table = await readXlsx(path, opts.sheet);
  else if (ext === ".csv" || ext === ".txt" || ext === ".tsv") table = parseCsv(await readFile(path, "utf8"));
  else throw new Error(`Formato no soportado (${ext || "sin extensión"}). Usa .xlsx o .csv (si tienes un .xls u .ods, guárdalo como .xlsx).`);

  table = table.filter(r => r.some(c => c.trim() !== ""));
  if (table.length < 2) throw new Error("El fichero no tiene filas de datos debajo de la cabecera.");

  // La cabecera es la primera fila que contenga una columna de nota reconocible (o la primera fila).
  let headerRow = opts.gradeColumn
    ? table.findIndex(r => r.some(c => normalize(c) === normalize(opts.gradeColumn!)))
    : table.findIndex(r => findHeader(r, GRADE_HEADERS) !== -1 && findHeader(r, [...NAME_HEADERS, ...SURNAME_HEADERS, ...FIRSTNAME_HEADERS]) !== -1);
  if (headerRow === -1) headerRow = table.findIndex(r => r.filter(c => c.trim()).length >= 2 && findHeader(r, GRADE_HEADERS) !== -1);
  if (headerRow === -1) headerRow = 0;
  const headers = table[headerRow].map(h => h.trim());

  const gradeCol = findHeader(headers, GRADE_HEADERS, opts.gradeColumn);
  if (gradeCol === -1) throw new Error(`No encuentro la columna de la nota. Indica grade_column. Columnas: ${headers.join(" | ")}`);

  let nameCol = findHeader(headers, NAME_HEADERS, opts.nameColumn);
  let surnameCol = -1;
  let firstCol = -1;
  if (nameCol === -1) {
    surnameCol = findHeader(headers, SURNAME_HEADERS);
    firstCol = headers.findIndex(h => FIRSTNAME_HEADERS.includes(normalize(h)));
    if (surnameCol === -1 && firstCol === -1) throw new Error(`No encuentro la columna del alumno. Indica name_column. Columnas: ${headers.join(" | ")}`);
    if (surnameCol === -1 || firstCol === -1) nameCol = surnameCol === -1 ? firstCol : surnameCol;
  }
  const idCol = opts.idColumn ? findHeader(headers, [], opts.idColumn) : headers.findIndex(h => ID_HEADERS.includes(normalize(h)));

  const grades: InputGrade[] = [];
  const skipped: string[] = [];
  for (const row of table.slice(headerRow + 1)) {
    const student = nameCol !== -1 ? (row[nameCol] ?? "").trim() : `${(row[surnameCol] ?? "").trim()}, ${(row[firstCol] ?? "").trim()}`;
    const grade = (row[gradeCol] ?? "").trim();
    if (!student.replace(/[, ]/g, "")) continue;
    if (!grade) {
      skipped.push(student);
      continue;
    }
    const entry: InputGrade = { student, grade };
    if (idCol !== -1 && row[idCol]?.trim()) entry.id = row[idCol].trim();
    grades.push(entry);
  }
  return { grades, headers, skipped };
}

async function readXlsx(path: string, sheetName?: string): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) throw new Error(`No existe la hoja "${sheetName}". Hojas: ${wb.worksheets.map(w => w.name).join(", ")}`);
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, row => {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value));
    out.push(cells);
  });
  return out;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  if (typeof v === "string" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map(t => t.text).join("");
    if ("text" in v) return String(v.text);
  }
  return String(v);
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ";");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------- Etapa y escala de calificación ----------
// La escala no se supone: se deduce de lo que ofrece la pantalla de Educa (opciones del
// desplegable o campo tecleado). La etapa solo se usa para afinar el rango numérico.
// Referencia normativa: docs/normativa-evaluacion.md

export type Stage = "primaria" | "eso" | "bachillerato" | "fp" | "desconocida";

export function detectStage(context: string | undefined): Stage {
  const t = ` ${normalize(context ?? "")} `;
  if (/ (bto|bach|bachiller|bachillerato) /.test(t)) return "bachillerato";
  if (/ (cfgm|cfgs|cfgb|fpb|fpgb|gm|gs|fp|ciclo formativo|ciclos formativos|grado medio|grado superior|grado basico|curso de especializacion) /.test(t)) return "fp";
  if (/ (eso|secundaria obligatoria) /.test(t)) return "eso";
  if (/ (ep|primaria) /.test(t)) return "primaria";
  return "desconocida";
}

/** Términos de calificación con sus formas habituales (código y palabra completa). */
const TERMS: Record<string, string[]> = {
  IN: ["in", "insuficiente"],
  SU: ["su", "sf", "suficiente"],
  BI: ["bi", "bien"],
  NT: ["nt", "notable"],
  SB: ["sb", "sobresaliente"],
  AP: ["ap", "apto", "apta", "superado", "superada"],
  NA: ["na", "no apto", "no apta", "no superado", "no superada"],
  NP: ["np", "no presentado", "no presentada"],
  EX: ["ex", "exento", "exenta"],
  CV: ["cv", "convalidado", "convalidada"]
};
const ESO_TERMS = ["IN", "SU", "BI", "NT", "SB"];

/** Código canónico de un término ("Sobresaliente", "SB", "Sobresaliente (SB)" -> "SB"), o null. */
export function termCode(text: string): string | null {
  const candidates = [text, text.replace(/\s*\([^)]*\)\s*$/, ""), /\(([^)]*)\)\s*$/.exec(text)?.[1] ?? ""].map(normalize).filter(Boolean);
  for (const [code, forms] of Object.entries(TERMS)) if (candidates.some(c => forms.includes(c))) return code;
  return null;
}

export interface GradeScale {
  kind: "terminos" | "apto" | "numerica" | "otra" | "sin_campos";
  stage: Stage;
  /** Frase para enseñar al profesor. */
  description: string;
  /** Valores que admite el campo (desplegable) o valores no numéricos extra (campo tecleado). */
  values?: string[];
  min?: number;
  max?: number;
  /** Equivalencia aplicada cuando el fichero trae números y Educa pide términos. */
  conversion?: string;
}

const STAGE_LABEL: Record<Stage, string> = { primaria: "Primaria", eso: "ESO", bachillerato: "Bachillerato", fp: "Formación Profesional", desconocida: "etapa no identificada" };
const ESO_CONVERSION = "0–4 → IN · 5 → SU · 6 → BI · 7–8 → NT · 9–10 → SB";

function numericRange(field: SheetField, cfg: EducaConfig["grades"], stage: Stage): { lo: number; hi: number } {
  // RD 659/2023: los módulos de FP se califican de 1 a 10; en Bachillerato (RD 243/2022) de 0 a 10
  const lo = field.min ?? (stage === "fp" ? Math.max(cfg.min, 1) : cfg.min);
  return { lo, hi: field.max ?? cfg.max };
}

function realOptions(field: SheetField): FieldOption[] {
  return (field.options ?? []).filter(o => o.value.trim() !== "" || o.text.trim() !== "");
}

function findTerm(options: FieldOption[], code: string): FieldOption | null {
  const hits = options.filter(o => termCode(o.text) === code || termCode(o.value) === code);
  return hits.length === 1 ? hits[0] : null;
}

/** Describe la escala que pide la pantalla abierta, a partir de sus campos de nota. */
export function describeScale(sheet: GradeSheet, cfg: EducaConfig["grades"], stageOverride?: Stage): GradeScale {
  const stage = stageOverride ?? detectStage(sheet.context);
  const fields = sheet.rows.map(r => r.field).filter((f): f is SheetField => f !== null);
  const field = fields.find(f => !f.disabled) ?? fields[0];
  const where = STAGE_LABEL[stage];
  if (!field) return { kind: "sin_campos", stage, description: `No hay campos de nota en la columna elegida (${where}).` };

  if (field.tag === "select" || field.tag === "pselect") {
    const options = realOptions(field);
    const values = options.map(o => o.text || o.value);
    if (!options.length) return { kind: "otra", stage, values, description: `Desplegable sin opciones legibles (${where}); puede que la evaluación esté cerrada.` };
    if (ESO_TERMS.every(c => findTerm(options, c))) {
      return { kind: "terminos", stage, values, conversion: ESO_CONVERSION, description: `Términos (${where}): ${values.join(", ")}. Si el fichero trae números se convierten así: ${ESO_CONVERSION}.` };
    }
    if (findTerm(options, "AP") && findTerm(options, "NA")) {
      return { kind: "apto", stage, values, description: `Apto / No apto (${where}): ${values.join(", ")}. El fichero debe traer el término, no un número.` };
    }
    const nums = options.map(o => { const n = numbersIn(o.text); return n.length === 1 ? n[0] : parseNumber(o.value); }).filter((n): n is number => n !== null);
    if (nums.length >= options.length / 2 && nums.length >= 5) {
      return { kind: "numerica", stage, values, min: Math.min(...nums), max: Math.max(...nums), description: `Nota numérica elegida en un desplegable, de ${Math.min(...nums)} a ${Math.max(...nums)} (${where}). Opciones: ${values.join(", ")}.` };
    }
    return { kind: "otra", stage, values, description: `Desplegable con estas opciones (${where}): ${values.join(", ")}. El fichero debe traer exactamente uno de esos valores.` };
  }

  const { lo, hi } = numericRange(field, cfg, stage);
  const extras = field.options ? realOptions(field).map(o => o.text || o.value) : ["FPEX"];
  const all = [...new Set([...extras, ...cfg.extraValues])];
  return {
    kind: "numerica", stage, min: lo, max: hi, values: all,
    description: `Nota numérica tecleada de ${lo} a ${hi}${cfg.integerOnly ? ", sin decimales" : ""} (${where})${all.length ? `. También admite: ${all.join(", ")}` : ""}.`
  };
}

// ---------- Conversión de la nota al valor del campo ----------

export type GradeResolution = { ok: true; value: string; display: string } | { ok: false; reason: string };

function parseNumber(text: string): number | null {
  const t = text.trim().replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

function numbersIn(text: string): number[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => Number(n.replace(",", ".")));
}

export function resolveGrade(field: SheetField, grade: string, cfg: EducaConfig["grades"], stage: Stage = "desconocida"): GradeResolution {
  const raw = grade.trim();
  const n = parseNumber(raw);
  const isChoice = field.tag === "select" || field.tag === "pselect";
  const { lo, hi } = isChoice ? { lo: Math.min(cfg.min, 0), hi: cfg.max } : numericRange(field, cfg, stage);

  if (n !== null) {
    if (n < lo || n > hi) return { ok: false, reason: `la nota ${raw} está fuera del rango ${lo}–${hi}${stage === "fp" && n === 0 ? " (en FP los módulos se califican de 1 a 10)" : ""}` };
    if (cfg.integerOnly && !Number.isInteger(n)) return { ok: false, reason: `la nota ${raw} tiene decimales y Educa espera una nota entera; redondéala tú en el fichero` };
  }

  if (isChoice) {
    const options = realOptions(field);
    const byValue = options.filter(o => o.value.trim() === raw);
    if (byValue.length === 1) return { ok: true, value: byValue[0].value, display: byValue[0].text };
    const byText = options.filter(o => normalize(o.text) === normalize(raw));
    if (byText.length === 1) return { ok: true, value: byText[0].value, display: byText[0].text };
    if (n !== null) {
      const byNumber = options.filter(o => {
        const nums = numbersIn(o.text);
        const valueNum = parseNumber(o.value);
        return (nums.length === 1 && nums[0] === n) || (nums.length === 0 && valueNum === n);
      });
      if (byNumber.length === 1) return { ok: true, value: byNumber[0].value, display: byNumber[0].text };
      if (byNumber.length > 1) return { ok: false, reason: `la nota ${raw} encaja con varias opciones (${byNumber.map(o => o.text).join(" / ")})` };
      // El fichero trae un número y Educa pide términos (ESO, Primaria, ámbitos): equivalencia habitual
      if (ESO_TERMS.every(c => findTerm(options, c))) {
        if (!Number.isInteger(n)) return { ok: false, reason: `la nota ${raw} tiene decimales; redondéala tú en el fichero o pon directamente IN/SU/BI/NT/SB` };
        const o = findTerm(options, n <= 4 ? "IN" : n === 5 ? "SU" : n === 6 ? "BI" : n <= 8 ? "NT" : "SB")!;
        return { ok: true, value: o.value, display: `${o.text} (${raw})` };
      }
      if (findTerm(options, "AP") && findTerm(options, "NA")) {
        return { ok: false, reason: `esta pantalla califica con ${options.map(o => o.text).join(" / ")}, no con números; pon el término en el fichero` };
      }
    } else {
      // "Sobresaliente" -> SB, "Apto" -> AP...
      const code = termCode(raw);
      const byTerm = code ? findTerm(options, code) : null;
      if (byTerm) return { ok: true, value: byTerm.value, display: byTerm.text };
      const byPrefix = options.filter(o => normalize(o.text).startsWith(normalize(raw)));
      if (byPrefix.length === 1) return { ok: true, value: byPrefix[0].value, display: byPrefix[0].text };
    }
    return { ok: false, reason: `"${raw}" no corresponde a ninguna opción del desplegable (${options.map(o => o.text).slice(0, 15).join(" / ")})` };
  }

  if (n !== null) {
    const text = String(n).replace(".", cfg.decimalSeparator);
    return { ok: true, value: text, display: text };
  }
  // Campo tecleado con un valor no numérico: solo los que ofrece el propio campo o la configuración
  const offered = field.options ? realOptions(field).map(o => o.text || o.value) : ["FPEX"];
  const extra = [...offered, ...cfg.extraValues].find(v => normalize(v) === normalize(raw) || (termCode(v) !== null && termCode(v) === termCode(raw)));
  if (extra) return { ok: true, value: extra, display: extra };
  if (termCode(raw) && ESO_TERMS.includes(termCode(raw)!)) {
    return { ok: false, reason: `esta pantalla pide una nota numérica de ${lo} a ${hi}, no un término como "${raw}"; pon el número en el fichero` };
  }
  return { ok: false, reason: `"${raw}" no es una nota numérica de ${lo} a ${hi}${offered.length ? ` ni uno de los valores que admite el campo (${[...offered, ...cfg.extraValues].join(", ")})` : ""}` };
}

// ---------- Emparejar alumnos y preparar el plan ----------

export type PlanStatus = "cambia" | "igual" | "sin_coincidencia" | "ambigua" | "nota_no_valida" | "campo_bloqueado" | "duplicada";

export interface PlanItem {
  student: string;
  grade: string;
  status: PlanStatus;
  educaName?: string;
  rowIndex?: number;
  fieldKey?: string;
  newValue?: string;
  newDisplay?: string;
  currentDisplay?: string;
  fuzzyMatch?: boolean;
  note?: string;
}

export interface GradePlan {
  items: PlanItem[];
  /** Filas de Educa para las que el fichero no trae nota. */
  rowsWithoutGrade: string[];
}

export function buildPlan(sheet: GradeSheet, inputs: InputGrade[], cfg: EducaConfig["grades"], stageOverride?: Stage): GradePlan {
  const stage = stageOverride ?? detectStage(sheet.context);
  const rows = sheet.rows.filter(r => r.field);
  const used = new Map<number, number>(); // rowIndex -> item index
  const items: PlanItem[] = [];

  for (const input of inputs) {
    const item: PlanItem = { student: input.student, grade: input.grade, status: "sin_coincidencia" };
    let match: SheetRow | undefined;
    let fuzzy = false;

    if (input.id) match = rows.find(r => r.studentId && normalize(r.studentId) === normalize(input.id!));
    if (!match) {
      const exact = rows.filter(r => sameMultiset(tokens(r.name), tokens(input.student)));
      if (exact.length === 1) match = exact[0];
      else if (exact.length > 1) {
        item.status = "ambigua";
        item.note = `varios alumnos se llaman igual en Educa: ${exact.map(r => r.name).join(" / ")}`;
      }
    }
    if (!match && item.status !== "ambigua") {
      const mine = significant(input.student);
      const partial = rows.filter(r => {
        const theirs = significant(r.name);
        return mine.length >= 2 && theirs.length >= 2 && (isSubset(mine, theirs) || isSubset(theirs, mine));
      });
      if (partial.length === 1) {
        match = partial[0];
        fuzzy = true;
      } else if (partial.length > 1) {
        item.status = "ambigua";
        item.note = `podría ser: ${partial.map(r => r.name).join(" / ")}`;
      }
    }

    if (match && match.field) {
      item.educaName = match.name;
      item.rowIndex = match.index;
      item.fieldKey = match.field.key;
      item.currentDisplay = match.field.valueText || match.field.value || "(vacía)";
      if (fuzzy) item.fuzzyMatch = true;
      const prev = used.get(match.index);
      if (prev !== undefined) {
        item.status = "duplicada";
        item.note = `la fila de ${match.name} ya la usa "${items[prev].student}"`;
        items[prev].status = "duplicada";
        items[prev].note = `la fila de ${match.name} también la reclama "${input.student}"`;
      } else if (match.field.disabled) {
        used.set(match.index, items.length);
        item.status = "campo_bloqueado";
        item.note = "el campo está deshabilitado en Educa (¿evaluación cerrada?)";
      } else {
        used.set(match.index, items.length);
        const res = resolveGrade(match.field, input.grade, cfg, stage);
        if (!res.ok) {
          item.status = "nota_no_valida";
          item.note = res.reason;
        } else {
          item.newValue = res.value;
          item.newDisplay = res.display;
          item.status = res.value === match.field.value ? "igual" : "cambia";
        }
      }
    } else if (item.status === "sin_coincidencia") {
      item.note = "no hay ningún alumno con ese nombre en la tabla de Educa";
    }
    items.push(item);
  }

  const rowsWithoutGrade = rows.filter(r => !used.has(r.index)).map(r => r.name);
  return { items, rowsWithoutGrade };
}

export function summarizePlan(plan: GradePlan): Record<PlanStatus, number> {
  const counts: Record<PlanStatus, number> = { cambia: 0, igual: 0, sin_coincidencia: 0, ambigua: 0, nota_no_valida: 0, campo_bloqueado: 0, duplicada: 0 };
  for (const i of plan.items) counts[i.status]++;
  return counts;
}
