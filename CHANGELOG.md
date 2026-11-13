# Cambios

Este proyecto sigue [versionado semántico](https://semver.org/lang/es/).

## Sin publicar

- Detecta la escala de calificación de cada pantalla en vez de suponerla: términos en ESO y Primaria, número de 0 a 10 en Bachillerato, de 1 a 10 en FP y Apto / No apto donde se pida. Lee las opciones reales del desplegable.
- Acepta los términos escritos con palabra completa ("Notable") y rechaza términos donde Educa pide número.
- La vista previa y la lectura de la tabla indican la escala y el grupo detectados.
- `educa_select_filter` ya no escribe en buscadores ajenos al desplegable ni deja el filtro escrito cuando la opción no existe.
- Nuevo resumen de la normativa de evaluación en `docs/normativa-evaluacion.md`.

## Sin publicar

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
