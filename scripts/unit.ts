/** Pruebas de la lógica pura: lectura de Excel/CSV, conversión de notas y emparejamiento. */
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { blockedGroup, buildPlan, cleanComment, describeScale, detectStage, parseCsv, parseGradesFile, resolveGrade, sameValue, summarizeComments, termCode, type GradeSheet, type SheetField } from "../src/grades.js";

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

// Etapa y escala
assert.equal(detectStage("BTO N 1ºA · TIC"), "bachillerato");
assert.equal(detectStage("ESO 1ºAB plu · Tecnología y Digitalización"), "eso");
assert.equal(detectStage("CFGS 2º DAM · Programación"), "fp");
assert.equal(detectStage("Calificaciones"), "desconocida");
assert.equal(termCode("Sobresaliente (SB)"), "SB");
assert.equal(termCode("no apto"), "NA");
const terms: SheetField = { key: "f2", tag: "pselect", type: "p-select", header: "1Ev", value: "", valueText: "", disabled: false, options: ["SB", "NT", "BI", "SU", "IN", "FPEX"].map(c => ({ value: c, text: c })) };
assert.deepEqual(resolveGrade(terms, "0", cfg), { ok: true, value: "IN", display: "IN (0)" });
assert.deepEqual(resolveGrade(terms, "Notable", cfg), { ok: true, value: "NT", display: "NT" });
assert.equal(resolveGrade(terms, "7,5", cfg).ok, false);
const fullNames: SheetField = { ...terms, options: ["Insuficiente (IN)", "Suficiente (SF)", "Bien (BI)", "Notable (NT)", "Sobresaliente (SB)"].map(c => ({ value: c, text: c })) };
assert.deepEqual(resolveGrade(fullNames, "5", cfg), { ok: true, value: "Suficiente (SF)", display: "Suficiente (SF) (5)" });
assert.deepEqual(resolveGrade(fullNames, "SU", cfg), { ok: true, value: "Suficiente (SF)", display: "Suficiente (SF)" });
const zero = { ...cfg, min: 0 };
assert.equal(resolveGrade(input, "0", zero, "bachillerato").ok, true);
assert.equal(resolveGrade(input, "0", zero, "fp").ok, false);
assert.equal(resolveGrade(input, "SB", zero, "bachillerato").ok, false);
assert.equal(resolveGrade({ ...input, type: "number", min: 1, max: 5 }, "6", zero).ok, false);
const scaleOf = (f: SheetField, context: string) => describeScale({ frameUrl: "", headers: [], column: "x", editableColumns: [], context, rows: [{ index: 0, name: "A", field: f }] }, zero);
assert.equal(scaleOf(terms, "ESO 1ºA").kind, "terminos");
assert.deepEqual([scaleOf(input, "CFGM 1º SMR").min, scaleOf(input, "BTO N 1ºA").min], [1, 0]);

// Grupos en los que no se ponen notas
assert.equal(blockedGroup("ESO 2º D · Tecnología", ["eso 2 d"]), "eso 2 d");
assert.equal(blockedGroup("ESO 2º DE · Tecnología", ["ESO 2º D"]), null);
assert.equal(blockedGroup("BTO N 2ºA · TIC", ["ESO 2º D", "BTO N 2ºA"]), "BTO N 2ºA");
assert.equal(blockedGroup("ESO 1ºAB plu", ["ESO 2"]), null);
assert.equal(blockedGroup("ESO 2º E", ["ESO 2"]), "ESO 2");

// Emparejamiento: homónimos parciales -> ambigua; duplicados -> duplicada
const row = (index: number, name: string) => ({ index, name, field: { ...input, key: `f${index}` } });
const sheet: GradeSheet = { frameUrl: "", headers: [], column: "Nota", editableColumns: ["Nota"], rows: [row(0, "Sanz Ruiz, Ana"), row(1, "Sanz Ruiz, Ana María"), row(2, "Goñi Lasa, Unai")] };
const plan = buildPlan(sheet, [{ student: "Ana Sanz", grade: "6" }, { student: "Unai Goñi Lasa", grade: "5" }, { student: "Goñi Lasa, Unai", grade: "6" }], cfg);
assert.deepEqual(plan.items.map(i => i.status), ["ambigua", "duplicada", "duplicada"]);

// Ceros con espacio final ("0 "), coma decimal y mayúsculas
assert.equal(sameValue("0 ", "0"), true);
assert.equal(sameValue("7,0", "7"), true);
assert.equal(sameValue("sb", "SB"), true);
assert.equal(sameValue("", "0"), false);
const zeroRow: GradeSheet = { frameUrl: "", headers: [], column: "1Ev", editableColumns: ["1Ev"], rows: [{ index: 0, name: "Goñi Lasa, Unai", field: { ...input, value: "0 ", valueText: "0 " } }] };
assert.equal(buildPlan(zeroRow, [{ student: "Goñi Lasa, Unai", grade: "0" }], zero, "bachillerato").items[0].status, "igual");

// Observaciones para las familias: columna opcional, filas solo con observación y texto ya existente
writeFileSync(join(dir, "obs.csv"), 'Apellidos;Nombre;Nota;Comentario para las familias\nGoñi Lasa;Unai;6;"Buen trimestre.\r\nSigue así."\nSanz Ruiz;Ana;;Revisar ortografía\nPérez;Iker;;\n');
const o = await parseGradesFile(join(dir, "obs.csv"));
assert.equal(o.commentColumn, "Comentario para las familias");
assert.deepEqual(o.grades, [{ student: "Goñi Lasa, Unai", grade: "6", comment: "Buen trimestre.\nSigue así." }, { student: "Sanz Ruiz, Ana", grade: "", comment: "Revisar ortografía" }]);
assert.deepEqual(o.skipped, ["Pérez, Iker"]);
assert.equal(cleanComment("  hola  \r\n adiós "), "hola\n adiós");
const withObs: GradeSheet = { frameUrl: "", headers: [], column: "Nota", editableColumns: ["Nota"], rows: [
  { ...row(0, "Goñi Lasa, Unai"), comment: { key: "c0", value: "", disabled: false, maxLength: 20 } },
  { ...row(1, "Sanz Ruiz, Ana"), comment: { key: "c1", value: "Ya escrita", disabled: false, maxLength: 20 } },
  { ...row(2, "Ruiz Arana, Pablo"), comment: { key: "c2", value: "", disabled: false, maxLength: 20 } },
  { ...row(3, "Lasa Goñi, Iker"), comment: null }
] };
const obsInputs = [{ student: "Unai Goñi Lasa", grade: "6", comment: "Bien" }, { student: "Ana Sanz Ruiz", grade: "", comment: "Otra" }, { student: "Pablo Ruiz Arana", grade: "7", comment: "x".repeat(21) }, { student: "Iker Lasa Goñi", grade: "5", comment: "Hola" }];
const op = buildPlan(withObs, obsInputs, cfg);
assert.deepEqual(op.items.map(i => [i.status, i.commentStatus]), [["cambia", "cambia"], ["sin_nota", "conserva"], ["cambia", "no_valida"], ["cambia", "sin_campo"]]);
assert.deepEqual(summarizeComments(op), { cambia: 1, igual: 0, conserva: 1, no_valida: 1, bloqueado: 0, sin_campo: 1 });
assert.equal(buildPlan(withObs, obsInputs, cfg, undefined, { overwriteComments: true }).items[1].commentStatus, "cambia");
assert.deepEqual(op.rowsWithoutGrade, ["Sanz Ruiz, Ana"]);
console.error("✅ Pruebas unitarias superadas");
