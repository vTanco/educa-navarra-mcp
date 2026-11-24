/**
 * Prueba completa contra el Educa simulado: login, navegación, vista previa,
 * rellenado, bloqueo de acciones peligrosas y guardado.
 *   npm run build && npm run smoke
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { startMock, saved } from "./mock-server.js";
import { savedIncidents } from "./mock-convivencia.js";

const { server: mock, url } = await startMock();
const home = mkdtempSync(join(tmpdir(), "educa-mcp-"));
const credentials = join(home, "credenciales.json");
writeFileSync(credentials, JSON.stringify({ usuario: "profe", clave: "mal" }));
const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: {
      ...getDefaultEnvironment(),
      ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH } : {}),
      ...(process.env.EDUCA_BROWSER_PATH ? { EDUCA_BROWSER_PATH: process.env.EDUCA_BROWSER_PATH } : {}),
      EDUCA_BASE_URL: url,
      EDUCA_ALLOWED_HOSTS: "127.0.0.1",
      EDUCA_HEADLESS: "1",
      EDUCA_NO_GRADE_GROUPS: "ESO 2º D, BTO N 2",
      EDUCA_BROWSER_CHANNEL: process.env.EDUCA_BROWSER_CHANNEL ?? "chromium",
      EDUCA_CREDENTIALS_FILE: credentials,
      EDUCA_CONFIG: resolve("test/mock/educa.config.json"),
      EDUCA_MCP_HOME: home,
      EDUCA_NOTES_DIR: resolve("test/mock"),
      EDUCA_PRIVATE_MODE: "0" // esta prueba comprueba los nombres; el modo privado tiene la suya (smoke-private.ts)
    },
    stderr: "inherit"
  })
);

type Result = Awaited<ReturnType<typeof client.callTool>>;
const textOf = (r: Result) => (r.content as { type: string; text: string }[]).map(c => c.text).join("\n");
async function call(name: string, args: Record<string, unknown> = {}, expectError = false): Promise<Result> {
  const r = await client.callTool({ name, arguments: args });
  assert.equal(Boolean(r.isError), expectError, `${name} ${expectError ? "debería fallar" : "falló"}: ${textOf(r)}`);
  console.error(`\n--- ${name} ${JSON.stringify(args)}\n${textOf(r).slice(0, 1500)}`);
  return r;
}

try {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 20);
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map(p => p.name).sort(), ["meter_notas", "poner_parte", "preparar_excel", "revisar_notas"]);
  assert.match(client.getInstructions() ?? "", /educa_save_grades/);
  assert.match(textOf(await call("educa_list_grade_files", { filter: "notas" })), /notas\.csv/);

  await call("educa_inspect_page", {}, true); // sin login
  const bad = await call("educa_login", { wait_minutes: 0.5 }, true); // contraseña incorrecta: un solo intento
  assert.match(textOf(bad), /no ha aceptado/);
  assert.ok(!textOf(bad).includes("mal"), "el error no debe mostrar la contraseña");
  writeFileSync(credentials, JSON.stringify({ usuario: "profe", clave: "1234" }));
  await call("educa_navigate", { url });
  assert.match(textOf(await call("educa_login", { wait_minutes: 0.5 })), /credenciales guardadas/);
  await call("educa_navigate", { url: "https://example.com" }, true); // dominio no permitido
  await call("educa_click", { text: "Evaluación" });
  await call("educa_select_filter", { field: "Grupo", option: "2º ESO B" });
  await call("educa_select_filter", { field: "Evaluación", option: "1ª" });
  await call("educa_click", { text: "Ver", exact: true });
  await call("educa_inspect_page");
  assert.match(textOf(await call("educa_dump_html", { frame_url_contains: "notas" })), /formcontrolname|name="nota_1001"/);

  // La columna "Observaciones" no compite con la de la nota: se elige sola "Nota final"
  const auto = await call("educa_read_grade_sheet", { response_format: "json" });
  assert.equal((auto.structuredContent as { column: string; comments_available: boolean }).column, "Nota final");
  assert.equal((auto.structuredContent as { comments_available: boolean }).comments_available, true);
  const sheet = await call("educa_read_grade_sheet", { column: "nota", response_format: "json" });
  assert.equal((sheet.structuredContent as { students: unknown[] }).students.length, 6);

  const file = await call("educa_load_grades_file", { file_path: resolve("test/mock/notas.csv") });
  assert.equal((file.structuredContent as { count: number }).count, 6);

  const preview = await call("educa_preview_grades", { file_path: resolve("test/mock/notas.csv"), column: "Nota final", response_format: "json" });
  const p = preview.structuredContent as { plan_id: string; summary: Record<string, number>; items: { student: string; status: string; fuzzyMatch?: boolean }[]; rows_without_grade: string[] };
  assert.deepEqual(p.summary, { cambia: 3, igual: 0, sin_nota: 0, sin_coincidencia: 1, ambigua: 0, nota_no_valida: 1, campo_bloqueado: 1, duplicada: 0 });
  assert.equal(p.items.find(i => i.student.startsWith("Etxeberria"))?.fuzzyMatch, true);
  assert.deepEqual(p.rows_without_grade, ["Ruiz Arana, Pablo"]);
  await call("educa_preview_grades", { file_path: resolve("test/mock/notas.csv"), column: "Nota final" }); // versión markdown

  await call("educa_save_grades", { confirm: true }, true); // nada rellenado aún
  await call("educa_fill_grades", { plan_id: p.plan_id });
  assert.deepEqual(saved, {}, "rellenar no debe guardar");
  await call("educa_click", { text: "Cerrar evaluación" }, true); // acción prohibida
  await call("educa_fill_grades", { plan_id: p.plan_id, include_fuzzy: true });
  await call("educa_save_grades", { confirm: false }, true);
  await call("educa_save_grades", { confirm: true });
  assert.deepEqual(saved, { "2B|1": { "1001": "7", "1002": "9", "1003": "10" } });

  // --- Disposición real de Educa-Gestión: tarjetas, desplegables PrimeNG, notas cualitativas y guardado automático
  await call("educa_navigate", { url: url + "cuaderno" });
  const real = await call("educa_read_grade_sheet", { response_format: "json" });
  const rs = real.structuredContent as { column: string; stage: string; scale: { kind: string; values: string[] }; students: { name: string; editable: boolean }[] };
  assert.equal(rs.column, "1Ev");
  assert.equal(rs.stage, "eso");
  assert.equal(rs.scale.kind, "terminos");
  assert.deepEqual(rs.scale.values, ["SB", "NT", "BI", "SU", "IN", "FPEX"]);
  assert.equal(rs.students.length, 6);
  assert.equal(rs.students[0].name, "GARCÍA LÓPEZ, Ana");
  const pv = await call("educa_preview_grades", { grades: [{ student: "Ana García López", grade: "8" }, { student: "Pérez Martínez, Iñigo", grade: "Suficiente" }, { student: "Ruiz Arana, Pablo", grade: "3" }, { student: "López Sanz, Marta", grade: "6" }], response_format: "json" });
  const pp = pv.structuredContent as { plan_id: string; summary: Record<string, number> };
  assert.equal(pp.summary.cambia, 3);
  assert.equal(pp.summary.campo_bloqueado, 1);
  await call("educa_fill_grades", { plan_id: pp.plan_id });
  assert.equal(saved["cuaderno"], undefined, "rellenar no guarda: queda pendiente de Aceptar");
  await call("educa_save_grades", { confirm: true });
  assert.deepEqual(saved["cuaderno"], { "1001": "NT", "1002": "SU", "1006": "IN" });

  // --- Observaciones para las familias (cuadro de texto libre bajo cada alumno, como en Educa-Gestión)
  for (const k of Object.keys(saved)) delete saved[k];
  saved["observaciones"] = { "1003": "Texto que ya había escrito el profesor." };
  await call("educa_navigate", { url: url + "cuaderno" });
  const ro = (await call("educa_read_grade_sheet", { response_format: "json" })).structuredContent as { comments_available: boolean; students: { comment?: string }[] };
  assert.equal(ro.comments_available, true);
  assert.equal(ro.students[2].comment, "Texto que ya había escrito el profesor.");
  const obsCsv = join(home, "obs.csv");
  writeFileSync(obsCsv, 'Alumno;Nota;Observaciones\n"García López, Ana";9;"Excelente trabajo; sigue así."\nPérez Martínez, Iñigo;;"Debe entregar las tareas a tiempo."\nEtxeberria Goñi, Maite;6;Otro comentario\nLópez Sanz, Marta;;Comentario\nRuiz Arana, Pablo;5;\n');
  const lf = (await call("educa_load_grades_file", { file_path: obsCsv })).structuredContent as { comment_column: string; with_comment: number; count: number };
  assert.deepEqual([lf.comment_column, lf.with_comment, lf.count], ["Observaciones", 4, 5]);
  const op = (await call("educa_preview_grades", { file_path: obsCsv, response_format: "json" })).structuredContent as { plan_id: string; summary: Record<string, number>; comments: Record<string, number> };
  assert.equal(op.summary.cambia, 3);
  assert.equal(op.summary.sin_nota, 2);
  assert.deepEqual(op.comments, { cambia: 2, igual: 0, conserva: 1, no_valida: 0, bloqueado: 1, sin_campo: 0 });
  assert.match(textOf(await call("educa_preview_grades", { file_path: obsCsv })), /overwrite_comments=true/);
  const ow = (await call("educa_preview_grades", { file_path: obsCsv, overwrite_comments: true, response_format: "json" })).structuredContent as { plan_id: string; comments: Record<string, number> };
  assert.equal(ow.comments.cambia, 3);
  await call("educa_fill_grades", { plan_id: op.plan_id });
  assert.equal(saved["cuaderno"], undefined, "rellenar no guarda");
  assert.deepEqual(saved["observaciones"], { "1003": "Texto que ya había escrito el profesor." });
  await call("educa_save_grades", { confirm: true });
  assert.deepEqual(saved["cuaderno"], { "1001": "SB", "1003": "BI", "1006": "SU" });
  assert.deepEqual(saved["observaciones"], { "1001": "Excelente trabajo; sigue así.", "1002": "Debe entregar las tareas a tiempo.", "1003": "Texto que ya había escrito el profesor." });
  // Una observación más larga que lo que admite Educa (4000 caracteres) se rechaza
  const long = (await call("educa_preview_grades", { grades: [{ student: "Ruiz Arana, Pablo", comment: "x".repeat(4001) }], response_format: "json" })).structuredContent as { comments: Record<string, number> };
  assert.equal(long.comments.no_valida, 1);

  // --- Bachillerato: nota numérica tecleada
  for (const k of Object.keys(saved)) delete saved[k];
  saved["cuaderno"] = { "1004": "0" }; // Educa muestra los ceros como "0 "
  await call("educa_navigate", { url: url + "cuaderno?bach=1" });
  const zeroPlan = (await call("educa_preview_grades", { grades: [{ student: "Fernández de la Fuente, Jon", grade: "0" }], response_format: "json" })).structuredContent as { summary: Record<string, number> };
  assert.equal(zeroPlan.summary.igual, 1, "un 0 que Educa muestra como \"0 \" ya está igual");
  delete saved["cuaderno"];
  await call("educa_navigate", { url: url + "cuaderno?bach=1" });
  const bp = (await call("educa_preview_grades", { grades: [{ student: "Ana García López", grade: "8" }, { student: "Pérez Martínez, Iñigo", grade: "0" }, { student: "Ruiz Arana, Pablo", grade: "6,5" }, { student: "Etxeberria Goñi, Maite", grade: "NT" }], response_format: "json" })).structuredContent as { plan_id: string; summary: Record<string, number>; scale: { kind: string; stage: string; min: number; values: string[] } };
  assert.equal(bp.summary.cambia, 2);
  assert.equal(bp.summary.nota_no_valida, 2, "en Bachillerato no valen ni decimales ni términos");
  assert.deepEqual([bp.scale.kind, bp.scale.stage, bp.scale.min], ["numerica", "bachillerato", 0]);
  assert.deepEqual(bp.scale.values, ["FPEX"]);
  await call("educa_fill_grades", { plan_id: bp.plan_id });
  assert.equal(saved["cuaderno"], undefined);
  await call("educa_save_grades", { confirm: true });
  assert.deepEqual(saved["cuaderno"], { "1001": "8", "1002": "0" });

  // --- Formación Profesional: módulos de 1 a 10 (el 0 no existe) y pantallas de Apto / No apto
  for (const k of Object.keys(saved)) delete saved[k];
  await call("educa_navigate", { url: url + "cuaderno?fp=1" });
  const fp = (await call("educa_preview_grades", { grades: [{ student: "Ana García López", grade: "10" }, { student: "Pérez Martínez, Iñigo", grade: "0" }, { student: "Ruiz Arana, Pablo", grade: "1" }], response_format: "json" })).structuredContent as { plan_id: string; summary: Record<string, number>; scale: { kind: string; stage: string; min: number }; items: { note?: string }[] };
  assert.deepEqual([fp.scale.kind, fp.scale.stage, fp.scale.min], ["numerica", "fp", 1]);
  assert.equal(fp.summary.cambia, 2);
  assert.match(fp.items[1].note ?? "", /1 a 10/);
  await call("educa_navigate", { url: url + "cuaderno?apto=1" });
  const ap = (await call("educa_preview_grades", { grades: [{ student: "Ana García López", grade: "Apto" }, { student: "Pérez Martínez, Iñigo", grade: "7" }, { student: "Ruiz Arana, Pablo", grade: "no apto" }], response_format: "json" })).structuredContent as { plan_id: string; summary: Record<string, number>; scale: { kind: string }; items: { newValue?: string }[] };
  assert.equal(ap.scale.kind, "apto");
  assert.equal(ap.summary.cambia, 2);
  assert.equal(ap.summary.nota_no_valida, 1, "un número no vale donde Educa pide Apto / No apto");
  assert.deepEqual([ap.items[0].newValue, ap.items[2].newValue], ["APTO", "NO APTO"]);
  await call("educa_fill_grades", { plan_id: ap.plan_id });
  assert.equal(saved["cuaderno"], undefined);
  await call("educa_save_grades", { confirm: true });
  assert.deepEqual(saved["cuaderno"], { "1001": "APTO", "1006": "NO APTO" });

  // --- Mis grupos: leer la lista de Educa, guardarla y abrir un grupo directamente
  const cat = (await call("educa_refresh_groups", { response_format: "json" })).structuredContent as { groups: { name: string; kind: string; subjects: string[] }[]; evaluations: string[]; no_grade_groups: string[] };
  assert.deepEqual(cat.groups.map(g => `${g.kind}:${g.name}:${g.subjects.length}`), ["grupo:BTO N 1ºA:1", "grupo:ESO 2º D:1", "agrupamiento:ESO 1ºAB plu:2"]);
  assert.deepEqual(cat.evaluations, ["1a Evaluación", "2a Evaluación", "Evaluación Final"]);
  assert.deepEqual(cat.no_grade_groups, ["ESO 2º D"]);
  assert.match(textOf(await call("educa_refresh_groups")), /ESO 2º D\*\* \(grupo\) ⛔/);
  await call("educa_open_group", { group: "1ºAB" }, true); // dos asignaturas: hay que indicar cuál
  const og = textOf(await call("educa_open_group", { group: "1ºAB", subject: "tecnologia", evaluation: "2" }));
  assert.match(og, /ESO 1ºAB plu\*\* · Tecnología y Digitalización ES1 · 2a Evaluación/);
  assert.match(og, /Términos \(ESO\)/);
  assert.match(textOf(await call("educa_open_group", { group: "bto n 1a" })), /Nota numérica tecleada de 0 a 10/);
  assert.match(textOf(await call("educa_open_group", { group: "ESO 2º D" })), /no escribirá ni guardará/);
  await call("educa_preview_grades", { grades: [{ student: "Ana García López", grade: "8" }] }, true);
  await call("educa_open_group", { group: "4º ESO Z" }, true);

  // --- Grupos en los que el docente no pone notas: se pueden leer, pero no preparar ni escribir notas
  await call("educa_navigate", { url: url + "cuaderno?nombre=" + encodeURIComponent("ESO 2º D") });
  const nb = await call("educa_read_grade_sheet", { response_format: "json" });
  assert.equal((nb.structuredContent as { no_grades_group: boolean }).no_grades_group, true);
  assert.match(textOf(await call("educa_preview_grades", { grades: [{ student: "Ana García López", grade: "8" }] }, true)), /no pones notas/);
  await call("educa_navigate", { url: url + "cuaderno?nombre=" + encodeURIComponent("ESO 2º DE") });
  assert.equal(((await call("educa_read_grade_sheet", { response_format: "json" })).structuredContent as { no_grades_group: boolean }).no_grades_group, false);

  // --- Partes de convivencia: vista previa (no escribe), rellenar (no guarda) y guardar con confirmación
  const relato = "Durante la sesión de Tecnología, el alumno se ha dirigido al profesor con un tono despectivo y se ha negado a guardar el teléfono móvil tras dos indicaciones.";
  assert.match(textOf(await call("educa_preview_incident", { group: "3ºDEFH", student: "Iker", report: relato }, true)), /varios alumnos/);
  assert.match(textOf(await call("educa_preview_incident", { group: "3ºDEFH", student: "Iker Muro", report: "Se portó mal." }, true)), /demasiado corto/);
  assert.match(textOf(await call("educa_preview_incident", { group: "3ºDEFH", student: "Iker Muro", report: relato, date: "31/02/2026" }, true)), /fecha no se entiende/);
  const sinConducta = textOf(await call("educa_preview_incident", { group: "3ºDEFH", student: "Iker Muro", report: relato }));
  assert.match(sinConducta, /Falta el tipo de conducta/);
  assert.match(sinConducta, /FALTA DE RESPETO \(art\. 14 g\)/);
  assert.match(sinConducta, /\*\*Conductas perjudiciales\*\*[\s\S]*INSUBORDINACIÓN \(art\. 17\.1 j\)/);
  assert.match(sinConducta, /Muro Etxeberria, Iker \(ESO 3ºDEFH cd\)/);
  await call("educa_preview_incident", { group: "4º Z", student: "Iker Muro", report: relato }, true);
  await call("educa_save_incident", { confirm: true }, true); // nada rellenado todavía
  const prev = await call("educa_preview_incident", { group: "3ºDEFH", student: "muro iker", report: relato, conduct: "art. 14 g", family_contacted: true, measure: "tareas", response_format: "json" });
  const inc = prev.structuredContent as { incident_id: string; conduct: { label: string; category: string }; normative: { ref: string } };
  assert.deepEqual([inc.conduct.label, inc.conduct.category, inc.normative.ref], ["FALTA DE RESPETO", "Conductas contrarias", "art. 14 g)"]);
  const filled = textOf(await call("educa_fill_incident", { incident_id: inc.incident_id }));
  assert.match(filled, /Todavía no se ha guardado/);
  assert.match(filled, /12:40 : 13:35 - Tecnología/);
  assert.match(filled, /Propuesta de medida: REALIZACIÓN TAREAS/);
  assert.equal(savedIncidents.length, 0, "rellenar no guarda");
  assert.match(textOf(await call("educa_save_incident", { confirm: true })), /confirma que se ha guardado/);
  const hoy = new Date();
  const fechaHoy = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
  assert.deepEqual(savedIncidents[0], { grupo: "ESO 3ºDEFH cd", alumno: "Muro Etxeberria, Iker", fecha: fechaHoy, espacio: "Sesión presencial", sesion: "12:40 : 13:35 - Tecnología y Digitalización ES3", relato, familia: true, conducta: "FALTA DE RESPETO", medida: "REALIZACIÓN TAREAS", enviado: false });
  // Otro mes, recreo (sin sesión), conducta gravemente perjudicial y "Guardar y enviar"
  const antes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 32);
  const fechaAntes = `${String(antes.getDate()).padStart(2, "0")}/${String(antes.getMonth() + 1).padStart(2, "0")}/${antes.getFullYear()}`;
  const p2 = (await call("educa_preview_incident", { group: "ESO 3º D", student: "Leire Arana", report: relato, conduct: "insubordinacion", date: fechaAntes, place: "recreo", response_format: "json" })).structuredContent as { incident_id: string };
  await call("educa_fill_incident", { incident_id: p2.incident_id });
  const sent = textOf(await call("educa_save_incident", { confirm: true, send: true }));
  assert.match(sent, /Guardar y enviar/);
  assert.match(sent, /Paso de Educa: Envío/);
  assert.equal(savedIncidents[1].grupo, "ESO 3º D", "el nombre exacto gana a una coincidencia parcial de otro apartado");
  assert.deepEqual([savedIncidents[1].fecha, savedIncidents[1].espacio, savedIncidents[1].sesion, savedIncidents[1].conducta, savedIncidents[1].enviado], [fechaAntes, "Recreo", "", "INSUBORDINACIÓN", true]);

  await call("educa_close_browser");
  console.error("\n✅ Prueba superada");
} finally {
  await client.close();
  mock.close();
}
