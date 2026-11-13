# Buenas prácticas: prepara tus notas para que Claude las meta sin líos

Cinco minutos de orden al principio de curso te ahorran sustos en cada evaluación. Con estas pautas Claude encuentra el fichero correcto, empareja bien a tu alumnado y no tiene que preguntarte nada raro.

> [!TIP]
> **Resumen en una línea:** una carpeta *Notas Educa*, un fichero por grupo y materia llamado `EVALUACIÓN_GRUPO_MATERIA.xlsx`, y dentro una fila por alumno con las columnas **Alumno** y **Nota**.

---

## 1. Una sola carpeta para todas tus notas

Crea la carpeta **Notas Educa** dentro de **Documentos**. Es la que Claude mira por defecto.

| Sistema | Ruta |
|---|---|
| Mac | `/Users/tu_usuario/Documents/Notas Educa` (en Finder aparece como *Documentos › Notas Educa*) |
| Windows | `C:\Users\tu_usuario\Documents\Notas Educa` |

Dentro, una subcarpeta por curso escolar. Si eres interino o interina y cambias de centro, así tienes cada año separado y Claude no confunde el 1ºA de este curso con el del anterior:

```
Notas Educa/
├── 2025-26/
└── 2026-27/
    ├── 1EV_BTO-1A_TIC.xlsx
    ├── 1EV_ESO-3DEFH_Matematicas.xlsx
    └── FINAL_BTO-2A_Programacion.xlsx
```

- ¿Prefieres otra carpeta? En Claude Desktop cámbiala en **Ajustes → Extensiones → Educa Navarra → Carpeta de notas**.
- ¿Trabajas en OneDrive o Google Drive? Vale, pero marca la carpeta como **disponible sin conexión**: si el fichero solo está en la nube, el conector no puede abrirlo.
- Si no quieres usar carpeta, también puedes **adjuntar el Excel en el chat**. Funciona igual, pero todo su contenido pasa por la conversación.

## 2. Nombra cada fichero: `EVALUACIÓN_GRUPO_MATERIA`

Tres partes separadas por **guion bajo** (`_`). Dentro de cada parte usa guiones (`-`) en lugar de espacios.

| Parte | Cómo escribirla | Ejemplos |
|---|---|---|
| Evaluación | `1EV`, `2EV`, `3EV`, `FINAL`, `ORD`, `EXTRA` | `1EV` |
| Grupo | Como en Educa, sin espacios ni `º` | `BTO-1A`, `ESO-3DEFH`, `CFGS-DAM1` |
| Materia | Nombre corto y reconocible | `TIC`, `Matematicas`, `Programacion` |

✅ `1EV_BTO-1A_TIC.xlsx`  ✅ `FINAL_ESO-1AB_Tecnologia.xlsx`
❌ `notas definitivas (2).xlsx`  ❌ `TIC 1ºA 1ª ev_v3 BUENO.xlsx`

Así puedes pedir *"mete las notas de la 1ª evaluación de 1ºA de Bachillerato, TIC"* y Claude encuentra el fichero solo. Si hay dos que encajan, te preguntará cuál.

## 3. Dentro del fichero

**Una tabla sencilla**, empezando en la primera fila:

| Apellidos | Nombre | Nota |
|---|---|---|
| García López | Ana | 7 |
| Pérez Martínez | Iñigo | 9 |
| Etxeberria Goñi | Maite | |

- **Primera fila = cabeceras.** Claude reconoce solas *Alumno*, *Apellidos* + *Nombre*, *Nota*, *Nota final*, *Calificación*. Si las tuyas se llaman distinto (*Media T1*), díselo: *"la nota está en la columna Media T1"*.
- **Una fila por alumno**, sin filas de totales, medias de clase ni comentarios debajo.
- **Nada de celdas combinadas** ni títulos encima de la tabla.
- **Nombres como en Educa.** El emparejamiento tolera tildes, mayúsculas y el orden *Apellidos, Nombre* / *Nombre Apellidos*, pero si pones solo un apellido o un mote, la coincidencia saldrá como *aproximada* y tendrás que confirmarla. Lo más fiable: copia la lista de alumnos desde Educa al empezar el curso.
- **Columna NIA (opcional).** Si la tienes, añádela con la cabecera *NIA*: ayuda a distinguir a dos alumnos con nombres parecidos.
- **Sin nota = celda vacía.** Ese alumno se salta y la vista previa te lo recuerda.
- **Una hoja por fichero.** Claude lee la primera hoja. Si guardas varias materias o evaluaciones en hojas distintas del mismo libro, ponles nombres claros y dile cuál usar (*"usa la hoja 2EV"*).
- **Puedes usar fórmulas.** Se lee el resultado tal como quedó al guardar en Excel.

## 4. La nota, según la etapa

| Etapa | Qué poner | Ojo con |
|---|---|---|
| **ESO** | `IN`, `SU`, `BI`, `NT`, `SB`… o un número entero de 0 a 10 | Si pones números, se convierten: 0–4 IN, 5 SU, 6 BI, 7–8 NT, 9–10 SB |
| **Bachillerato** | Número entero de 0 a 10 | Nada de decimales; `NP` en la extraordinaria si Educa lo ofrece |
| **FP (módulos)** | Número entero de 1 a 10 | El 0 no existe en FP |

**El conector no redondea por ti.** Un `6,5` se rechaza y te avisa: decide tú y corrígelo en el fichero. Si calculas la media con fórmulas, añade una columna *Nota final* con el número ya redondeado (por ejemplo `=REDONDEAR(D2;0)`) y deja la media en otra columna.

Más detalle y normativa: [normativa-evaluacion.md](normativa-evaluacion.md).

## 5. Formatos

- ✅ Excel (`.xlsx`) o CSV (separado por `;` o `,`).
- ❌ `.xls` antiguo, `.ods` (LibreOffice) o Numbers: ábrelos y usa *Guardar como… → Libro de Excel (.xlsx)*.
- Google Sheets: *Archivo → Descargar → Microsoft Excel (.xlsx)* y guárdalo en tu carpeta de notas.

## 6. El día de la evaluación

1. **Cierra el Excel** antes de pedírselo a Claude, para que lea la versión guardada.
2. Pide: *"Mete las notas de la 1ª evaluación de BTO N 1ºA, TIC."* (o usa el atajo **Meter notas en Educa** del menú **+**).
3. **Lee la vista previa entera:** alumnos sin emparejar, nombres aproximados, notas rechazadas y alumnos de Educa sin nota.
4. Di *"escríbelas"* y **revísalas en la ventana del navegador**.
5. Solo entonces di *"guarda"*. Cerrar y firmar la evaluación sigue siendo cosa tuya, a mano.

## 7. Privacidad

- Guarda los ficheros en tu ordenador o en la nube de tu cuenta educativa, no en carpetas compartidas con otras personas.
- Usa solo las columnas necesarias (alumno, nota y, si quieres, NIA). No hace falta poner observaciones, teléfonos ni nada más.
- Al terminar el curso, archiva o borra lo que ya no necesites, según las indicaciones de tu centro.

---

¿Se te ocurre algún consejo más? Propónlo en [Issues](https://github.com/vTanco/educa-navarra-mcp/issues).
