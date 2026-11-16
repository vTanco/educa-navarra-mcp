/**
 * Partes de convivencia del Educa simulado. Imita la forma de Educa-Gestión → Gestión académica →
 * Convivencia (listado, "Nuevo informe", mosaico de alumnos y formulario del informe) con las mismas
 * clases que el Educa real, para probar el conector sin tocarlo.
 */
import type { IncomingMessage } from "node:http";

export interface SavedIncident {
  grupo: string;
  alumno: string;
  fecha: string;
  espacio: string;
  sesion: string;
  relato: string;
  familia: boolean;
  conducta: string;
  medida: string;
  enviado: boolean;
}
export const savedIncidents: SavedIncident[] = [];

const GROUPS = { "Da clase": ["BTO N 1ºA", "ESO 1ºCD plu", "ESO 3ºDEFH cd"], "Resto de grupos": ["ESO 3º D", "ESO 3º E", "BTO 1º A"] };
const STUDENTS: Record<string, string[]> = {
  "ESO 3ºDEFH cd": ["Arana Goñi, Leire", "Muro Etxeberria, Iker", "Muro Sanz, Ane", "Pérez López, Iker"],
  "ESO 3º D": ["Arana Goñi, Leire", "Muro Etxeberria, Iker"],
  "ESO 1ºCD plu": ["Abad Lorenzo, Paula", "Bonet Zubía, Iker"],
  "BTO N 1ºA": ["García López, Ana"]
};
const CONDUCTS = {
  "Conductas contrarias": ["NO ESTUDIA", "NO TRAE MATERIAL ", "FALTA DE RESPETO", "DESCONSIDERACIÓN", "LLEVAR SIN AUTORIZACIÓN", "OTRA CUALQUIERA"],
  "Conductas perjudiciales": ["OFENSA O AGRESIÓN GRAVE", "GRABACIÓN", "AGRESIÓN", "INSUBORDINACIÓN", "INCUMPLIMIENTO DE COMPROMISOS"]
};
const PLACES = ["Sesión presencial", "Recreo", "Pasillos", "Servicios", "OTRO, en recinto y horario escolar"];
const MEASURES = ["RECREO", "REALIZACIÓN TAREAS", "SUSPENSIÓN de DERECHOS"];

const page = (title: string, body: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title></head><body><div id="usuario-conectado">Profe Demo</div>${body}</body></html>`;
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

async function readJson(req: IncomingMessage): Promise<SavedIncident> {
  let data = "";
  for await (const chunk of req) data += chunk;
  return JSON.parse(data) as SavedIncident;
}

/** Atiende las rutas /convivencia*. Devuelve false si la ruta no es suya. */
export async function convivenciaRoute(url: URL, req: IncomingMessage, send: (html: string, status?: number) => void): Promise<boolean> {
  if (url.pathname === "/convivencia/guardar" && req.method === "POST") {
    savedIncidents.push(await readJson(req));
    send("{}");
    return true;
  }
  if (url.pathname === "/convivencia") {
    const panels = Object.entries(GROUPS)
      .map(([h, gs], i) => `<p-accordion-panel><p-accordion-header role="button" aria-expanded="false" onclick="toggle(this)"><span>${h}</span></p-accordion-header>
        <p-accordion-content id="acc${i}" hidden><app-listado-grupos><div class="grupo buscadorGrupo"><input placeholder="Buscar grupo"></div>${gs.map(g => `<div class="grupo" onclick="location.href='/convivencia/nuevo?grupo=${encodeURIComponent(g)}'"><span>${g}</span></div>`).join("")}</app-listado-grupos></p-accordion-content></p-accordion-panel>`)
      .join("");
    send(page("EducaGestion", `<h3>Informes de convivencia</h3><button class="botonRojo" onclick="document.getElementById('dlg').hidden=false"><span>Nuevo informe</span></button>
      <table><thead><tr><th>Alumno/a</th><th>Grupo</th><th>Estado</th></tr></thead><tbody></tbody></table>
      <div class="p-dialog" role="dialog" id="dlg" hidden><app-selector-navegacion><app-buscador-alumnos><input placeholder="Buscar alumno/a"></app-buscador-alumnos><app-grupos-acordeon><p-accordion>${panels}</p-accordion></app-grupos-acordeon></app-selector-navegacion><button>Cancelar</button></div>
      <script>function toggle(h){const c=h.nextElementSibling;const open=h.getAttribute("aria-expanded")==="true";h.setAttribute("aria-expanded",String(!open));c.hidden=open;}</script>`));
    return true;
  }
  if (url.pathname === "/convivencia/nuevo") {
    const grupo = url.searchParams.get("grupo") ?? "";
    const alumnos = (STUDENTS[grupo] ?? []).map(a => `<div class="alumno" onclick="location.href='/convivencia/parte?grupo=${encodeURIComponent(grupo)}&alumno=${encodeURIComponent(a)}'"><div class="foto"><img></div><p class="nombreAlumno">${a}</p></div>`).join("");
    send(page("EducaGestion", `<div class="infoSeleccion"><span>${grupo}</span></div><app-nuevo-parte><app-seleccionar-alumno><app-selector-alumno-lista><app-mosaico><div class="mosaico">${alumnos}</div></app-mosaico></app-selector-alumno-lista></app-seleccionar-alumno></app-nuevo-parte>`));
    return true;
  }
  if (url.pathname === "/convivencia/parte") {
    const grupo = url.searchParams.get("grupo") ?? "";
    const alumno = url.searchParams.get("alumno") ?? "";
    const [ap, nom] = alumno.split(", ");
    send(
      page(
        "EducaGestion",
        `<app-convivencia-unificado><app-cnv-parte><h3>Informe de convivencia</h3>
        <div class="infoAlumno"><a class="enlaceNombre"><span class="nombreTabla">${ap} , <span class="nombre">${nom}</span> <span class="grupo">${grupo}</span></span></a></div>
        <p-stepper><p-step class="p-step p-step-active" id="st1"><span class="p-step-title">Informe</span></p-step><p-step class="p-step" id="st2"><span class="p-step-title">Envío</span></p-step><p-step class="p-step"><span class="p-step-title">Resumen</span></p-step></p-stepper>
        <app-cnv-informe><form onsubmit="return false">
          <div class="estado"><div class="bloque"><label>Estado</label> <span class="borrador" id="estado">Borrador</span></div></div>
          <app-ubicacion-convivencia>
            <label class="obligatorio">Fecha suceso</label>
            <p-datepicker><input type="text" id="fecha" readonly><button type="button" class="p-datepicker-dropdown" aria-label="Choose Date" onclick="cal()">▼</button></p-datepicker>
            <div class="espacio"><label class="obligatorio">Espacio</label>
              <p-select placeholder="Seleccione un lugar" id="espacio" style="display:inline-block"><span role="combobox" class="p-select-label p-placeholder">Seleccione un lugar</span><div role="button" class="p-select-dropdown" style="display:inline-block;width:16px;height:16px">▼</div></p-select>
              <span id="sesionBox"></span></div>
            <p class="error fechaUbicacionSesion"></p>
          </app-ubicacion-convivencia>
          <div class="datosParteDocentes">
            <div class="filaParte"><div class="elementoFila"><span class="obligatorio">Observaciones de lo sucedido</span></div><div><lib-text-area><textarea class="p-textarea" id="relato" oninput="dirty()"></textarea></lib-text-area></div></div>
            <div class="filaParte"><div class="elementoFila"><span>Contacto con la familia</span></div><div><lib-checkbox><p-checkbox data-p-checked="false" id="familia"><input type="checkbox" class="p-checkbox-input" id="cbf"><div class="p-checkbox-box"></div></p-checkbox><label for="cbf" onclick="toggleCb(event,'familia')">Contacto con la familia</label></lib-checkbox></div></div>
            <div class="filaParte"><div class="elementoFila"><span class="obligatorio">Tipo de conducta</span></div><div id="conductaBox"><button type="button" class="botonRojoPeke" onclick="abrirConductas()"><span>Añadir conducta</span></button></div></div>
            <div class="filaParte"><div class="elementoFila"><span>Propuesta de medida</span></div><div id="medidaBox"></div></div>
          </div>
          <div class="botonesAccionFinales"><lib-btn-aceptar-cancelar><div class="botones" id="botones"><button type="button" class="botonRojo" onclick="location.href='/convivencia'"><span>Volver</span></button></div></lib-btn-aceptar-cancelar></div>
        </form></app-cnv-informe></app-cnv-parte></app-convivencia-unificado>
        <div id="toast"></div>
        <script>
          const PLACES = ${JSON.stringify(PLACES)}, CONDUCTS = ${JSON.stringify(CONDUCTS)}, MEASURES = ${JSON.stringify(MEASURES)};
          const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
          const st = { fecha: "", espacio: "", sesion: "", conducta: "", medida: "", familia: false };
          let view = new Date();
          function dirty() {
            document.getElementById("botones").innerHTML = '<button type="button" class="botonRojo" onclick="guardar(false)"><span>Guardar</span></button><button type="button" class="botonRojo" onclick="guardar(true)"><span>Guardar y enviar</span></button><button type="button" class="botonRojo" onclick="location.href=\\'/convivencia\\'"><span>Cancelar</span></button>';
          }
          function toggleCb(ev, id) { ev.preventDefault(); const b = document.getElementById(id); const v = b.getAttribute("data-p-checked") !== "true"; b.setAttribute("data-p-checked", String(v)); b.querySelector("input").checked = v; if (id === "familia") { st.familia = v; dirty(); } return v; }
          function overlay(items, onPick) {
            document.querySelectorAll(".p-select-overlay").forEach(o => o.remove());
            const ov = document.createElement("div"); ov.className = "p-select-overlay";
            ov.innerHTML = '<ul role="listbox">' + items.map(i => '<li role="option" aria-label="' + i + '"><span>' + i + '</span></li>').join("") + "</ul>";
            document.body.appendChild(ov);
            ov.querySelectorAll("li").forEach((li, n) => li.addEventListener("click", () => { ov.remove(); onPick(items[n]); }));
          }
          function bindSelect(ps, items, onPick) {
            ps.querySelector(".p-select-dropdown").addEventListener("click", ev => {
              ev.stopPropagation();
              if (document.querySelector(".p-select-overlay")) { document.querySelectorAll(".p-select-overlay").forEach(o => o.remove()); return; }
              overlay(items, v => { const l = ps.querySelector("[role=combobox]"); l.textContent = v; l.classList.remove("p-placeholder"); onPick(v); dirty(); });
            });
          }
          bindSelect(document.getElementById("espacio"), PLACES, v => { st.espacio = v; st.sesion = ""; sesionBox(); });
          function sesionBox() {
            const box = document.getElementById("sesionBox");
            if (st.espacio !== "Sesión presencial") { box.innerHTML = ""; return; }
            box.innerHTML = (st.sesion ? '<span class="labelSesion">' + st.sesion + "</span>" : "") + '<button type="button" class="botonRojoPeke"' + (st.fecha ? "" : " disabled") + ' onclick="abrirSesiones()"><span>' + (st.sesion ? "Modificar sesión" : "Seleccionar sesión") + "</span></button>";
          }
          function cal() {
            let p = document.querySelector(".p-datepicker-panel");
            if (!p) { p = document.createElement("div"); p.className = "p-datepicker-panel"; p.setAttribute("role", "dialog"); document.body.appendChild(p); }
            const y = view.getFullYear(), m = view.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
            let cells = ""; for (let i = 0; i < first; i++) cells += '<td class="p-datepicker-other-month"><span>' + (28 + i) + "</span></td>";
            for (let d = 1; d <= days; d++) cells += '<td><span onclick="pickDay(' + d + ')">' + d + "</span></td>";
            p.innerHTML = '<button type="button" aria-label="Previous Month" onclick="mv(-1)">&lt;</button><button class="p-datepicker-select-month">' + MESES[m] + '</button><button class="p-datepicker-select-year">' + y + '</button><button type="button" aria-label="Next Month" onclick="mv(1)">&gt;</button><table><tbody><tr>' + cells + "</tr></tbody></table>";
          }
          function mv(n) { view = new Date(view.getFullYear(), view.getMonth() + n, 1); cal(); }
          function pickDay(d) {
            const f = String(d).padStart(2, "0") + "/" + String(view.getMonth() + 1).padStart(2, "0") + "/" + view.getFullYear();
            document.getElementById("fecha").value = f; st.fecha = f; st.sesion = ""; document.querySelector(".p-datepicker-panel").remove(); sesionBox(); dirty();
          }
          function dialog(inner) { const d = document.createElement("div"); d.className = "p-dialog"; d.setAttribute("role", "dialog"); d.innerHTML = inner; document.body.appendChild(d); return d; }
          function abrirSesiones() {
            const filas = [["08:30 - 09:25", "Matemáticas ES3", "Otra Docente", false], ["12:40 - 13:35", "Tecnología y Digitalización ES3", "Profe Demo", true]];
            const d = dialog('<app-seleccionar-sesion-alumno><table><thead><tr><th></th><th class="hora">Inicio - fin</th><th>Asignatura</th><th>Docente</th></tr></thead><tbody>' + filas.map(f => '<tr class="p-datatable-selectable-row' + (f[3] ? " daClase" : "") + '"><td><p-radiobutton><input type="radio" name="ses"></p-radiobutton></td><td class="hora"><span>' + f[0] + "</span></td><td><span>" + f[1] + "</span></td><td><span>" + f[2] + "</span></td></tr>").join("") + '</tbody></table><lib-btn-aceptar-cancelar><div class="botones"><button type="button" class="botonRojo" id="sesOk"><span>Cerrar</span></button></div></lib-btn-aceptar-cancelar></app-seleccionar-sesion-alumno>');
            let elegida = null;
            d.querySelectorAll("tbody tr").forEach((tr, i) => tr.querySelector("p-radiobutton").addEventListener("click", () => { elegida = filas[i]; tr.querySelector("input").checked = true; d.querySelector("#sesOk span").textContent = "Aceptar"; }));
            d.querySelector("#sesOk").addEventListener("click", () => { if (elegida) { st.sesion = elegida[0].replace(" - ", " : ") + " - " + elegida[1]; } d.remove(); sesionBox(); dirty(); });
          }
          function abrirConductas() {
            const cats = Object.keys(CONDUCTS);
            const d = dialog('<app-seleccionar-anotacion-codificada><ul class="checks">' + cats.map((c, i) => '<li><lib-checkbox name="categorias"><p-checkbox data-p-checked="false" id="cat' + i + '"><input type="checkbox"><div class="p-checkbox-box"></div></p-checkbox><label>' + c + "</label></lib-checkbox></li>").join("") + '</ul><p-listbox><ul role="listbox" id="lista"></ul></p-listbox><button type="button" class="botonRojo" id="agregar" disabled><span>Agregar</span></button><button type="button" class="botonRojo" id="cancelar"><span>Cancelar</span></button></app-seleccionar-anotacion-codificada>');
            let elegida = null;
            const pinta = () => {
              const on = cats.filter((c, i) => d.querySelector("#cat" + i).getAttribute("data-p-checked") === "true");
              const items = on.flatMap(c => CONDUCTS[c].map(x => [c, x]));
              d.querySelector("#lista").innerHTML = items.map(([c, x]) => '<li role="option" aria-label="' + x + '" aria-selected="false" data-cat="' + c + '"><span>' + x.trim() + "</span></li>").join("");
              d.querySelectorAll("#lista li").forEach(li => li.addEventListener("click", () => { d.querySelectorAll("#lista li").forEach(o => o.setAttribute("aria-selected", "false")); li.setAttribute("aria-selected", "true"); elegida = [li.dataset.cat, li.getAttribute("aria-label")]; d.querySelector("#agregar").disabled = false; }));
            };
            d.querySelectorAll("lib-checkbox label").forEach((l, i) => l.addEventListener("click", () => { const b = d.querySelector("#cat" + i); b.setAttribute("data-p-checked", String(b.getAttribute("data-p-checked") !== "true")); pinta(); }));
            d.querySelector("#cancelar").addEventListener("click", () => d.remove());
            d.querySelector("#agregar").addEventListener("click", () => {
              st.conducta = elegida[1].trim(); d.remove(); dirty();
              const nombre = st.conducta.charAt(0) + st.conducta.slice(1).toLowerCase();
              document.getElementById("conductaBox").innerHTML = '<span class="negrita">' + nombre + "</span> <span>(" + (elegida[0].includes("contrarias") ? "contraria a la convivencia" : "gravemente perjudicial") + ')</span> <button type="button" class="botonRojoPeke" onclick="abrirConductas()"><span>Modificar anotacion</span></button>';
              document.getElementById("medidaBox").innerHTML = '<app-medida-form><p-select placeholder="Seleccione una medida" id="medida" style="display:inline-block"><span role="combobox" class="p-select-label p-placeholder">Seleccione una medida</span><div role="button" class="p-select-dropdown" style="display:inline-block;width:16px;height:16px">▼</div></p-select></app-medida-form>';
              bindSelect(document.getElementById("medida"), MEASURES, v => { st.medida = v; });
            });
          }
          async function guardar(enviar) {
            const relato = document.getElementById("relato").value;
            const err = document.querySelector(".fechaUbicacionSesion");
            if (!st.fecha || !st.espacio || (st.espacio === "Sesión presencial" && !st.sesion) || !relato || !st.conducta) { err.textContent = "Faltan campos obligatorios"; return; }
            err.textContent = "";
            await fetch("/convivencia/guardar", { method: "POST", body: JSON.stringify({ grupo: ${JSON.stringify(attr(grupo))}, alumno: ${JSON.stringify(attr(alumno))}, fecha: st.fecha, espacio: st.espacio, sesion: st.sesion, relato, familia: st.familia, conducta: st.conducta, medida: st.medida, enviado: enviar }) });
            document.getElementById("toast").innerHTML = '<div class="p-toast-message"><span>Informe guardado correctamente</span></div>';
            if (enviar) { document.getElementById("st1").classList.remove("p-step-active"); document.getElementById("st2").classList.add("p-step-active"); document.getElementById("estado").textContent = "Pendiente de envío"; }
          }
        </script>`
      )
    );
    return true;
  }
  return false;
}
