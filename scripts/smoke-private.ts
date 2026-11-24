/**
 * Prueba del modo privado contra el Educa simulado: ningún nombre de alumno llega en las
 * respuestas de las herramientas, los códigos (A01...) funcionan para escribir y guardar,
 * y en los partes el alumno se elige en la ventana.
 *   npm run build && npm run smoke:private
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { startMock, saved } from "./mock-server.js";
import { mockConvivencia, savedIncidents } from "./mock-convivencia.js";

const { server: mock, url } = await startMock();
const home = mkdtempSync(join(tmpdir(), "educa-mcp-priv-"));
const credentials = join(home, "credenciales.json");
writeFileSync(credentials, JSON.stringify({ usuario: "profe", clave: "1234" }));
const client = new Client({ name: "smoke-private", version: "1.0.0" });
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
      EDUCA_BROWSER_CHANNEL: process.env.EDUCA_BROWSER_CHANNEL ?? "chromium",
      EDUCA_CREDENTIALS_FILE: credentials,
      EDUCA_CONFIG: resolve("test/mock/educa.config.json"),
      EDUCA_MCP_HOME: home,
      EDUCA_NOTES_DIR: resolve("test/mock")
      // Sin EDUCA_PRIVATE_MODE: el modo privado está activado por defecto
    },
    stderr: "inherit"
  })
);

type Result = Awaited<ReturnType<typeof client.callTool>>;
const textOf = (r: Result) => (r.content as { type: string; text: string }[]).map(c => c.text).join("\n");
// Nombres y apellidos del Educa simulado que nunca deben aparecer en una respuesta
const FORBIDDEN = /garc[ií]a|p[eé]rez|mart[ií]nez|etxeberria|ruiz|arana|l[oó]pez|fern[aá]ndez|iker|leire|i[ñn]igo|maite|pablo|marta|muro|\bana\b|\bjon\b/i;
async function call(name: string, args: Record<string, unknown> = {}, expectError = false, checkLeaks = true): Promise<Result> {
  const r = await client.callTool({ name, arguments: args });
  const t = textOf(r);
  assert.equal(Boolean(r.isError), expectError, `${name} ${expectError ? "debería fallar" : "falló"}: ${t}`);
  if (!checkLeaks) return r;
  const leak = FORBIDDEN.exec(t + JSON.stringify(r.structuredContent ?? {}));
  assert.equal(leak, null, `${name} devuelve un nombre de alumno ("${leak?.[0]}") en modo privado:\n${t}`);
  console.error(`\n--- ${name} ${JSON.stringify(args)}\n${t.slice(0, 1200)}`);
  return r;
}

try {
  assert.match(client.getInstructions() ?? "", /Modo privado/);
  await call("educa_navigate", { url });
  await call("educa_login", { wait_minutes: 0.5 });

  // Ficheros: solo recuentos
  const file = (await call("educa_load_grades_file", { file_path: resolve("test/mock/notas.csv") })).structuredContent as { private_mode: boolean; count: number; grades?: unknown };
  assert.equal(file.private_mode, true);
  assert.equal(file.count, 6);
  assert.equal(file.grades, undefined);

  // Lectura de la tabla con códigos
  await call("educa_navigate", { url: url + "cuaderno" });
  const sheet = (await call("educa_read_grade_sheet", { response_format: "json" })).structuredContent as { students: { name: string }[] };
  assert.equal(sheet.students.length, 6);
  assert.ok(sheet.students.every(s => /^A\d{2}$/.test(s.name)), "los alumnos deben aparecer como códigos");
  await call("educa_read_grade_sheet");
  await call("educa_inspect_page");
  assert.match(textOf(await call("educa_dump_html", {}, true)), /modo privado/);

  // Vista previa por códigos (como haría Claude) y por nombres (si el docente los dicta): ninguno vuelve en la respuesta
  const [a1, a2] = [sheet.students[0].name, sheet.students[1].name];
  const pv = (await call("educa_preview_grades", { grades: [{ student: a1, grade: "8", comment: "Muy buen trimestre, {nombre}." }, { student: a2, grade: "5" }, { student: "López Sanz, Marta", grade: "6" }], response_format: "json" })).structuredContent as { plan_id: string; private_mode: boolean; summary: Record<string, number>; items: { student: string }[] };
  assert.equal(pv.private_mode, true);
  assert.equal(pv.summary.cambia, 2);
  assert.ok(pv.items.every(i => /^A\d{2}$/.test(i.student)));
  const md = textOf(await call("educa_preview_grades", { grades: [{ student: a1, grade: "8", comment: "Muy buen trimestre, {nombre}." }, { student: a2, grade: "5" }] }));
  assert.match(md, /pestaña/);
  const planId = /plan ([0-9a-f]{8})/.exec(md)![1];
  await call("educa_fill_grades", { plan_id: planId });
  await call("educa_save_grades", { confirm: true });
  assert.deepEqual(saved["cuaderno"], { "1001": "NT", "1002": "SU" });
  assert.equal(saved["observaciones"]?.["1001"], "Muy buen trimestre, Ana.", "{nombre} se rellena en local");

  // Partes: el docente elige al alumno en la ventana (aquí lo "pulsa" el simulador)
  mockConvivencia.autoPick = "Arana Goñi, Leire";
  // El relato no puede nombrar a alumnos del grupo (la respuesta repite la palabra que escribió el propio modelo)
  const relato = "Durante la sesión de Tecnología, el alumno se ha dirigido al profesor con un tono despectivo y se ha negado a guardar el teléfono móvil tras dos indicaciones.";
  const named = textOf(await call("educa_preview_incident", { group: "3ºDEFH", report: relato.replace("el alumno", "Muro"), conduct: "art. 14 g" }, true, false));
  assert.match(named, /nombres o apellidos/);
  assert.ok(!/Arana|Leire/i.test(named), "no debe decir quién es el alumno elegido");
  const prev = (await call("educa_preview_incident", { group: "3ºDEFH", report: relato, conduct: "art. 14 g", response_format: "json" })).structuredContent as { incident_id: string; student: string };
  assert.match(prev.student, /^A\d{2}$/);
  mockConvivencia.autoPick = null;
  await call("educa_fill_incident", { incident_id: prev.incident_id });
  assert.match(textOf(await call("educa_save_incident", { confirm: true })), /confirma que se ha guardado/);
  assert.equal(savedIncidents.at(-1)?.alumno, "Arana Goñi, Leire");

  await call("educa_close_browser");
  console.log("\n✅ Prueba del modo privado superada");
} finally {
  await client.close();
  mock.close();
}
