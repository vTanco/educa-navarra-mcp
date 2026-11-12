/**
 * Configuración del servidor.
 *
 * Educa no publica una API ni documenta su HTML, así que todo lo que depende
 * de la página (URLs, selectores, texto del botón de guardar) se puede
 * ajustar en un fichero JSON sin tocar el código. Los valores por defecto
 * usan heurísticas que funcionan con tablas de notas "normales"
 * (una fila por alumno con un <select> o <input> para la nota).
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod/v4";

/** Carpeta del servidor (la que contiene dist/ y package.json). */
export const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DATA_DIR = process.env.EDUCA_MCP_HOME ?? join(homedir(), ".educa-mcp");

const ConfigSchema = z.object({
  /** Página de entrada de Educa. */
  baseUrl: z.string().default("https://educa.navarra.es/"),
  /** Solo se navega a estos dominios (y sus subdominios). */
  allowedHosts: z.array(z.string()).default(["educa.navarra.es", "navarra.es"]),
  /** Mostrar el navegador. Tiene que ser true para poder iniciar sesión a mano. */
  headless: z.boolean().default(false),
  /** "chrome" o "msedge" para usar el navegador ya instalado; vacío = Chromium de Playwright. */
  browserChannel: z.string().optional(),
  /** Ruta a un ejecutable de Chrome/Chromium concreto (alternativa a browserChannel). */
  browserExecutablePath: z.string().optional(),
  /** Carpeta del perfil del navegador (mantiene la sesión entre usos). */
  profileDir: z.string().default(join(DATA_DIR, "profile")),
  /** Carpeta para las capturas de pantalla. */
  screenshotDir: z.string().default(join(DATA_DIR, "capturas")),
  /** Fichero local con {"usuario": "...", "clave": "..."} para el login automático (opcional). */
  credentialsFile: z.string().default(join(DATA_DIR, "credenciales.json")),
  /** Minutos que se espera a que el profesor inicie sesión. */
  loginTimeoutMinutes: z.number().positive().default(5),

  login: z
    .object({
      /** Si existe en la página, la sesión está iniciada. */
      loggedInSelector: z.string().optional(),
      /** Si existe en la página, estamos en la pantalla de login. */
      loginFormSelector: z.string().default("input[type=password]"),
      /** Selectores opcionales para rellenar usuario/contraseña desde EDUCA_USER / EDUCA_PASSWORD. */
      userSelector: z.string().optional(),
      passwordSelector: z.string().optional(),
      submitSelector: z.string().optional()
    })
    .default({ loginFormSelector: "input[type=password]" }),

  gradeSheet: z
    .object({
      /** Filas de la tabla de notas. Vacío = detección automática. */
      rowSelector: z.string().optional(),
      /** Dentro de la fila: celda con el nombre del alumno. Vacío = la celda de texto más larga. */
      nameSelector: z.string().optional(),
      /** Dentro de la fila: campo de la nota. Vacío = el único campo editable de la columna elegida. */
      gradeFieldSelector: z.string().optional(),
      /** Dentro de la fila: identificador del alumno (NIA, nº de lista...), opcional. */
      studentIdSelector: z.string().optional()
    })
    .default({}),

  grades: z
    .object({
      min: z.number().default(0),
      max: z.number().default(10),
      /** Rechazar notas con decimales (las finales de ESO/Bachillerato son enteras). */
      integerOnly: z.boolean().default(true),
      /** Separador decimal que espera Educa en los campos de texto. */
      decimalSeparator: z.enum([",", "."]).default(","),
      /** Valores no numéricos aceptados tal cual (p. ej. "NP", "EX"). */
      extraValues: z.array(z.string()).default([])
    })
    .default({ min: 0, max: 10, integerOnly: true, decimalSeparator: ",", extraValues: [] }),

  save: z
    .object({
      /** Botón de guardar. Vacío = botón cuyo texto es Guardar / Grabar / Aceptar. */
      buttonSelector: z.string().optional(),
      buttonTextPattern: z.string().default("^\\s*(guardar|grabar|guardar cambios|aceptar)\\s*$"),
      /** Texto que indica que se guardó bien / mal. */
      successPattern: z.string().default("(correctamente|guardad[oa]s?|grabad[oa]s?|se han actualizado)"),
      errorPattern: z.string().default("(error|no se ha podido|incorrect[oa]|obligatori[oa])")
    })
    .default({
      buttonTextPattern: "^\\s*(guardar|grabar|guardar cambios|aceptar)\\s*$",
      successPattern: "(correctamente|guardad[oa]s?|grabad[oa]s?|se han actualizado)",
      errorPattern: "(error|no se ha podido|incorrect[oa]|obligatori[oa])"
    }),

  /** El servidor nunca pulsa elementos cuyo texto encaje con esto. */
  forbiddenClickPattern: z
    .string()
    .default("(cerrar|firmar|bloquear|eliminar|borrar|validar acta|publicar|enviar a familias|desbloquear)")
});

export type EducaConfig = z.infer<typeof ConfigSchema>;

/**
 * Credenciales para el login automático: variables EDUCA_USER / EDUCA_PASSWORD
 * o el fichero credentialsFile. Los mensajes de error nunca incluyen los valores.
 */
export function loadCredentials(config: EducaConfig): { user: string; password: string; source: string } | null {
  // Claude Desktop deja "${user_config.x}" sin sustituir cuando el campo opcional se queda vacío
  for (const key of ["EDUCA_USER", "EDUCA_PASSWORD"]) {
    if (process.env[key]?.trim().startsWith("${") || !process.env[key]?.trim()) delete process.env[key];
  }
  if (process.env.EDUCA_USER && process.env.EDUCA_PASSWORD) {
    return { user: process.env.EDUCA_USER, password: process.env.EDUCA_PASSWORD, source: "variables de entorno" };
  }
  // Por orden: el fichero configurado (~/.educa-mcp/credenciales.json) o credenciales.json en la carpeta del servidor
  const file = [config.credentialsFile, join(PROJECT_DIR, "credenciales.json")].find(f => existsSync(f));
  if (!file) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`El fichero de credenciales ${file} no es un JSON válido. Debe ser {"usuario": "...", "clave": "..."}.`);
  }
  const user = raw.usuario ?? raw.user ?? raw.username;
  const password = raw.clave ?? raw.contraseña ?? raw.password;
  if (typeof user !== "string" || typeof password !== "string" || !user || !password) {
    throw new Error(`El fichero de credenciales ${file} debe tener los campos "usuario" y "clave".`);
  }
  if (/^(tu_|TU_|escribe)/.test(user) || /^(tu_|TU_|escribe)/.test(password)) return null; // plantilla sin rellenar
  return { user, password, source: file };
}

export function loadConfig(): { config: EducaConfig; path: string | null } {
  const candidates = [
    process.env.EDUCA_CONFIG,
    resolve("educa.config.json"),
    join(DATA_DIR, "educa.config.json")
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (existsSync(path)) {
      const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
      const parsed = ConfigSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`El fichero de configuración ${path} no es válido: ${z.prettifyError(parsed.error)}`);
      }
      return { config: applyEnv(parsed.data), path };
    }
  }
  return { config: applyEnv(ConfigSchema.parse({})), path: null };
}

function applyEnv(config: EducaConfig): EducaConfig {
  if (process.env.EDUCA_BASE_URL) config.baseUrl = process.env.EDUCA_BASE_URL;
  if (process.env.EDUCA_CREDENTIALS_FILE) config.credentialsFile = process.env.EDUCA_CREDENTIALS_FILE;
  if (process.env.EDUCA_BROWSER_PATH) config.browserExecutablePath = process.env.EDUCA_BROWSER_PATH;
  if (process.env.EDUCA_HEADLESS) config.headless = process.env.EDUCA_HEADLESS === "1";
  if (process.env.EDUCA_ALLOWED_HOSTS) config.allowedHosts = process.env.EDUCA_ALLOWED_HOSTS.split(",");
  return config;
}
