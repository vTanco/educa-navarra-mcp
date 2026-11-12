/**
 * Arranque del navegador sin que el docente tenga que instalar nada.
 *
 * Orden de preferencia:
 *  1. browserExecutablePath o browserChannel de la configuración (o EDUCA_BROWSER_CHANNEL),
 *     si se han puesto. "chromium" fuerza el Chromium de Playwright.
 *  2. Google Chrome instalado en el ordenador.
 *  3. Microsoft Edge instalado (viene de serie en Windows).
 *  4. El Chromium de Playwright. Si no está, se descarga una sola vez
 *     (unos 150 MB) en la carpeta de Playwright del usuario.
 *
 * Todo lo que se escribe va a stderr: stdout es el canal del protocolo MCP.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium, type BrowserContext } from "playwright";
import type { EducaConfig } from "./config.js";

type LaunchOptions = Parameters<typeof chromium.launchPersistentContext>[1];

const AUTO_CHANNELS = ["chrome", "msedge"] as const;

function log(message: string): void {
  process.stderr.write(`[educa-mcp] ${message}\n`);
}

/** Playwright avisa así cuando el canal o el ejecutable no existe en este ordenador. */
function isMissingBrowser(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /(is not found|not found at|Executable doesn't exist|Chromium distribution .* is not found|please install|No such file)/i.test(msg);
}

export async function launchEducaBrowser(config: EducaConfig, options: LaunchOptions): Promise<BrowserContext> {
  const profile = config.profileDir;

  if (config.browserExecutablePath) {
    return chromium.launchPersistentContext(profile, { ...options, executablePath: config.browserExecutablePath });
  }

  const wanted = process.env.EDUCA_BROWSER_CHANNEL || config.browserChannel;
  const channels = wanted ? [wanted] : [...AUTO_CHANNELS];
  for (const channel of channels) {
    if (channel === "chromium") break; // forzar el Chromium de Playwright
    try {
      const context = await chromium.launchPersistentContext(profile, { ...options, channel });
      log(`Navegador: ${channel}`);
      return context;
    } catch (err) {
      if (!isMissingBrowser(err)) throw err;
      log(`${channel} no está instalado; pruebo la siguiente opción.`);
    }
  }

  await ensureBundledChromium();
  log("Navegador: Chromium de Playwright");
  return chromium.launchPersistentContext(profile, options);
}

let installing: Promise<void> | null = null;

/** Descarga el Chromium de Playwright si todavía no está. */
export function ensureBundledChromium(): Promise<void> {
  if (existsSync(chromium.executablePath())) return Promise.resolve();
  installing ??= installChromium().finally(() => {
    installing = null;
  });
  return installing;
}

function installChromium(): Promise<void> {
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve("playwright/package.json")), "cli.js");
  log("No hay Chrome ni Edge: descargando Chromium (solo la primera vez, puede tardar un par de minutos)...");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "install", "chromium"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });
    child.stdout.on("data", chunk => process.stderr.write(chunk));
    child.stderr.on("data", chunk => process.stderr.write(chunk));
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0 && existsSync(chromium.executablePath())) {
        log("Chromium instalado.");
        resolve();
      } else {
        reject(
          new Error(
            "No se ha podido descargar Chromium. Instala Google Chrome (https://www.google.com/chrome/) y vuelve a intentarlo, " +
              "o revisa la conexión a internet."
          )
        );
      }
    });
  });
}
