/**
 * Genera el paquete de un clic para Claude Desktop (build/educa-navarra-mcp.mcpb).
 *   npm run build && npm run pack:mcpb
 *
 * Copia dist/ y las dependencias de producción a build/mcpb, completa el
 * manifest.json con la versión de package.json y la lista de herramientas
 * de src/index.ts, lo valida y lo empaqueta con @anthropic-ai/mcpb.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, "build");
const stage = join(out, "mcpb");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

if (!existsSync(join(root, "dist", "index.js"))) throw new Error("Falta dist/: ejecuta antes npm run build.");

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(root, "dist"), join(stage, "dist"), { recursive: true, filter: src => !src.endsWith(".map") });
for (const f of ["LICENSE", "AVISO-LEGAL.md", "README.md", "package-lock.json"]) cpSync(join(root, f), join(stage, f));
cpSync(join(root, "assets", "icon.png"), join(stage, "icon.png"));

// package.json mínimo: solo lo que necesita el servidor en marcha
const { name, version, description, license, type, dependencies, overrides, engines } = pkg;
writeFileSync(join(stage, "package.json"), JSON.stringify({ name, version, description, license, type, dependencies, overrides, engines }, null, 2));

// Herramientas, sacadas del código para que el manifiesto no se quede viejo
const source = readFileSync(join(root, "src", "index.ts"), "utf8");
const tools = [...source.matchAll(/registerTool\(\s*"([^"]+)",\s*\{\s*title:\s*"([^"]+)"/g)].map(([, name, description]) => ({ name, description }));
if (tools.length === 0) throw new Error("No he encontrado herramientas en src/index.ts.");

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
manifest.version = version;
manifest.tools = tools;
writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));

run(npm, ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], stage);
rmSync(join(stage, "package-lock.json"));

const mcpb = join(root, "node_modules", "@anthropic-ai", "mcpb", "dist", "cli", "cli.js");
run(process.execPath, [mcpb, "validate", join(stage, "manifest.json")]);
const file = join(out, `${name}.mcpb`);
run(process.execPath, [mcpb, "pack", stage, file]);
console.log(`\nPaquete listo: ${file} (${tools.length} herramientas, versión ${version})`);
