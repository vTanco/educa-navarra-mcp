/**
 * Partes de convivencia en Educa-Gestión (Gestión académica → Convivencia → Nuevo informe).
 *
 * Estructura observada en el Educa real (noviembre de 2026):
 * - Listado "Informes de convivencia" con el botón "Nuevo informe", que abre un diálogo con un
 *   buscador de alumnos y un acordeón de grupos ("Da clase" / "Resto de grupos").
 * - Al elegir grupo sale un mosaico de alumnos (app-mosaico .alumno .nombreAlumno).
 * - Al elegir alumno sale el formulario app-cnv-informe (paso 1 "Informe" de 3: Informe, Envío,
 *   Resumen) con Fecha suceso (p-datepicker), Espacio (p-select), Seleccionar sesión (diálogo con
 *   las sesiones del alumno ese día; la del docente lleva la clase daClase), Observaciones de lo
 *   sucedido (textarea, 4000 caracteres), Contacto con la familia (casilla), Tipo de conducta
 *   (diálogo "Añadir conducta" con casillas por categoría y una lista) y Propuesta de medida
 *   (p-select opcional). Botones: Guardar, Guardar y enviar, Cancelar.
 *
 * Nada de este fichero pulsa Guardar salvo IncidentScreen.save(), que solo se llama con la
 * confirmación expresa del docente.
 */
import type { Locator, Page } from "playwright";
import { settle, type EducaBrowser } from "./browser.js";
import type { EducaConfig } from "./config.js";
import { cleanReport, formatDate, matchOption, matchStudent, pickSession, type EducaConduct, type SessionRow } from "./convivencia.js";
import { normalize } from "./grades.js";
import { findByName } from "./groups.js";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_EU = ["urtarrila", "otsaila", "martxoa", "apirila", "maiatza", "ekaina", "uztaila", "abuztua", "iraila", "urria", "azaroa", "abendua"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactText = (s: string) => new RegExp(`^\\s*${esc(s.trim())}\\s*$`, "i");

export interface IncidentCatalog {
  places: string[];
  conducts: EducaConduct[];
  categories: string[];
}

export interface OpenedForm {
  group: string;
  student: string;
  approximate: boolean;
}

export interface FillInput {
  date: Date;
  place: string;
  sessionTime: string | null;
  report: string;
  familyContacted: boolean;
  conduct: EducaConduct;
  measure: string | null;
}

export interface FillResult {
  date: string;
  place: string;
  session: string | null;
  reportOk: boolean;
  familyContacted: boolean;
  conduct: string;
  measure: string | null;
  measureOptions: string[];
  warnings: string[];
}

export class IncidentScreen {
  constructor(
    private readonly browser: EducaBrowser,
    private readonly config: EducaConfig
  ) {}

  private page(): Promise<Page> {
    return this.browser.page();
  }

  /** Último diálogo visible que contiene el componente indicado (Educa a veces deja copias ocultas). */
  private dialog(page: Page, component: string): Locator {
    return page.locator(`.p-dialog:has(${component})`).filter({ visible: true }).last();
  }

  private form(page: Page): Locator {
    return page.locator("app-cnv-informe").first();
  }

  // ---------- Llegar al formulario ----------

  /** Abre el listado de informes de convivencia. */
  async openList(): Promise<void> {
    let page = await this.page();
    page = await this.browser.goto(new URL(this.config.incidentScreen.path, page.url()).toString());
    const newButton = page.getByRole("button", { name: "Nuevo informe" }).or(page.getByText("Nuevo informe", { exact: true })).first();
    if (!(await newButton.isVisible().catch(() => false))) {
      const notice = page.locator("[role=dialog] button[data-pc-name=pcclosebutton]").filter({ visible: true }).first();
      if ((await notice.count()) > 0) await notice.click().catch(() => undefined);
      for (const entry of this.config.incidentScreen.menu) await this.browser.click({ text: entry });
    }
    await newButton.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
      throw new Error(`No encuentro el botón "Nuevo informe" tras pulsar ${this.config.incidentScreen.menu.join(" → ")}. Usa educa_inspect_page para ver dónde está el navegador; si el menú de tu centro es distinto, ajusta incidentScreen.menu en la configuración.`);
    });
  }

  /** Grupos que ofrece el diálogo de "Nuevo informe", por apartado ("Da clase", "Resto de grupos"). */
  private async groupPanels(dlg: Locator): Promise<{ header: string; groups: string[] }[]> {
    return dlg.locator("p-accordion-panel").evaluateAll(panels =>
      panels.map(p => ({
        header: (p.querySelector("p-accordion-header")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        groups: [...p.querySelectorAll(".grupo:not(.buscadorGrupo)")].map(g => (g.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean)
      }))
    );
  }

  /** Si hay un informe a medio rellenar en pantalla, lo descarta con Cancelar (o Volver) sin guardar. */
  async discardOpenForm(): Promise<void> {
    const page = await this.page();
    const form = this.form(page);
    if (!(await form.isVisible().catch(() => false))) return;
    const button = form.locator(".botonesAccionFinales button").filter({ hasText: /^\s*(Cancelar|Volver)\s*$/i }).filter({ visible: true }).first();
    if ((await button.count()) === 0) return;
    await button.click();
    await settle(page);
  }

  /** ¿Está abierto un formulario en blanco de este alumno? */
  async isPristineFormFor(student: string): Promise<boolean> {
    const current = await this.openFormStudent();
    if (!current || normalize(current).split(" ").sort().join(" ") !== normalize(student).split(" ").sort().join(" ")) return false;
    const page = await this.page();
    const form = this.form(page);
    const report = await form.locator("textarea").first().inputValue().catch(() => "x");
    const date = await form.locator("app-ubicacion-convivencia p-datepicker input").first().inputValue().catch(() => "x");
    const conducts = await form.locator(".filaParte").filter({ hasText: /Tipo de conducta/i }).locator(".negrita").count().catch(() => 1);
    return !report && !date && conducts === 0;
  }

  /** Abre un parte nuevo para un alumno de un grupo. No escribe nada en el formulario. */
  async openNewForm(group: string, student: string): Promise<OpenedForm> {
    await this.discardOpenForm();
    await this.openList();
    const page = await this.page();
    await page.getByRole("button", { name: "Nuevo informe" }).or(page.getByText("Nuevo informe", { exact: true })).first().click();
    const dlg = this.dialog(page, "app-selector-navegacion");
    await dlg.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
      throw new Error('Al pulsar "Nuevo informe" no se ha abierto el selector de grupo y alumno.');
    });
    const panels = await this.groupPanels(dlg);
    // Primero los grupos a los que da clase; después el resto del centro
    let chosen: { header: string; group: string } | null = null;
    let candidates: string[] = [];
    // Nombre exacto en cualquier apartado; si no, coincidencia parcial ("3ºDEFH" -> "ESO 3ºDEFH cd")
    for (const panel of panels) {
      const hit = panel.groups.find(g => normalize(g) === normalize(group));
      if (hit) {
        chosen = { header: panel.header, group: hit };
        break;
      }
    }
    for (const panel of chosen ? [] : panels) {
      const m = findByName(panel.groups, group, g => g);
      if (m.ok) {
        chosen = { header: panel.header, group: m.item };
        break;
      }
      candidates = candidates.concat(m.candidates);
    }
    if (!chosen) {
      const mine = panels[0]?.groups ?? [];
      throw new Error(
        candidates.length
          ? `Hay varios grupos que encajan con "${group}": ${[...new Set(candidates)].slice(0, 12).join(" / ")}. Indica el nombre tal como sale en Educa.`
          : `Educa no ofrece ningún grupo "${group}" para partes de convivencia.${mine.length ? ` Tus grupos: ${mine.join(" / ")}.` : ""}`
      );
    }
    const header = dlg.locator("p-accordion-header").filter({ hasText: exactText(chosen.header) }).first();
    if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
    await dlg.locator(".grupo:not(.buscadorGrupo)").filter({ hasText: exactText(chosen.group) }).filter({ visible: true }).first().click({ timeout: 10_000 });
    await settle(page);

    const names = page.locator("app-seleccionar-alumno .nombreAlumno, app-selector-alumno-lista .nombreAlumno");
    await names.first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
      throw new Error(`No se ha cargado la lista de alumnos de ${chosen.group}.`);
    });
    const list = (await names.allInnerTexts()).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
    const m = matchStudent(list, student);
    if (!m.ok) {
      throw new Error(
        m.reason === "varios"
          ? `En ${chosen.group} hay varios alumnos que encajan con "${student}": ${m.candidates.join(" / ")}. Indica también el apellido.`
          : `No encuentro a "${student}" en ${chosen.group}. Alumnos: ${list.join(" / ")}`
      );
    }
    await page.locator("app-seleccionar-alumno .alumno, app-selector-alumno-lista .alumno, app-selector-alumno-lista tr").filter({ has: page.locator(".nombreAlumno", { hasText: exactText(m.item) }) }).first().click();
    await settle(page);
    await this.form(page).waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
      throw new Error("No se ha abierto el formulario del informe de convivencia.");
    });
    return { group: chosen.group, student: m.item, approximate: m.approximate };
  }

  /** Nombre del alumno del formulario abierto, o null si no hay formulario. */
  async openFormStudent(): Promise<string | null> {
    const page = await this.page();
    const form = page.locator("app-cnv-parte").first();
    if (!(await form.isVisible().catch(() => false))) return null;
    const name = await form.locator(".infoAlumno .nombreTabla").first().evaluate(el => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".grupo").forEach(g => g.remove());
      return (clone.textContent ?? "").replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
    }).catch(() => "");
    return name || null;
  }

  // ---------- Desplegables PrimeNG ----------

  private async openOverlay(page: Page, select: Locator): Promise<Locator> {
    const trigger = select.locator(".p-select-dropdown").first();
    await ((await trigger.count()) ? trigger : select).click();
    const items = page.locator(".p-select-overlay li[role=option]").filter({ visible: true });
    await items.first().waitFor({ state: "visible", timeout: 4000 }).catch(() => undefined);
    return items;
  }

  private async closeOverlay(page: Page, select: Locator): Promise<void> {
    if ((await page.locator(".p-select-overlay").filter({ visible: true }).count()) === 0) return;
    const trigger = select.locator(".p-select-dropdown").first();
    await ((await trigger.count()) ? trigger : select).click().catch(() => undefined);
    await page.waitForTimeout(250);
  }

  private async selectOptions(page: Page, select: Locator): Promise<string[]> {
    const items = await this.openOverlay(page, select);
    const texts = (await items.allInnerTexts().catch(() => [] as string[])).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
    await this.closeOverlay(page, select);
    return [...new Set(texts)];
  }

  private async pick(page: Page, select: Locator, option: string): Promise<void> {
    const items = await this.openOverlay(page, select);
    const item = items.filter({ hasText: exactText(option) }).first();
    try {
      await item.click({ timeout: 5000 });
    } catch {
      await this.closeOverlay(page, select);
      throw new Error(`El desplegable no ofrece la opción "${option}".`);
    }
    await settle(page, 400);
  }

  // ---------- Catálogo: espacios y conductas ----------

  private placeSelect(page: Page): Locator {
    return this.form(page).locator("app-ubicacion-convivencia p-select").first();
  }

  private async openConductDialog(page: Page): Promise<Locator> {
    const button = this.form(page).locator("button").filter({ hasText: /^\s*(Añadir conducta|Modificar anotaci[oó]n)\s*$/i }).first();
    await button.click();
    const dlg = this.dialog(page, "app-seleccionar-anotacion-codificada");
    await dlg.waitFor({ state: "visible", timeout: 8000 }).catch(() => {
      throw new Error('No se ha abierto el diálogo "Añadir conducta".');
    });
    return dlg;
  }

  private async categoryBoxes(dlg: Locator): Promise<{ label: string; checked: boolean }[]> {
    return dlg.locator("lib-checkbox").evaluateAll(boxes =>
      boxes.map(b => ({
        label: (b.querySelector("label")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        checked: b.querySelector("p-checkbox")?.getAttribute("data-p-checked") === "true" || (b.querySelector("input[type=checkbox]") as HTMLInputElement | null)?.checked === true
      }))
    );
  }

  private async setCategory(page: Page, dlg: Locator, label: string, checked: boolean): Promise<void> {
    const boxes = await this.categoryBoxes(dlg);
    const box = boxes.find(b => b.label === label);
    if (!box || box.checked === checked) return;
    await dlg.locator("lib-checkbox label").filter({ hasText: exactText(label) }).first().click();
    await page.waitForTimeout(400);
  }

  private async listedConducts(dlg: Locator): Promise<string[]> {
    const texts = await dlg.locator("p-listbox li[role=option]").evaluateAll(items => items.map(i => (i.getAttribute("aria-label") ?? i.textContent ?? "").replace(/\s+/g, " ").trim()));
    return [...new Set(texts.filter(Boolean))];
  }

  private async cancelDialog(page: Page, dlg: Locator): Promise<void> {
    const cancel = dlg.locator("button").filter({ hasText: /^\s*Cancelar\s*$/i }).first();
    if ((await cancel.count()) > 0) await cancel.click().catch(() => undefined);
    else await dlg.locator("button[data-pc-name=pcclosebutton]").first().click().catch(() => undefined);
    await page.waitForTimeout(300);
  }

  /** Espacios y conductas que ofrece Educa en el formulario abierto. Abre y cierra diálogos sin elegir nada. */
  async readCatalog(): Promise<IncidentCatalog> {
    const page = await this.page();
    const places = await this.selectOptions(page, this.placeSelect(page));
    const dlg = await this.openConductDialog(page);
    const categories = (await this.categoryBoxes(dlg)).map(b => b.label).filter(Boolean);
    const conducts: EducaConduct[] = [];
    try {
      for (const category of categories) {
        for (const other of categories) await this.setCategory(page, dlg, other, other === category);
        for (const label of await this.listedConducts(dlg)) if (!conducts.some(x => x.label === label)) conducts.push({ label, category });
      }
      for (const other of categories) await this.setCategory(page, dlg, other, false);
    } finally {
      await this.cancelDialog(page, dlg);
    }
    return { places, conducts, categories };
  }

  // ---------- Rellenar (sin guardar) ----------

  private async setDate(page: Page, date: Date): Promise<string> {
    const box = this.form(page).locator("app-ubicacion-convivencia p-datepicker").first();
    const input = box.locator("input").first();
    const wanted = formatDate(date);
    if ((await input.inputValue().catch(() => "")) === wanted) return wanted;
    await box.locator(".p-datepicker-dropdown").first().click();
    const panel = page.locator(".p-datepicker-panel").filter({ visible: true }).last();
    await panel.waitFor({ state: "visible", timeout: 4000 });
    for (let i = 0; i < 36; i++) {
      const month = normalize(await panel.locator(".p-datepicker-select-month").first().innerText().catch(() => ""));
      const year = Number((await panel.locator(".p-datepicker-select-year").first().innerText().catch(() => "")).trim());
      let m = MONTHS.indexOf(month);
      if (m < 0) m = MONTHS_EU.indexOf(month);
      if (m < 0 || !year) break;
      const diff = (date.getFullYear() - year) * 12 + (date.getMonth() - m);
      if (diff === 0) break;
      await panel.locator(diff < 0 ? "button[aria-label='Previous Month'], .p-datepicker-prev-button" : "button[aria-label='Next Month'], .p-datepicker-next-button").first().click();
      await page.waitForTimeout(150);
    }
    const day = panel.locator("td:not(.p-datepicker-other-month) span").filter({ hasText: exactText(String(date.getDate())) }).first();
    if ((await day.count()) > 0 && !(await day.getAttribute("data-p-disabled").then(v => v === "true").catch(() => false))) {
      await day.click();
    } else {
      // Sin calendario reconocible: escribir la fecha a mano
      await page.keyboard.press("Escape").catch(() => undefined);
      await input.fill(wanted);
      await input.press("Enter").catch(() => undefined);
    }
    await page.waitForTimeout(400);
    const got = await input.inputValue().catch(() => "");
    if (got !== wanted) throw new Error(`No he podido poner la fecha ${wanted} (el campo muestra "${got}"). Puede que Educa no admita esa fecha.`);
    return got;
  }

  private async setSession(page: Page, time: string | null): Promise<string | null> {
    const loc = this.form(page).locator("app-ubicacion-convivencia");
    const button = loc.locator("button").filter({ hasText: /^\s*(Seleccionar|Modificar) sesi[oó]n\s*$/i }).first();
    if (!(await button.isVisible().catch(() => false))) return null; // este espacio no pide sesión
    await button.click();
    const dlg = this.dialog(page, "app-seleccionar-sesion-alumno");
    await dlg.waitFor({ state: "visible", timeout: 8000 }).catch(() => {
      throw new Error("No se ha abierto la lista de sesiones del alumno.");
    });
    const rows = dlg.locator("tbody tr");
    const data: SessionRow[] = await rows.evaluateAll(trs =>
      trs.map(tr => {
        const tds = [...tr.querySelectorAll("td")].map(td => (td.textContent ?? "").replace(/\s+/g, " ").trim());
        return { time: (tr.querySelector("td.hora")?.textContent ?? tds[1] ?? "").replace(/\s+/g, " ").trim(), subject: tds[2] ?? "", teacher: tds[3] ?? "", mine: tr.classList.contains("daClase") };
      })
    );
    const choice = pickSession(data, time);
    if (!choice.ok) {
      await this.cancelDialog(page, dlg);
      throw new Error(choice.message);
    }
    const row = rows.nth(choice.index);
    await (((await row.locator("p-radiobutton, input[type=radio]").count()) > 0) ? row.locator("p-radiobutton, input[type=radio]").first() : row).click();
    await page.waitForTimeout(300);
    const accept = dlg.locator("lib-btn-aceptar-cancelar button, .botones button").filter({ hasText: /^\s*Aceptar\s*$/i }).first();
    if ((await accept.count()) === 0) {
      await this.cancelDialog(page, dlg);
      throw new Error("Al elegir la sesión no aparece el botón Aceptar del diálogo.");
    }
    await accept.click();
    await settle(page, 400);
    const label = (await loc.locator(".labelSesion").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    return label || `${data[choice.index].time} ${data[choice.index].subject}`;
  }

  private async setFamilyContact(page: Page, wanted: boolean): Promise<boolean> {
    const row = this.form(page).locator(".filaParte").filter({ hasText: /Contacto con la familia/i }).first();
    const box = row.locator("p-checkbox").first();
    if ((await box.count()) === 0) return false;
    const isChecked = async () => (await box.getAttribute("data-p-checked")) === "true" || (await box.locator("input").isChecked().catch(() => false));
    if ((await isChecked()) !== wanted) {
      const label = row.locator("lib-checkbox label").filter({ visible: true }).first();
      await ((await label.count()) > 0 ? label : row.locator(".p-checkbox-box").first()).click();
      await page.waitForTimeout(300);
    }
    return isChecked();
  }

  private async setConduct(page: Page, conduct: EducaConduct): Promise<string> {
    const dlg = await this.openConductDialog(page);
    try {
      const categories = (await this.categoryBoxes(dlg)).map(b => b.label);
      for (const c of categories) await this.setCategory(page, dlg, c, c === conduct.category);
      const option = dlg.locator("p-listbox li[role=option]").filter({ hasText: exactText(conduct.label) }).first();
      if ((await option.count()) === 0) throw new Error(`El diálogo de conductas no ofrece "${conduct.label}" en "${conduct.category}".`);
      if ((await option.getAttribute("aria-selected")) !== "true") await option.click();
      const add = dlg.locator("button").filter({ hasText: /^\s*Agregar\s*$/i }).first();
      await add.click({ timeout: 5000 });
    } catch (e) {
      await this.cancelDialog(page, dlg);
      throw e;
    }
    await settle(page, 400);
    const shown = (await this.form(page).locator(".filaParte").filter({ hasText: /Tipo de conducta/i }).locator(".negrita").allInnerTexts().catch(() => [] as string[])).map(t => t.trim());
    if (!shown.some(s => normalize(s) === normalize(conduct.label))) throw new Error(`Tras elegir la conducta, el formulario muestra "${shown.join(", ") || "nada"}" en vez de "${conduct.label}".`);
    return shown.find(s => normalize(s) === normalize(conduct.label))!;
  }

  /** Rellena el formulario abierto. No guarda. */
  async fill(input: FillInput): Promise<FillResult> {
    const page = await this.page();
    const warnings: string[] = [];
    const date = await this.setDate(page, input.date);
    await this.pick(page, this.placeSelect(page), input.place);
    const session = await this.setSession(page, input.sessionTime);

    const report = cleanReport(input.report);
    const textarea = this.form(page).locator(".filaParte").filter({ hasText: /Observaciones de lo sucedido/i }).locator("textarea").first();
    await textarea.fill(report);
    await textarea.dispatchEvent("input").catch(() => undefined);
    await textarea.blur().catch(() => undefined);
    const reportOk = cleanReport(await textarea.inputValue()) === report;
    if (!reportOk) warnings.push("El cuadro de lo sucedido no muestra el texto completo tras escribirlo.");

    const familyContacted = await this.setFamilyContact(page, input.familyContacted);
    if (familyContacted !== input.familyContacted) warnings.push('No he podido marcar o desmarcar "Contacto con la familia".');

    const conduct = await this.setConduct(page, input.conduct);

    let measure: string | null = null;
    let measureOptions: string[] = [];
    const measureSelect = this.form(page).locator("app-medida-form p-select").first();
    if ((await measureSelect.count()) > 0) {
      measureOptions = await this.selectOptions(page, measureSelect);
      if (input.measure) {
        const m = matchOption(measureOptions, input.measure);
        if (m.ok) {
          await this.pick(page, measureSelect, m.item);
          measure = m.item;
        } else warnings.push(`No he elegido la propuesta de medida: "${input.measure}" no está entre las de Educa (${measureOptions.join(" / ") || "ninguna"}).`);
      }
    } else if (input.measure) warnings.push("Este formulario no tiene propuesta de medida.");

    const errors = (await this.form(page).locator("p.error").allInnerTexts().catch(() => [] as string[])).map(t => t.trim()).filter(Boolean);
    for (const e of errors) warnings.push(`Educa avisa: ${e}`);
    return { date, place: input.place, session, reportOk, familyContacted, conduct, measure, measureOptions, warnings };
  }

  // ---------- Guardar ----------

  /** Pulsa "Guardar" (queda en borrador) o "Guardar y enviar". Solo con confirmación del docente. */
  async save(send: boolean): Promise<{ button: string; message: string | null; outcome: "ok" | "error" | "desconocido"; step: string; state: string }> {
    const page = await this.page();
    const label = send ? "Guardar y enviar" : "Guardar";
    const button = this.form(page).locator("button").filter({ hasText: exactText(label) }).filter({ visible: true }).first();
    if ((await button.count()) === 0) throw new Error(`No encuentro el botón "${label}" del informe de convivencia. ¿Sigue abierto el formulario?`);
    if (await button.isDisabled()) throw new Error(`El botón "${label}" está desactivado: Educa considera que falta algún dato obligatorio.`);
    await button.click();
    await settle(page, 2500);
    const messages = await page
      .locator(".p-toast-message, .p-message, [role=alert], .mensaje, app-cnv-parte p.error")
      .filter({ visible: true })
      .allInnerTexts()
      .catch(() => [] as string[]);
    const text = messages.map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
    const err = text.find(t => new RegExp(this.config.save.errorPattern, "i").test(t));
    const ok = text.find(t => new RegExp(this.config.save.successPattern, "i").test(t));
    const step = (await page.locator("app-cnv-parte p-step.p-step-active .p-step-title, app-cnv-parte [aria-current=step] .p-step-title").first().innerText().catch(() => "")).trim();
    const state = (await page.locator("app-cnv-parte .estado .bloque span").first().innerText().catch(() => "")).trim();
    return { button: label, message: err ?? ok ?? text[0] ?? null, outcome: err ? "error" : ok ? "ok" : "desconocido", step, state };
  }

  /** Texto visible del paso abierto (para describir el paso "Envío" sin tocar nada). */
  async stepSummary(): Promise<string> {
    const page = await this.page();
    const text = await page.locator("app-cnv-parte").first().innerText().catch(() => "");
    return text.replace(/\n{2,}/g, "\n").trim().slice(0, 1500);
  }
}
