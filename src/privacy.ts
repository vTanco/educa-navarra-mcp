/**
 * Modo privado: el modelo de IA no ve a ningún alumno.
 *
 * Con el modo privado activado (por defecto), las respuestas de las herramientas
 * sustituyen cada nombre por un código (A01, A02...) y no incluyen NIA ni el texto
 * de las observaciones. La tabla de correspondencias vive solo en la memoria de este
 * proceso: no se escribe en disco y se pierde al cerrar la aplicación. El docente ve
 * los nombres reales en una pestaña local del navegador del conector.
 *
 * Se desactiva con el ajuste "Modo privado" de Claude Desktop, EDUCA_PRIVATE_MODE=0
 * o "privateMode": false en educa.config.json.
 */
import { normalize } from "./grades.js";

const CODE_RE = /^\s*A(\d{2,3})\s*$/i;
const NAME_STOPWORDS = new Set(["de", "del", "la", "las", "los", "y", "i", "e", "san", "santa", "el"]);

/** Interpreta el valor de EDUCA_PRIVATE_MODE (o el ajuste de Claude Desktop). null = sin valor. */
export function parsePrivateFlag(value: string | undefined): boolean | null {
  const v = value?.trim().toLowerCase();
  if (!v || v.startsWith("${")) return null;
  if (["0", "false", "no", "off", "desactivado"].includes(v)) return false;
  if (["1", "true", "si", "sí", "yes", "on", "activado"].includes(v)) return true;
  return null;
}

export class Privacy {
  private readonly byKey = new Map<string, string>();
  private readonly byCode = new Map<string, string>();

  constructor(public readonly enabled: boolean) {}

  /** Código estable para un alumno (mismo nombre, mismo código mientras dure la sesión). */
  code(name: string): string {
    const key = normalize(name).split(" ").filter(Boolean).sort().join(" ");
    const known = this.byKey.get(key);
    if (known) return known;
    const n = this.byKey.size + 1;
    const code = `A${String(n).padStart(n > 99 ? 3 : 2, "0")}`;
    this.byKey.set(key, code);
    this.byCode.set(code, name);
    return code;
  }

  /** Lo que ve el modelo: el código en modo privado, el nombre si no. */
  show(name: string | null | undefined): string {
    if (!name) return "—";
    return this.enabled ? this.code(name) : name;
  }

  /** Si el texto es un código conocido (A07), devuelve el nombre real; si no, el texto tal cual. */
  resolve(input: string): string {
    const m = CODE_RE.exec(input);
    if (!m) return input;
    return this.byCode.get(`A${m[1]}`) ?? input;
  }

  isCode(input: string): boolean {
    return CODE_RE.test(input);
  }

  /** Red de seguridad: sustituye en un texto libre los nombres ya conocidos por su código. */
  redact(text: string): string {
    if (!this.enabled || !this.byCode.size) return text;
    let out = text;
    // Primero los nombres más largos, para no dejar trozos sueltos
    const entries = [...this.byCode.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [code, name] of entries) {
      for (const variant of nameVariants(name)) {
        if (variant.length < 4) continue;
        out = out.replace(new RegExp(escapeRe(variant), "gi"), code);
      }
    }
    return out;
  }

  clear(): void {
    this.byKey.clear();
    this.byCode.clear();
  }
}

/** "Muro García, Iker" -> ["Muro García, Iker", "Iker Muro García"]. */
function nameVariants(name: string): string[] {
  const clean = name.replace(/\s+/g, " ").trim();
  const variants = [clean];
  const comma = clean.indexOf(",");
  if (comma > 0) variants.push(`${clean.slice(comma + 1).trim()} ${clean.slice(0, comma).trim()}`);
  return variants;
}

function escapeRe(s: string): string {
  // Tolera espacios de más y alrededor de la coma ("GARCÍA LÓPEZ , Ana")
  return s
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s*,\s*/g, "\\s*,\\s*")
    .replace(/ +/g, "\\s+");
}

/**
 * Busca en un texto libre (el relato de un parte) nombres o apellidos de alumnos de una lista.
 * Devuelve las palabras encontradas. Solo cuenta palabras de 4 letras o más para no confundir
 * partículas o palabras comunes cortas.
 */
export function namesInText(text: string, students: string[]): string[] {
  const words = new Set(normalize(text).split(" ").filter(Boolean));
  const found = new Set<string>();
  for (const student of students) {
    for (const token of normalize(student).split(" ")) {
      if (token.length >= 4 && !NAME_STOPWORDS.has(token) && words.has(token)) found.add(token);
    }
  }
  return [...found];
}

/** Nombre de pila para el comodín {nombre} de las observaciones: "MURO GARCÍA, IKER" -> "Iker". */
export function firstName(educaName: string): string {
  const clean = educaName.replace(/\s+/g, " ").trim();
  const comma = clean.indexOf(",");
  const given = comma > 0 ? clean.slice(comma + 1).trim() : clean.split(" ")[0] ?? clean;
  return given
    .toLowerCase()
    .split(" ")
    .map(w => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Sustituye {nombre} (o {Nombre}) en una observación por el nombre de pila del alumno. */
export function fillNamePlaceholder(comment: string, educaName: string): string {
  return /\{\s*nombre\s*\}/i.test(comment) ? comment.replace(/\{\s*nombre\s*\}/gi, firstName(educaName)) : comment;
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Página HTML sencilla para la pestaña local con los nombres reales. */
export function localPage(title: string, intro: string, headers: string[], rows: string[][], footer = ""): string {
  const head = headers.map(h => `<th>${escHtml(h)}</th>`).join("");
  const body = rows.map(r => `<tr>${r.map(c => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:24px;color:#1f2328;background:#fff}
h1{font-size:20px;margin:0 0 4px}
p{margin:4px 0 12px;color:#57606a;font-size:14px}
.aviso{background:#eef6ee;border:1px solid #b7dcb7;padding:8px 12px;border-radius:6px;color:#1f4d1f}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f6f8fa;position:sticky;top:0}
tr:nth-child(even) td{background:#fafbfc}
</style></head><body>
<h1>${escHtml(title)}</h1>
<p class="aviso">Esta página solo existe en tu ordenador. Claude no ve estos nombres: trabaja con los códigos de la columna "Código".</p>
<p>${escHtml(intro)}</p>
<table><thead><tr>${head}</tr></thead><tbody>
${body}
</tbody></table>
${footer ? `<p>${escHtml(footer)}</p>` : ""}
</body></html>`;
}
