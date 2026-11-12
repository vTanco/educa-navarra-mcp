/** Pruebas de la lógica pura: lectura de Excel/CSV, conversión de notas y emparejamiento. */
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { buildPlan, parseCsv, parseGradesFile, resolveGrade, type GradeSheet, type SheetField } from "../src/grades.js";

const cfg = { min: 1, max: 10, integerOnly: true, decimalSeparator: "," as const, extraValues: ["NP"] };

// Excel con título encima de la cabecera y fórmula en la nota
const dir = mkdtempSync(join(tmpdir(), "educa-unit-"));
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("1ª Evaluación");
ws.addRow(["Notas 2º ESO B - Matemáticas"]);
ws.addRow(["Nº", "Alumno", "Examen", "Nota final"]);
ws.addRow([1, "García López, Ana", 6.8, { formula: "ROUND(C3,0)", result: 7 }]);
ws.addRow([2, "Pérez Martínez, Iñigo", 4, ""]);
await wb.xlsx.writeFile(join(dir, "notas.xlsx"));
const x = await parseGradesFile(join(dir, "notas.xlsx"));
assert.deepEqual(x.grades, [{ student: "García López, Ana", grade: "7" }]);
assert.deepEqual(x.skipped, ["Pérez Martínez, Iñigo"]);

// CSV con comillas y separador coma
assert.deepEqual(parseCsv('Alumno,Nota\n"Ruiz, Pablo",8\n'), [["Alumno", "Nota"], ["Ruiz, Pablo", "8"]]);

// Conversión de notas
const select: SheetField = { key: "f0", tag: "select", type: "select-one", header: "Nota", value: "", valueText: "", disabled: false,
  options: [{ value: "", text: "" }, { value: "IN1", text: "Insuficiente (1)" }, { value: "SU5", text: "Suficiente (5)" }, { value: "SB10", text: "Sobresaliente (10)" }, { value: "NP", text: "No presentado" }] };
assert.deepEqual(resolveGrade(select, "5", cfg), { ok: true, value: "SU5", display: "Suficiente (5)" });
assert.deepEqual(resolveGrade(select, "10,0", cfg), { ok: true, value: "SB10", display: "Sobresaliente (10)" });
assert.deepEqual(resolveGrade(select, "no presentado", cfg), { ok: true, value: "NP", display: "No presentado" });
assert.equal(resolveGrade(select, "11", cfg).ok, false);
const input: SheetField = { key: "f1", tag: "input", type: "text", header: "Nota", value: "", valueText: "", disabled: false };
assert.deepEqual(resolveGrade(input, "8", cfg), { ok: true, value: "8", display: "8" });
assert.deepEqual(resolveGrade(input, "7.5", { ...cfg, integerOnly: false }), { ok: true, value: "7,5", display: "7,5" });
assert.deepEqual(resolveGrade(input, "np", cfg), { ok: true, value: "NP", display: "NP" });

// Emparejamiento: homónimos parciales -> ambigua; duplicados -> duplicada
const row = (index: number, name: string) => ({ index, name, field: { ...input, key: `f${index}` } });
const sheet: GradeSheet = { frameUrl: "", headers: [], column: "Nota", editableColumns: ["Nota"], rows: [row(0, "Sanz Ruiz, Ana"), row(1, "Sanz Ruiz, Ana María"), row(2, "Goñi Lasa, Unai")] };
const plan = buildPlan(sheet, [{ student: "Ana Sanz", grade: "6" }, { student: "Unai Goñi Lasa", grade: "5" }, { student: "Goñi Lasa, Unai", grade: "6" }], cfg);
assert.deepEqual(plan.items.map(i => i.status), ["ambigua", "duplicada", "duplicada"]);
console.error("✅ Pruebas unitarias superadas");
