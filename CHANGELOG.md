# Cambios

Este proyecto sigue [versionado semántico](https://semver.org/lang/es/).

## 1.3.0 · 2026-11-17

- Partes de convivencia: Claude redacta el informe con tono formal a partir de lo que cuente el docente, propone el tipo de conducta con su artículo del Decreto Foral 47/2010 de Navarra y lo registra en Educa-Gestión → Gestión académica → Convivencia. Tres herramientas nuevas: `educa_preview_incident` (abre el formulario del alumno, lee espacios y conductas de Educa y enseña el parte completo, sin escribir nada), `educa_fill_incident` (rellena fecha, espacio, sesión, relato, contacto con la familia, conducta y medida, sin guardar) y `educa_save_incident` (pulsa *Guardar* para dejarlo en borrador, o *Guardar y enviar* si se pide, solo con `confirm=true`).
- La sesión se elige sola cuando el docente da una única clase a ese alumno ese día; si no, se pide la hora.
- Nuevo atajo *Poner un parte de convivencia* y ajuste `incidentScreen` para centros con otro menú.
- Resumen de la normativa de convivencia y correspondencia con los rótulos de Educa en `docs/normativa-convivencia.md`.

## 1.2.0 · 2026-11-16

- Observaciones para las familias: si el fichero tiene una columna *Observaciones* o *Comentario* (o se dictan en el chat), el conector escribe también el texto en el cuadro de observaciones de cada alumno en Educa-Gestión. La vista previa lo enseña antes, admite alumnos con observación y sin nota, avisa si un texto supera los 4000 caracteres y no sustituye observaciones que ya existan salvo que se pida (`overwrite_comments`). Como las notas, solo se guardan al pulsar *Aceptar* con confirmación.
- `educa_read_grade_sheet` muestra las observaciones actuales de cada alumno.
- En tablas con columna de nota y columna de observaciones, la de nota se elige sola.
- Corregido: los ceros que Educa muestra como `"0 "` (con espacio final) ya no salen como cambio pendiente ni como fallo al verificar.

## 1.1.1 · 2026-11-15

- README renovado: primeros pasos, grupos con nombre parcial, qué se ha probado en el Educa real, diagramas del flujo y de la vista previa.

## 1.1.0 · 2026-11-15

- Detecta la escala de calificación de cada pantalla en vez de suponerla: términos en ESO y Primaria, número de 0 a 10 en Bachillerato, de 1 a 10 en FP y Apto / No apto donde se pida. Lee las opciones reales del desplegable.
- Acepta los términos escritos con palabra completa ("Notable") y rechaza términos donde Educa pide número.
- La vista previa y la lectura de la tabla indican la escala y el grupo detectados.
- `educa_select_filter` ya no escribe en buscadores ajenos al desplegable ni deja el filtro escrito cuando la opción no existe.
- Nuevas herramientas `educa_refresh_groups` ("actualiza mis grupos") y `educa_open_group` ("abre las notas de 1ºAB de Tecnología, 2ª evaluación"): la lista de grupos se lee de Educa y se guarda en el ordenador.
- Nuevo ajuste opcional "Grupos en los que no pongo notas": el conector se niega a preparar, escribir o guardar notas en esos grupos.
- Nuevo resumen de la normativa de evaluación en `docs/normativa-evaluacion.md`.
- Guía de buenas prácticas para preparar los Excel de notas ([docs/BUENAS-PRACTICAS.md](docs/BUENAS-PRACTICAS.md)).
- Carpeta de notas configurable (por defecto *Documentos/Notas Educa*) y herramienta `educa_list_grade_files` para que Claude encuentre el fichero por evaluación, grupo y materia.
- Atajos en el menú de Claude: *Meter notas en Educa*, *Revisar mis notas en Educa* y *Cómo preparo mi Excel de notas*.
- Instrucciones de uso para Claude: flujo, confirmación antes de guardar y resumen de la guía.
- Ficha de la extensión con ejemplos de frases.

## 1.0.0 · 2026-11-12

Primera versión pública.

- Paquete de un clic para Claude Desktop (`.mcpb`) que pide solo usuario y contraseña, ambos opcionales.
- Instalación con `npx -y educa-navarra-mcp` para Claude Code y cualquier otra aplicación compatible con MCP.
- Usa el Chrome o Edge instalado; si no hay ninguno, descarga Chromium la primera vez.
- Flujo de notas: inicio de sesión, navegación a Calificaciones, vista previa, escritura en pantalla y guardado solo con confirmación.
