/**
 * Control del navegador con Playwright.
 *
 * Se usa un perfil persistente: el profesor inicia sesión una vez en la
 * ventana que abre el servidor (con su usuario de Educa, Cl@ve o
 * certificado) y la sesión se reutiliza mientras Educa la mantenga.
 * Las contraseñas nunca pasan por el modelo.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type BrowserContext, type Frame, type Locator, type Page } from "playwright";
import { loadCredentials, type EducaConfig } from "./config.js";
import type { GradeSheet } from "./grades.js";
import { launchEducaBrowser } from "./launch.js";

export class EducaBrowser {
  private context: BrowserContext | null = null;

  constructor(private readonly config: EducaConfig) {}

  // ---------- Ciclo de vida ----------

  async page(): Promise<Page> {
    if (!this.context) {
      mkdirSync(this.config.profileDir, { recursive: true });
      this.context = await launchEducaBrowser(this.config, {
        headless: this.config.headless,
        viewport: this.config.headless ? { width: 1366, height: 900 } : null,
        locale: "es-ES",
        args: this.config.headless ? [] : ["--start-maximized"]
      });
      this.context.on("close", () => {
        this.context = null;
      });
    }
    const pages = this.context.pages().filter(p => !p.isClosed());
    return pages.at(-1) ?? (await this.context.newPage());
  }

  get isOpen(): boolean {
    return this.context !== null;
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = null;
  }

  // ---------- Navegación y sesión ----------

  assertAllowed(url: string): void {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      throw new Error(`"${url}" no es una URL válida.`);
    }
    const ok = this.config.allowedHosts.some(h => host === h || host.endsWith(`.${h}`));
    if (!ok) throw new Error(`Por seguridad solo se navega a ${this.config.allowedHosts.join(", ")}; "${host}" no está permitido (ajusta allowedHosts en la configuración si hace falta).`);
  }

  async goto(url: string): Promise<Page> {
    this.assertAllowed(url);
    const page = await this.page();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await settle(page);
    return page;
  }

  private async anyFrameHas(page: Page, selector: string): Promise<boolean> {
    for (const frame of page.frames()) {
      if (await frame.locator(selector).first().isVisible().catch(() => false)) return true;
    }
    return false;
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.context) return false;
    const page = await this.page();
    const url = page.url();
    if (!url.startsWith("http")) return false;
    try {
      this.assertAllowed(url);
    } catch {
      return false;
    }
    const { loggedInSelector, loginFormSelector } = this.config.login;
    if (loggedInSelector) return this.anyFrameHas(page, loggedInSelector);
    return !(await this.anyFrameHas(page, loginFormSelector));
  }

  async login(waitMinutes: number, onWaiting?: () => Promise<void>): Promise<{ loggedIn: boolean; url: string; usedCredentials: boolean }> {
    const page = await this.page();
    let current = page.url();
    try {
      this.assertAllowed(current);
    } catch {
      await this.goto(this.config.baseUrl);
      current = page.url();
    }
    if (await this.isLoggedIn()) return { loggedIn: true, url: page.url(), usedCredentials: false };

    let usedCredentials = false;
    const creds = loadCredentials(this.config);
    if (creds) {
      const attempt = await this.fillLoginForm(page, creds.user, creds.password);
      if (attempt === "submitted") {
        usedCredentials = true;
        await settle(page, 1500);
        if (!(await this.isLoggedIn()) && ((await this.anyFrameHas(page, this.config.login.passwordSelector ?? this.config.login.loginFormSelector)) || (await this.pageSays(page, /(incorrect|err[oó]ne|no v[aá]lid|inv[aá]lid|denegad|bloquead)/i)))) {
          // No se reintenta: varios intentos fallidos podrían bloquear la cuenta.
          throw new Error(`Educa no ha aceptado el usuario y la contraseña de ${creds.source} (sigue en la pantalla de acceso o muestra un error). Revisa el fichero; no lo vuelvo a intentar para no bloquear tu cuenta. También puedes iniciar sesión a mano en la ventana.`);
        }
      }
      // "no_form": no hay formulario de usuario/contraseña en esta página (p. ej. Cl@ve o un botón "Acceder"); se espera al login manual.
    } else if (this.config.headless) {
      throw new Error("El navegador está en modo oculto (headless) y no hay credenciales configuradas, así que no puedes iniciar sesión a mano. Pon headless=false en la configuración.");
    }

    await onWaiting?.();
    const deadline = Date.now() + waitMinutes * 60_000;
    while (Date.now() < deadline) {
      if (await this.isLoggedIn()) return { loggedIn: true, url: (await this.page()).url(), usedCredentials };
      await new Promise(r => setTimeout(r, 1500));
    }
    return { loggedIn: false, url: (await this.page()).url(), usedCredentials };
  }

  private async pageSays(page: Page, re: RegExp): Promise<boolean> {
    for (const frame of page.frames()) {
      const body = await frame.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (re.test(body)) return true;
    }
    return false;
  }

  /**
   * Rellena el formulario de acceso. Solo escribe en marcos de dominios permitidos,
   * para no entregar nunca la contraseña a otra web.
   */
  private async fillLoginForm(page: Page, user: string, password: string): Promise<"submitted" | "no_form"> {
    const { userSelector, passwordSelector, submitSelector } = this.config.login;
    const pwSel = passwordSelector ?? "input[type=password]";
    for (const frame of page.frames()) {
      try {
        this.assertAllowed(frame.url());
      } catch {
        continue;
      }
      const pw = frame.locator(pwSel).filter({ visible: true }).first();
      if ((await pw.count()) === 0) continue;
      let userField: Locator;
      if (userSelector) userField = frame.locator(userSelector).first();
      else {
        const found = await pw.evaluate(markUserFieldBefore);
        if (!found) continue;
        userField = frame.locator("[data-educa-mcp-user]").first();
      }
      await userField.fill(user);
      await pw.fill(password);
      if (submitSelector) await frame.locator(submitSelector).first().click();
      else await pw.press("Enter");
      return "submitted";
    }
    return "no_form";
  }

  // ---------- Inspección ----------

  async inspect(maxItems: number): Promise<PageSummary> {
    const page = await this.page();
    const frames: FrameSummary[] = [];
    for (const frame of page.frames()) {
      const summary = await frame.evaluate(summarizeFrame, maxItems).catch((e: Error) => ({ ...EMPTY_SUMMARY, messages: [`(no se pudo leer este marco: ${e.message.slice(0, 120)})`] }));
      if (frame.url() === "about:blank" && !summary.fields.length && !summary.tables.length) continue;
      frames.push({ ...summary, url: frame.url(), isMain: frame === page.mainFrame() });
    }
    return { url: page.url(), title: await page.title(), frames };
  }

  async dumpHtml(selector: string | undefined, maxChars: number, frameFilter?: string): Promise<{ url: string; html: string }[]> {
    const page = await this.page();
    const out: { url: string; html: string }[] = [];
    for (const frame of page.frames()) {
      if (frameFilter && !frame.url().includes(frameFilter)) continue;
      const html = await frame.evaluate(simplifiedHtml, { selector: selector ?? null, maxChars }).catch(() => null);
      if (html) out.push({ url: frame.url(), html });
    }
    return out;
  }

  async screenshot(label: string): Promise<string> {
    const page = await this.page();
    mkdirSync(this.config.screenshotDir, { recursive: true });
    const safe = label.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40);
    const path = join(this.config.screenshotDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${safe}.png`);
    await page.screenshot({ path, fullPage: true });
    return path;
  }

  // ---------- Acciones de navegación dentro de Educa ----------

  private forbidden(text: string): boolean {
    return new RegExp(this.config.forbiddenClickPattern, "i").test(text);
  }

  async click(target: { text?: string; selector?: string; exact?: boolean }): Promise<string> {
    const page = await this.page();
    let locator: Locator | null = null;
    for (const frame of page.frames()) {
      const candidates = target.selector
        ? frame.locator(target.selector)
        : frame
            .getByRole("link", { name: target.text, exact: target.exact })
            .or(frame.getByRole("button", { name: target.text, exact: target.exact }))
            .or(frame.getByRole("tab", { name: target.text, exact: target.exact }))
            .or(frame.getByRole("menuitem", { name: target.text, exact: target.exact }))
            .or(frame.getByText(target.text ?? "", { exact: target.exact }));
      const count = await candidates.count();
      for (let i = 0; i < count; i++) {
        if (await candidates.nth(i).isVisible().catch(() => false)) {
          locator = candidates.nth(i);
          break;
        }
      }
      if (locator) break;
    }
    if (!locator) throw new Error(`No encuentro ningún elemento visible ${target.selector ? `con el selector ${target.selector}` : `con el texto "${target.text}"`}. Usa educa_inspect_page para ver los enlaces y botones disponibles.`);

    const label = ((await locator.innerText().catch(() => "")) || (await locator.getAttribute("value")) || (await locator.getAttribute("title")) || target.text || "").trim();
    if (this.forbidden(label)) throw new Error(`Por seguridad no pulso "${label}": parece una acción irreversible (cerrar, firmar, borrar...). Hazla tú a mano en Educa.`);
    await locator.click();
    await settle(page);
    return label;
  }

  async selectFilter(fieldHint: string, option: string): Promise<{ field: string; selected: string }> {
    const page = await this.page();
    for (const frame of page.frames()) {
      const keys = await frame.evaluate(markSelectsMatching, fieldHint).catch(() => [] as string[]);
      for (const key of keys) {
        const select = frame.locator(`[data-educa-mcp-filter="${key}"]`);
        const options = await select.locator("option").evaluateAll(els => els.map(e => ({ value: (e as HTMLOptionElement).value, text: (e.textContent ?? "").trim() })));
        const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
        const wanted = norm(option);
        const hit = options.find(o => norm(o.text) === wanted) ?? options.find(o => norm(o.text).includes(wanted)) ?? options.find(o => o.value === option);
        if (!hit) throw new Error(`El desplegable "${fieldHint}" no tiene la opción "${option}". Opciones: ${options.map(o => o.text).join(" / ")}`);
        await select.selectOption(hit.value);
        await settle(page);
        return { field: fieldHint, selected: hit.text };
      }
    }
    // Desplegables "a medida" (con buscador, como los de Educa-Gestión): pulsar el desplegable y luego la opción
    for (const frame of page.frames()) {
      const found = await frame.evaluate(markCustomDropdown, fieldHint).catch(() => false);
      if (!found) continue;
      await frame.locator("[data-educa-mcp-dd]").first().click();
      await page.waitForTimeout(600);
      // Buscador del propio desplegable (o de su panel abierto); nunca otros buscadores de la página
      const searchBox = frame.locator("[data-educa-mcp-dd] input, .p-select-overlay input, .p-dropdown-panel input, .ng-dropdown-panel input").filter({ visible: true }).first();
      const typed = (await searchBox.count()) > 0 && (await searchBox.fill(option).then(() => true).catch(() => false));
      await page.waitForTimeout(600);
      const picked = await frame.evaluate(clickDropdownOption, option);
      if (!picked.ok) {
        if (typed) await searchBox.fill("").catch(() => undefined); // no dejar el filtro escrito
        await page.keyboard.press("Escape").catch(() => undefined);
        throw new Error(`El desplegable "${fieldHint}" no tiene la opción "${option}". Opciones visibles: ${picked.options.join(" / ") || "(ninguna)"}`);
      }
      await settle(page);
      return { field: fieldHint, selected: picked.text };
    }
    throw new Error(`No encuentro ningún desplegable cuyo nombre o etiqueta contenga "${fieldHint}". Usa educa_inspect_page para ver los campos.`);
  }

  // ---------- Tabla de notas ----------

  /**
   * Lee la tabla de notas. Con probeOptions abre (y cierra con Escape, sin elegir nada) el
   * desplegable de la primera nota editable para conocer las opciones reales de esa pantalla.
   */
  async readGradeSheet(column?: string, probeOptions = false): Promise<GradeSheet> {
    const page = await this.page();
    let best: GradeSheet | null = null;
    let bestScore = -1;
    for (const frame of page.frames()) {
      const result = await frame.evaluate(extractGradeSheet, { sel: this.config.gradeSheet, column: column ?? null }).catch(() => null);
      if (!result) continue;
      const score = result.rows.filter(r => r.field).length * 1000 + result.editableColumns.length;
      if (score > bestScore) {
        best = { ...result, frameUrl: frame.url() };
        bestScore = score;
      }
    }
    if (!best || best.rows.length === 0) {
      throw new Error("No encuentro una tabla de notas con campos editables en la página actual. Navega en Educa hasta la pantalla de calificaciones del grupo, materia y evaluación (puedes usar educa_click / educa_select_filter) y vuelve a intentarlo.");
    }
    if (probeOptions) await this.probeOptions(best).catch(() => undefined);
    return best;
  }

  private async probeOptions(sheet: GradeSheet): Promise<void> {
    const fields = sheet.rows.map(r => r.field).filter((f): f is NonNullable<typeof f> => f !== null && !f.disabled);
    const first = fields.find(f => f.type === "p-select" || f.type === "p-select-editable");
    if (!first) return;
    const page = await this.page();
    const loc = await this.locateField(first.key);
    if (!loc) return;
    const opener = first.type === "p-select" ? loc : loc.locator("xpath=ancestor::p-select[1]").locator(".p-select-dropdown, [data-pc-section=dropdown]").first();
    if ((await opener.count()) === 0) return;
    await opener.scrollIntoViewIfNeeded().catch(() => undefined);
    await opener.click({ timeout: 3000 });
    const items = page.locator(".p-select-overlay li[role=option]").filter({ visible: true });
    await items.first().waitFor({ state: "visible", timeout: 2500 }).catch(() => undefined);
    const texts = (await items.allInnerTexts().catch(() => [] as string[])).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(200);
    if (!texts.length) return; // no se han podido leer: se mantiene lo deducido de la leyenda
    const options = [...new Set(texts)].map(t => ({ value: t, text: t }));
    for (const f of fields) if (f.type === first.type) f.options = options;
  }

  private async locateField(key: string): Promise<Locator | null> {
    const page = await this.page();
    for (const frame of page.frames()) {
      const loc = frame.locator(`[data-educa-mcp="${key}"]`);
      if ((await loc.count()) > 0) return loc.first();
    }
    return null;
  }

  async setField(key: string, tag: string, value: string): Promise<string> {
    const loc = await this.locateField(key);
    if (!loc) throw new FieldGone(key);
    if (tag === "pselect") {
      // Desplegable PrimeNG de Educa-Gestión: abrir y pulsar la opción exacta
      const page = await this.page();
      await loc.scrollIntoViewIfNeeded();
      await loc.click();
      const option = page.locator(".p-select-overlay li[role=option]").filter({ visible: true }).filter({ hasText: new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }).first();
      try {
        await option.click({ timeout: 5000 });
      } catch (e) {
        await page.keyboard.press("Escape").catch(() => undefined);
        throw new Error(`No aparece la opción "${value}" en el desplegable de nota.`);
      }
      await page.waitForTimeout(400);
      const after = await this.locateField(key);
      if (!after) return value;
      return ((await after.locator("[role=combobox]").first().innerText().catch(() => "")) || "").trim();
    } else if (tag === "select") {
      await loc.selectOption(value);
    } else {
      await loc.scrollIntoViewIfNeeded().catch(() => undefined);
      await loc.fill(value);
      await loc.dispatchEvent("change");
      await loc.blur();
      await (await this.page()).waitForTimeout(300);
    }
    const page = await this.page();
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    const after = await this.locateField(key);
    if (!after) return value; // la página se recargó tras el cambio; se comprueba al releer
    return after.inputValue();
  }

  async save(): Promise<{ button: string; message: string | null; outcome: "ok" | "error" | "desconocido" }> {
    const page = await this.page();
    const { buttonSelector, buttonTextPattern, successPattern, errorPattern } = this.config.save;
    let button: Locator | null = null;
    for (const frame of page.frames()) {
      const candidates = buttonSelector
        ? frame.locator(buttonSelector)
        : frame.locator("lib-btn-aceptar-cancelar button, button, input[type=submit], input[type=button], a[role=button], a.btn, a.boton").filter({ visible: true });
      const n = await candidates.count();
      for (let i = 0; i < n; i++) {
        const c = candidates.nth(i);
        const label = ((await c.innerText().catch(() => "")) || (await c.getAttribute("value")) || "").trim();
        if (buttonSelector || new RegExp(buttonTextPattern, "i").test(label)) {
          if (this.forbidden(label)) continue;
          button = c;
          break;
        }
      }
      if (button) break;
    }
    if (!button) throw new Error("No encuentro el botón de guardar. Configura save.buttonSelector o save.buttonTextPattern (educa_inspect_page muestra los botones).");
    const label = ((await button.innerText().catch(() => "")) || (await button.getAttribute("value")) || "Guardar").trim();

    page.once("dialog", d => void d.accept()); // confirmaciones tipo "¿Desea guardar?"
    await button.click();
    await settle(page, 3000);

    const okRe = new RegExp(successPattern, "i");
    const errRe = new RegExp(errorPattern, "i");
    for (const frame of page.frames()) {
      const text = await frame.evaluate(collectMessages).catch(() => [] as string[]);
      const err = text.find(t => errRe.test(t));
      if (err) return { button: label, message: err, outcome: "error" };
      const ok = text.find(t => okRe.test(t));
      if (ok) return { button: label, message: ok, outcome: "ok" };
    }
    return { button: label, message: null, outcome: "desconocido" };
  }
}

export class FieldGone extends Error {
  constructor(readonly key: string) {
    super(`El campo ${key} ya no está en la página`);
  }
}

async function settle(page: Page, extraMs = 800): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(extraMs);
}

// ---------- Funciones que se ejecutan dentro de la página ----------
// Deben ser autocontenidas: Playwright las serializa y las ejecuta en el navegador.

export interface FrameSummary {
  url: string;
  isMain: boolean;
  headings: string[];
  tables: { index: number; headers: string[]; rows: number; rowsWithFields: number; sample: string[][] }[];
  fields: { label: string; tag: string; type: string; name: string; id: string; value: string; options?: string[] }[];
  clickables: string[];
  messages: string[];
}

export interface PageSummary {
  url: string;
  title: string;
  frames: FrameSummary[];
}

const EMPTY_SUMMARY: Omit<FrameSummary, "url" | "isMain"> = { headings: [], tables: [], fields: [], clickables: [], messages: [] };

function summarizeFrame(maxItems: number): Omit<FrameSummary, "url" | "isMain"> {
  const visible = (el: Element) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const s = getComputedStyle(el as HTMLElement);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const labelFor = (el: Element) => {
    const id = el.getAttribute("id");
    const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const labelledBy = el.getAttribute("aria-labelledby")?.split(/\s+/).map(i => document.getElementById(i)?.textContent ?? "").join(" ");
    const field = el.closest("mat-form-field, .mat-form-field, .mat-mdc-form-field, .form-group, .form-field, .p-field, .field, .campo, td, li");
    const fieldLabel = field?.querySelector("label, mat-label, .label, .etiqueta")?.textContent;
    const prev = el.previousElementSibling && !el.previousElementSibling.matches("input,select,textarea") ? el.previousElementSibling.textContent : "";
    return clean(byFor?.textContent || el.closest("label")?.textContent || el.getAttribute("aria-label") || labelledBy || fieldLabel || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("formcontrolname") || prev || "").slice(0, 80);
  };
  const inTable = (el: Element) => Boolean(el.closest("table"));

  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,legend,.titulo,.title,caption,[role=dialog] [class*=title],mat-dialog-container h2,.modal-title,.mat-dialog-title,.mat-mdc-dialog-title")].filter(visible).map(e => clean(e.textContent)).filter(Boolean).slice(0, 15);

  const tables = [...document.querySelectorAll("table")]
    .filter(visible)
    .map((t, index) => {
      const rows = [...t.rows];
      const headerRow = t.tHead?.rows[0] ?? rows.find(r => r.querySelector("th"));
      const headers = headerRow ? [...headerRow.cells].map(c => clean(c.textContent)) : [];
      const withFields = rows.filter(r => r.querySelector("select, input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea"));
      const sample = withFields.slice(0, 3).map(r =>
        [...r.cells].map(c => {
          const f = c.querySelector("select, input, textarea") as HTMLInputElement | HTMLSelectElement | null;
          if (!f) return clean(c.textContent).slice(0, 40);
          if (f instanceof HTMLSelectElement) return `[select: ${clean(f.selectedOptions[0]?.textContent) || "vacío"}]`;
          return `[${f.type || "input"}: ${f.value || "vacío"}]`;
        })
      );
      return { index, headers, rows: rows.length, rowsWithFields: withFields.length, sample };
    })
    .filter(t => t.rows > 1)
    .slice(0, 10);

  const fields = [...document.querySelectorAll("select, input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=image]), textarea")]
    .filter(el => visible(el) && !inTable(el))
    .slice(0, maxItems)
    .map(el => {
      const f = el as HTMLInputElement | HTMLSelectElement;
      const base = { label: labelFor(el), tag: el.tagName.toLowerCase(), type: f.type, name: f.name, id: f.id, value: f instanceof HTMLSelectElement ? clean(f.selectedOptions[0]?.textContent) : f.type === "password" ? "***" : f.value };
      return f instanceof HTMLSelectElement ? { ...base, options: [...f.options].map(o => clean(o.textContent)).slice(0, 40) } : base;
    });

  const custom = [...document.querySelectorAll("[role=combobox]:not(input):not(select), mat-select, .mat-mdc-select, p-dropdown, .p-dropdown, ng-select, .ng-select, [role=listbox]")]
    .filter(visible)
    .slice(0, maxItems)
    .map(el => ({ label: labelFor(el), tag: el.tagName.toLowerCase(), type: el.getAttribute("role") ?? "desplegable", name: el.getAttribute("formcontrolname") ?? "", id: el.id, value: clean((el as HTMLElement).innerText).slice(0, 80) }));
  fields.push(...custom);
  const options = [...document.querySelectorAll("[role=option], mat-option, .mat-mdc-option, .p-dropdown-item, .ng-option")].filter(visible).map(o => clean(o.textContent)).filter(Boolean).slice(0, 60);
  if (options.length) fields.push({ label: "(lista desplegada abierta)", tag: "options", type: "", name: "", id: "", value: "", options });

  const clickables = [...new Set([...document.querySelectorAll("a, button, input[type=submit], input[type=button], [role=tab], [role=menuitem], [role=button], [role=treeitem], [onclick]")]
    .filter(visible)
    .map(e => clean((e as HTMLElement).innerText || e.getAttribute("value") || e.getAttribute("title")))
    .filter(t => t && t.length < 80))].slice(0, maxItems);

  const messages = [...document.querySelectorAll(".alert, .mensaje, .message, .error, .aviso, .info, [role=alert], .ui-messages, .feedback, mat-error, .mat-mdc-snack-bar-label, .toast")]
    .filter(visible)
    .map(e => clean(e.textContent))
    .filter(Boolean)
    .slice(0, 10);

  return { headings, tables, fields, clickables, messages };
}

/** HTML simplificado (sin scripts, estilos ni atributos irrelevantes) para entender la estructura de la página. */
function simplifiedHtml({ selector, maxChars }: { selector: string | null; maxChars: number }): string | null {
  const KEEP = /^(id|name|class|type|role|for|href|title|placeholder|value|formcontrolname|disabled|readonly|selected|colspan|aria-[a-z]+|data-[a-z-]+|ng-reflect-[a-z-]+)$/;
  const root = selector
    ? document.querySelector(selector)
    : document.querySelector("[role=dialog], mat-dialog-container, .modal.show, .cdk-overlay-pane") ?? document.body;
  if (!root) return null;
  const parts: string[] = [];
  let size = 0;
  const walk = (node: Node, depth: number) => {
    if (size > maxChars) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t) {
        parts.push(`${"  ".repeat(depth)}${t.slice(0, 200)}`);
        size += t.length;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "svg", "noscript", "link", "meta", "path"].includes(tag)) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0 && !["option", "input"].includes(tag)) return;
    const attrs = [...el.attributes]
      .filter(a => KEEP.test(a.name) && a.value.length < 120)
      .map(a => (a.name === "value" && (el as HTMLInputElement).type === "password" ? 'value="***"' : `${a.name}="${a.value}"`))
      .join(" ");
    let extra = "";
    if (tag === "input" || tag === "select" || tag === "textarea") {
      const v = (el as HTMLInputElement).type === "password" ? "***" : (el as HTMLInputElement).value;
      extra = ` [valor actual: "${v.slice(0, 60)}"]`;
    }
    const line = `${"  ".repeat(depth)}<${tag}${attrs ? " " + attrs : ""}>${extra}`;
    parts.push(line);
    size += line.length;
    if (tag === "iframe") parts.push(`${"  ".repeat(depth + 1)}(marco: ${(el as HTMLIFrameElement).src})`);
    for (const child of [...el.childNodes]) walk(child, depth + 1);
  };
  walk(root, 0);
  const text = parts.join("\n");
  return size > maxChars ? `${text.slice(0, maxChars)}\n[... recortado]` : text;
}

function markUserFieldBefore(pw: Element): boolean {
  const scope = pw.closest("form") ?? document;
  const candidates = [...scope.querySelectorAll<HTMLInputElement>("input")].filter(el => {
    const t = (el.getAttribute("type") ?? "text").toLowerCase();
    const r = el.getBoundingClientRect();
    return ["text", "email", "tel", "number", ""].includes(t) && r.width > 0 && r.height > 0 && !el.disabled;
  });
  const before = candidates.filter(el => el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
  const target = before.at(-1) ?? candidates[0];
  if (!target) return false;
  target.setAttribute("data-educa-mcp-user", "1");
  return true;
}


/** Marca el desplegable a medida que sigue a la etiqueta indicada (dentro del diálogo abierto si lo hay). */
function markCustomDropdown(hint: string): boolean {
  const DIALOG_SELECTOR = "[role=dialog], mat-dialog-container, .modal.show, .p-dialog, .cdk-overlay-pane, .modal-dialog, .ui-dialog";
  const DROPDOWN_SELECTOR = "p-select, p-listbox, p-dropdown, .p-dropdown, mat-select, ng-select, .ng-select, .select2, [role=combobox], .dropdown-toggle";
  document.querySelectorAll("[data-educa-mcp-dd]").forEach(e => e.removeAttribute("data-educa-mcp-dd"));
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[:*]/g, "").replace(/\s+/g, " ").trim();
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const h = norm(hint);
  const dialogs = [...document.querySelectorAll(DIALOG_SELECTOR)].filter(visible);
  const scopes: ParentNode[] = [...dialogs, document];
  for (const scope of scopes) {
    const labels = [...scope.querySelectorAll("label, span, div, p, b, strong, legend, mat-label")].filter(
      el => visible(el) && el.children.length <= 1 && norm(el.textContent ?? "") === h
    );
    for (const label of labels) {
      const all = [...scope.querySelectorAll(DROPDOWN_SELECTOR)].filter(visible);
      const next = all.find(dd => !dd.contains(label) && !label.contains(dd) && label.compareDocumentPosition(dd) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (next) {
        // El elemento más externo del componente que sigue siendo "desplegable"
        let target = next;
        while (target.parentElement && target.parentElement.matches(DROPDOWN_SELECTOR) && !target.parentElement.contains(label)) target = target.parentElement;
        target.setAttribute("data-educa-mcp-dd", "1");
        return true;
      }
    }
  }
  return false;
}

/** Pulsa la opción visible cuyo texto coincide (exacto primero, luego contiene). */
function clickDropdownOption(option: string): { ok: boolean; text: string; options: string[] } {
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const candidates = [...document.querySelectorAll("[role=option], mat-option, .p-dropdown-item, .ng-option, li, .dropdown-item, [class*=option], [class*=item]")]
    .filter(el => visible(el) && (el.textContent ?? "").trim() && el.querySelectorAll("li, [role=option]").length === 0);
  const texts = [...new Set(candidates.map(c => (c.textContent ?? "").replace(/\s+/g, " ").trim()))].slice(0, 40);
  const w = norm(option);
  const hit = candidates.find(c => norm(c.textContent ?? "") === w) ?? (() => {
    const partial = candidates.filter(c => norm(c.textContent ?? "").includes(w));
    return partial.length === 1 ? partial[0] : undefined;
  })();
  if (!hit) return { ok: false, text: "", options: texts };
  (hit as HTMLElement).scrollIntoView({ block: "center" });
  (hit as HTMLElement).click();
  return { ok: true, text: (hit.textContent ?? "").replace(/\s+/g, " ").trim(), options: texts };
}

function markSelectsMatching(hint: string): string[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const h = norm(hint);
  const keys: string[] = [];
  document.querySelectorAll("select").forEach((el, i) => {
    const id = el.id;
    const label = (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : "") || el.closest("label")?.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "";
    const prev = el.previousElementSibling?.textContent ?? "";
    const haystack = norm(`${label} ${el.name} ${id} ${prev}`);
    if (haystack.includes(h)) {
      el.setAttribute("data-educa-mcp-filter", String(i));
      keys.push(String(i));
    }
  });
  return keys;
}

function collectMessages(): string[] {
  const clean = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
  const nodes = [...document.querySelectorAll(".alert, .mensaje, .message, .error, .aviso, .info, .success, [role=alert], [role=status], .ui-messages, .feedback, .toast")];
  const out = nodes.map(n => clean(n.textContent)).filter(t => t && t.length < 400);
  return out.length ? out : [clean(document.body?.innerText ?? "").slice(0, 2000)];
}

interface ExtractArgs {
  sel: EducaConfig["gradeSheet"];
  column: string | null;
}

function extractGradeSheet({ sel, column }: ExtractArgs): Omit<GradeSheet, "frameUrl"> | null {
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const norm = (s: string) => clean(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const EDITABLE = "select, input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=image]):not([type=file]), textarea";

  // 0. Educa-Gestión (Cuaderno de aula > Calificaciones de evaluación): una tarjeta por alumno
  const cards = [...document.querySelectorAll<HTMLElement>(".listadoCalificaciones .elementoLista")];
  if (cards.length && !sel.rowSelector) {
    const legend = [...document.querySelectorAll("app-leyenda-calificaciones li")].map(li => clean(li.querySelector("span")?.textContent)).filter(Boolean);
    const headerOf = (th: Element) => clean(th.querySelector(":scope > span")?.textContent || th.textContent);
    const allHeaders: string[] = [];
    const editable = new Set<string>();
    const parsed = cards.map((card, index) => {
      const ths = [...card.querySelectorAll("app-calificacion-evaluaciones thead th")].map(headerOf);
      const tds = [...card.querySelectorAll("app-calificacion-evaluaciones tbody tr:first-child > td")];
      ths.forEach((h, i) => {
        if (!allHeaders.includes(h)) allHeaders.push(h);
        if (tds[i]?.querySelector("p-select")) editable.add(h);
      });
      return { card, index, ths, tds };
    });
    const editableColumns = allHeaders.filter(h => editable.has(h));
    let target: string | null = null;
    if (column) target = allHeaders.find(h => norm(h).replace(/[ .]/g, "") === norm(column).replace(/[ .]/g, "")) ?? allHeaders.find(h => norm(h).includes(norm(column))) ?? null;
    else if (editableColumns.length === 1) target = editableColumns[0];
    const rowsOut: GradeSheet["rows"] = parsed.map(({ card, index, ths, tds }) => {
      const name = clean(card.querySelector(".nombreTabla")?.textContent).replace(/\s+,/g, ",");
      const studentId = card.querySelector(".infoAlumno[id]")?.id.replace(/^id-/, "") || undefined;
      let field: GradeSheet["rows"][number]["field"] = null;
      const td = target ? tds[ths.indexOf(target)] : undefined;
      if (td) {
        const ps = td.querySelector<HTMLElement>("p-select");
        const typed = ps?.querySelector<HTMLInputElement>("input.p-select-label, input[type=text]");
        if (ps && typed) {
          // Bachillerato: desplegable "editable", la nota numérica se teclea (el desplegable solo ofrece FPEX y similares)
          const key = `f${index}`;
          typed.setAttribute("data-educa-mcp", key);
          field = { key, tag: "input", type: "p-select-editable", header: target!, value: typed.value, valueText: typed.value, disabled: typed.disabled || typed.readOnly || ps.classList.contains("p-disabled") };
        } else if (ps) {
          const key = `f${index}`;
          ps.setAttribute("data-educa-mcp", key);
          const label = ps.querySelector("[role=combobox]");
          const value = label?.classList.contains("p-placeholder") ? "" : clean(label?.textContent);
          field = { key, tag: "pselect", type: "p-select", header: target!, value, valueText: value, disabled: ps.classList.contains("p-disabled") || label?.getAttribute("aria-disabled") === "true", options: legend.map(c => ({ value: c, text: c })) };
        } else {
          const value = clean(td.querySelector(".spanCalificacion")?.textContent);
          field = { key: `f${index}`, tag: "pselect", type: "solo-lectura", header: target!, value, valueText: value, disabled: true, options: [] };
        }
      }
      return { index, name, ...(studentId ? { studentId } : {}), field };
    });
    // Verificado en el Educa real: al cambiar una nota la celda queda "modificado" y aparecen Aceptar/Cancelar; no se guarda sola
    const ctx = [...document.querySelectorAll("app-selector-grupo-asignatura-anidado p-select [role=combobox]:not(.p-placeholder), app-selector-grupo-asignatura-anidado li[role=option][aria-selected=true], h1, h2, h3")]
      .map(e => clean(e.textContent)).filter((t, i, a) => t && a.indexOf(t) === i).join(" · ").slice(0, 300);
    return { headers: allHeaders, column: target, rows: rowsOut, editableColumns, autoSaves: false, context: ctx };
  }

  // 1. Filas candidatas
  let rows: HTMLElement[];
  let table: HTMLTableElement | null = null;
  if (sel.rowSelector) {
    rows = [...document.querySelectorAll<HTMLElement>(sel.rowSelector)];
    table = rows[0]?.closest("table") ?? null;
  } else {
    let bestRows: HTMLTableRowElement[] = [];
    document.querySelectorAll("table").forEach(t => {
      const r = [...t.rows].filter(row => [...row.cells].some(c => c.querySelector(EDITABLE)));
      if (r.length > bestRows.length) {
        bestRows = r;
        table = t;
      }
    });
    rows = bestRows;
  }
  if (!rows.length) return null;

  // 2. Cabeceras por posición de columna (teniendo en cuenta colspan)
  const headers: string[] = [];
  const t = table as HTMLTableElement | null;
  if (t) {
    const headerRows = t.tHead ? [...t.tHead.rows] : [...t.rows].filter(r => r.querySelector("th") && !r.querySelector(EDITABLE)).slice(0, 2);
    for (const hr of headerRows) {
      let pos = 0;
      for (const cell of [...hr.cells]) {
        const text = clean(cell.textContent);
        for (let k = 0; k < (cell.colSpan || 1); k++) {
          headers[pos] = headers[pos] ? (text && !headers[pos].includes(text) ? `${headers[pos]} ${text}` : headers[pos]) : text;
          pos++;
        }
      }
    }
  }

  const cellsWithPos = (row: HTMLElement) => {
    const cells = row instanceof HTMLTableRowElement ? [...row.cells] : [...row.children];
    let pos = 0;
    return cells.map(c => {
      const item = { cell: c as HTMLElement, pos };
      pos += (c as HTMLTableCellElement).colSpan || 1;
      return item;
    });
  };

  // 3. Columnas con campos editables
  const editablePositions = new Set<number>();
  rows.forEach(r => cellsWithPos(r).forEach(({ cell, pos }) => cell.querySelector(EDITABLE) && editablePositions.add(pos)));
  const editableColumns = [...editablePositions].sort((a, b) => a - b).map(p => headers[p] || `columna ${p + 1}`);

  let targetPos: number | null = null;
  if (!sel.gradeFieldSelector) {
    if (column) {
      const wanted = norm(column);
      const hit = [...editablePositions].find(p => norm(headers[p] || `columna ${p + 1}`).includes(wanted));
      targetPos = hit ?? null;
    } else if (editablePositions.size === 1) {
      targetPos = [...editablePositions][0];
    }
  }

  const out: GradeSheet["rows"] = [];
  rows.forEach((row, index) => {
    const cells = cellsWithPos(row);
    let name = "";
    if (sel.nameSelector) name = clean(row.querySelector(sel.nameSelector)?.textContent);
    else {
      for (const { cell } of cells) {
        if (cell.querySelector(EDITABLE)) continue;
        const text = clean(cell.textContent);
        if (/[a-záéíóúñü]{2,}/i.test(text) && text.length > name.length) name = text;
      }
    }
    const studentId = sel.studentIdSelector ? clean(row.querySelector(sel.studentIdSelector)?.textContent) || undefined : undefined;

    let el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null = null;
    let header = "";
    if (sel.gradeFieldSelector) {
      el = row.querySelector(sel.gradeFieldSelector);
      const cell = el?.closest("td, th, [role=cell], [role=gridcell]") as HTMLElement | null;
      const found = cells.find(c => c.cell === cell);
      header = found ? headers[found.pos] ?? "" : "";
    } else if (targetPos !== null) {
      const found = cells.find(c => c.pos === targetPos);
      el = (found?.cell.querySelector(EDITABLE) as typeof el) ?? null;
      header = headers[targetPos] ?? "";
    }

    let field: GradeSheet["rows"][number]["field"] = null;
    if (el) {
      const key = `f${index}`;
      el.setAttribute("data-educa-mcp", key);
      const isSelect = el instanceof HTMLSelectElement;
      field = {
        key,
        tag: el.tagName.toLowerCase() as "select" | "input" | "textarea",
        type: (el as HTMLInputElement).type ?? "",
        header,
        value: el.value,
        valueText: isSelect ? clean((el as HTMLSelectElement).selectedOptions[0]?.textContent) : el.value,
        disabled: el.disabled || (el as HTMLInputElement).readOnly === true,
        ...(el instanceof HTMLInputElement && el.min !== "" && !isNaN(Number(el.min)) ? { min: Number(el.min) } : {}),
        ...(el instanceof HTMLInputElement && el.max !== "" && !isNaN(Number(el.max)) ? { max: Number(el.max) } : {}),
        ...(isSelect ? { options: [...(el as HTMLSelectElement).options].map(o => ({ value: o.value, text: clean(o.textContent) })) } : {})
      };
    }
    if (name || field) out.push({ index, name, ...(studentId ? { studentId } : {}), field });
  });

  const column_ = sel.gradeFieldSelector ? out.find(r => r.field)?.field?.header ?? null : targetPos !== null ? headers[targetPos] || `columna ${targetPos + 1}` : null;
  // Contexto: títulos y filtros elegidos (grupo, materia, evaluación) fuera de las filas de notas
  const context = [
    ...[...document.querySelectorAll("h1, h2, h3")].map(e => clean(e.textContent)),
    ...[...document.querySelectorAll("select")].filter(s2 => !rows.some(r => r.contains(s2))).map(s2 => clean(s2.selectedOptions[0]?.textContent))
  ].filter((t2, i, a) => t2 && a.indexOf(t2) === i).join(" · ").slice(0, 300);
  return { headers: headers.map((h, i) => h || `columna ${i + 1}`), column: column_, rows: out, editableColumns, context };
}
