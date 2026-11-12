/**
 * Educa simulado para probar el servidor sin tocar el Educa real.
 * No reproduce el Educa real: solo imita su forma general (login, menú,
 * marco con filtros y tabla de notas con desplegables, botón Guardar).
 *   npm run mock   -> http://127.0.0.1:4321  (usuario: profe / contraseña: 1234)
 */
import { createServer, type IncomingMessage, type Server } from "node:http";

const STUDENTS = [
  { id: "1001", name: "GARCÍA LÓPEZ, Ana" },
  { id: "1002", name: "Pérez Martínez, Iñigo" },
  { id: "1003", name: "Etxeberria Goñi, Maite" },
  { id: "1004", name: "Fernández de la Fuente, Jon" },
  { id: "1005", name: "López Sanz, Marta", locked: true },
  { id: "1006", name: "Ruiz Arana, Pablo" }
];
const LABELS = ["", "Insuficiente (1)", "Insuficiente (2)", "Insuficiente (3)", "Insuficiente (4)", "Suficiente (5)", "Bien (6)", "Notable (7)", "Notable (8)", "Sobresaliente (9)", "Sobresaliente (10)"];

export const saved: Record<string, Record<string, string>> = {}; // "grupo|ev" -> id -> nota

const page = (title: string, body: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  let data = "";
  for await (const chunk of req) data += chunk;
  return new URLSearchParams(data);
}

export function startMock(port = 0): Promise<{ server: Server; url: string }> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const logged = (req.headers.cookie ?? "").includes("sesion=ok");
    const send = (html: string, status = 200) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    };
    if (url.pathname === "/api/state") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(saved));
    }
    if (url.pathname === "/login" && req.method === "POST") {
      const body = await readBody(req);
      if (body.get("usuario") === "profe" && body.get("clave") === "1234") {
        res.writeHead(302, { location: "/inicio", "set-cookie": "sesion=ok; Path=/" });
        return res.end();
      }
      return send(page("Educa", `<p class="error">Usuario o contraseña incorrectos</p><a href="/">Volver</a>`), 401);
    }
    if (!logged) {
      return send(page("Educa - Acceso", `<h1>Educa</h1><form method="post" action="/login"><label for="u">Usuario</label><input id="u" name="usuario"><label for="p">Contraseña</label><input id="p" type="password" name="clave"><button type="submit">Entrar</button></form>`));
    }
    if (url.pathname === "/" || url.pathname === "/inicio") {
      return send(page("Educa - Inicio", `<div id="usuario-conectado">Profe Demo</div><nav><a href="/marco">Evaluación</a> <a href="#">Faltas</a> <a href="#">Horario</a></nav><h1>Bienvenido</h1>`));
    }
    if (url.pathname === "/marco") {
      return send(page("Educa - Evaluación", `<div id="usuario-conectado">Profe Demo</div><h1>Evaluación · Calificaciones</h1><iframe src="/notas" width="1000" height="700"></iframe>`));
    }
    if (url.pathname === "/cuaderno/guardar" && req.method === "POST") {
      const body = await readBody(req);
      (saved["cuaderno"] ??= {})[body.get("id") ?? ""] = body.get("nota") ?? "";
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === "/cuaderno") {
      // Imita el Cuaderno de aula de Educa-Gestión: tarjetas por alumno, desplegables PrimeNG y guardado automático
      const cur = saved["cuaderno"] ?? {};
      const cards = STUDENTS.map(s => {
        const [ap, nom] = s.name.split(", ");
        const v = cur[s.id] ?? "";
        const cell = s.locked
          ? `<app-ver-calificacion><span class="spanCalificacion">FPEX</span></app-ver-calificacion>`
          : url.searchParams.get("bach")
          ? `<p-select class="p-select" data-id="${s.id}"><input type="text" class="p-select-label" value="${v}" onchange="pend('${s.id}', this.value)"><div class="p-select-dropdown"></div></p-select>`
          : `<p-select placeholder="Sin calificar" class="p-select" data-id="${s.id}"><span role="combobox" class="p-select-label${v ? "" : " p-placeholder"}">${v || "Sin calificar"}</span></p-select>`;
        return `<div class="elementoLista"><div class="infoAlumno" id="id-${s.id}"><a class="enlaceNombre"><span class="nombreTabla">${ap} <span>,</span> <span class="nombre">${nom}</span></span></a></div>
          <app-calificacion-evaluaciones><table><thead><tr><th><span>Ev. In.</span></th><th><span>1Ev</span></th><th><span>2Ev</span></th></tr></thead>
          <tbody><tr><td><span class="spanCalificacion">NN</span></td><td>${cell}</td><td><span class="spanCalificacion"></span></td></tr></tbody></table></app-calificacion-evaluaciones>
          <h4>Observaciones</h4><textarea></textarea></div>`;
      }).join("");
      return send(page("EducaGestion", `<div id="usuario-conectado">Profe Demo</div><h3>Calificaciones de evaluación: Asignatura</h3>
        <app-leyenda-calificaciones><ul>${["SB", "NT", "BI", "SU", "IN", "FPEX"].map(c => `<li><span>${c}</span><span>= x</span></li>`).join("")}</ul></app-leyenda-calificaciones>
        <div class="listadoCalificaciones">${cards}</div>
        <div id="botones"></div>
        <script>
          const pending = {};
          function pend(id, nota) {
            pending[id] = nota;
            document.getElementById("botones").innerHTML = '<lib-btn-aceptar-cancelar><button class="botonRojo" id="ok"><span>Aceptar</span></button><button class="botonRojo"><span>Cancelar</span></button></lib-btn-aceptar-cancelar>';
            document.getElementById("ok").onclick = async () => {
              for (const [i, n] of Object.entries(pending)) await fetch("/cuaderno/guardar", { method: "POST", headers: {"content-type":"application/x-www-form-urlencoded"}, body: "id=" + i + "&nota=" + n });
              document.getElementById("botones").innerHTML = '<div class="mensaje">Datos guardados correctamente</div>';
            };
          }
          document.querySelectorAll("p-select").forEach(ps => ps.querySelector("input") || ps.addEventListener("click", ev => {
            ev.stopPropagation();
            document.querySelectorAll(".p-select-overlay").forEach(o => o.remove());
            const ov = document.createElement("div"); ov.className = "p-select-overlay";
            ov.innerHTML = '<ul role="listbox">' + ["SB","NT","BI","SU","IN","FPEX"].map(c => '<li role="option" aria-label="'+c+'"><span>'+c+'</span></li>').join("") + '</ul>';
            document.body.appendChild(ov);
            ov.querySelectorAll("li").forEach(li => li.addEventListener("click", () => {
              const lab = ps.querySelector("[role=combobox]"); lab.textContent = li.textContent; lab.classList.remove("p-placeholder");
              pend(ps.dataset.id, li.textContent);
              ov.remove();
            }));
          }));
        </script>`));
    }
    if (url.pathname === "/notas" && req.method === "POST") {
      const body = await readBody(req);
      const key = `${body.get("grupo")}|${body.get("ev")}`;
      saved[key] = {};
      for (const s of STUDENTS) {
        const v = body.get(`nota_${s.id}`);
        if (v) saved[key][s.id] = v;
      }
      return send(page("Notas", `<div class="mensaje">Las calificaciones se han guardado correctamente</div><a href="/notas?grupo=${body.get("grupo")}&ev=${body.get("ev")}">Volver</a>`));
    }
    if (url.pathname === "/notas") {
      const grupo = url.searchParams.get("grupo") ?? "";
      const ev = url.searchParams.get("ev") ?? "";
      const opt = (v: string, t: string, cur: string) => `<option value="${v}"${v === cur ? " selected" : ""}>${t}</option>`;
      const filters = `<form method="get" action="/notas">
        <label for="grupo">Grupo</label><select id="grupo" name="grupo">${opt("", "-- Seleccione --", grupo)}${opt("2A", "2º ESO A", grupo)}${opt("2B", "2º ESO B", grupo)}</select>
        <label for="ev">Evaluación</label><select id="ev" name="ev">${opt("", "-- Seleccione --", ev)}${opt("1", "1ª Evaluación", ev)}${opt("2", "2ª Evaluación", ev)}${opt("F", "Final", ev)}</select>
        <button type="submit">Ver</button></form>`;
      if (!grupo || !ev) return send(page("Notas", filters));
      const current = saved[`${grupo}|${ev}`] ?? {};
      const rows = STUDENTS.map(
        (s, i) => `<tr><td>${i + 1}</td><td class="alumno">${s.name}</td>
          <td><select name="nota_${s.id}"${s.locked ? " disabled" : ""}>${LABELS.map((l, n) => opt(n === 0 ? "" : String(n), l, current[s.id] ?? "")).join("")}</select></td>
          <td><textarea name="obs_${s.id}"></textarea></td></tr>`
      ).join("");
      return send(page("Notas", `${filters}<form method="post" action="/notas"><input type="hidden" name="grupo" value="${grupo}"><input type="hidden" name="ev" value="${ev}">
        <table><thead><tr><th>Nº</th><th>Alumno/a</th><th>Nota final</th><th>Observaciones</th></tr></thead><tbody>${rows}</tbody></table>
        <input type="submit" value="Guardar"> <button type="button" onclick="alert('cerrada')">Cerrar evaluación</button></form>`));
    }
    send(page("No encontrado", "404"), 404);
  });
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => {
    const addr = server.address();
    resolve({ server, url: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : port}/` });
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await startMock(4321);
  console.log(`Educa simulado en ${url} (usuario profe / contraseña 1234)`);
}
