# Configuración avanzada

La mayoría de docentes **no necesitan nada de esto**: el conector funciona tal cual. Esta página es para quien quiera ajustarlo o ayudar a mantenerlo.

## Herramientas que ofrece

| Herramienta | Qué hace | ¿Cambia algo en Educa? |
|---|---|---|
| `educa_login` | Abre Educa e inicia sesión (automática o a mano) | No |
| `educa_status` | Estado de la sesión y la configuración | No |
| `educa_refresh_groups` | Leer de Educa tus grupos, agrupamientos, asignaturas y evaluaciones y guardar la lista en tu ordenador (`~/.educa-mcp/grupos.json`) | No |
| `educa_open_group` | Abrir directamente las notas de un grupo, asignatura y evaluación | No |
| `educa_navigate`, `educa_click`, `educa_select_filter` | Moverse por Educa hasta la pantalla de calificaciones | No (nunca pulsa cerrar, firmar, borrar…) |
| `educa_inspect_page`, `educa_dump_html`, `educa_screenshot` | Ver qué hay en la página | No |
| `educa_load_grades_file` | Leer tu Excel o CSV | No |
| `educa_read_grade_sheet` | Leer la tabla de notas de Educa | No |
| `educa_preview_grades` | Cruzar tu fichero con Educa y enseñar la vista previa | No |
| `educa_fill_grades` | Escribir las notas en pantalla, sin guardar | Solo en pantalla |
| `educa_save_grades` | Pulsar *Aceptar* (exige `confirm: true`) | **Sí** |
| `educa_close_browser` | Cerrar la ventana del navegador | No |

### Qué comprueba antes de escribir

- Empareja nombres sin importar mayúsculas, tildes ni el orden (`García López, Ana` = `Ana Garcia Lopez`). Si solo coincide en parte (`Etxeberria, Maite` ↔ `Etxeberria Goñi, Maite`) lo marca como *aproximado* y no lo escribe salvo que lo confirmes.
- Avisa de alumnos del fichero que no están en Educa, de alumnos de Educa sin nota en el fichero y de nombres dudosos o repetidos.
- No redondea por ti.
- No toca campos bloqueados (evaluación ya cerrada).
- Antes de escribir comprueba que la tabla no ha cambiado (mismo grupo y alumnos) y después relee cada campo.

## Navegador

Por orden, usa: el navegador indicado en la configuración, **Google Chrome**, **Microsoft Edge** y, si no hay ninguno, el Chromium de Playwright, que descarga solo la primera vez (unos 150 MB).

La sesión de Educa se guarda en un perfil propio del navegador (no toca tu perfil personal de Chrome), en `~/.educa-mcp/profile`.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `EDUCA_USER`, `EDUCA_PASSWORD` | Inicio de sesión automático |
| `EDUCA_NO_GRADE_GROUPS` | Grupos en los que no pones notas, separados por comas (p. ej. `ESO 2º D, ESO 2º E`). El conector se niega a escribir o guardar en ellos. En el fichero de configuración: `noGradeGroups` |
| `EDUCA_CREDENTIALS_FILE` | Ruta a un fichero `{"usuario": "...", "clave": "..."}` (por defecto `~/.educa-mcp/credenciales.json`) |
| `EDUCA_BROWSER_CHANNEL` | `chrome`, `msedge` o `chromium` (el de Playwright) |
| `EDUCA_BROWSER_PATH` | Ruta a un ejecutable de Chrome/Chromium concreto |
| `EDUCA_HEADLESS` | `1` para ocultar el navegador (solo con login automático) |
| `EDUCA_MCP_HOME` | Carpeta de datos (por defecto `~/.educa-mcp`) |
| `EDUCA_CONFIG` | Ruta al fichero de configuración |
| `EDUCA_BASE_URL`, `EDUCA_ALLOWED_HOSTS` | Solo para pruebas |

## Fichero de configuración

Opcional. Se busca en `EDUCA_CONFIG`, en `educa.config.json` de la carpeta actual o en `~/.educa-mcp/educa.config.json`. Parte de [`educa.config.example.json`](../educa.config.example.json).

| Clave | Para qué |
|---|---|
| `browserChannel` | `"chrome"`, `"msedge"` o `"chromium"` |
| `grades.integerOnly` | `false` si tu enseñanza admite decimales (y `decimalSeparator`) |
| `grades.extraValues` | Valores no numéricos admitidos, p. ej. `["NP"]` |
| `login.loggedInSelector` | Selector CSS que solo aparece con la sesión iniciada |
| `login.userSelector`, `login.passwordSelector`, `login.submitSelector` | Si el formulario de acceso no se detecta solo |
| `gradeSheet.*` | Selectores de fila, nombre y campo de nota si la tabla no se detecta sola |
| `save.buttonSelector` | Selector del botón de guardar si no se llama *Guardar/Grabar/Aceptar* |
| `noGradeGroups` | Grupos en los que no pones notas; el conector se niega a escribir en ellos |
| `gradesScreen.path`, `gradesScreen.menu` | Ruta de Educa-Gestión y entradas de menú hasta la pantalla de calificaciones, si en tu centro son distintas |
| `forbiddenClickPattern` | Botones que nunca se pulsan |

## Inicio de sesión automático

- Busca el campo de contraseña y el de usuario que va antes, los rellena y envía el formulario.
- **Un solo intento** por llamada: si Educa rechaza los datos, se para y avisa, para no bloquear tu cuenta. El aviso nunca muestra la contraseña.
- Solo rellena formularios de los dominios permitidos. Si el acceso pasa por Cl@ve, certificado o un segundo factor, ese paso lo haces tú y el conector espera.
- La sesión de Educa caduca a los 30-40 minutos sin actividad; con el login automático se vuelve a entrar sola.

## Probar con el Educa simulado

```bash
npm run mock      # Educa simulado en http://127.0.0.1:4321 (usuario profe, clave 1234)
EDUCA_BASE_URL=http://127.0.0.1:4321/ EDUCA_ALLOWED_HOSTS=127.0.0.1 EDUCA_CONFIG=test/mock/educa.config.json \
  npx @modelcontextprotocol/inspector node dist/index.js
```
