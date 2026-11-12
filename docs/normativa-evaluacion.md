# Cómo se califica en cada etapa (LOMLOE) y qué hace el servidor

Resumen de trabajo para el MCP de Educa. No sustituye a la norma: ante la duda manda el texto oficial y, sobre todo, **lo que ofrezca la pantalla de Educa**. Consultado el 12-11-2026.

## Principio de diseño

Quien usa el servidor puede ser un interino que cada curso cambia de centro y de etapa. Por eso el servidor **no supone la escala por el nombre del grupo**: lee la pantalla abierta (opciones reales del desplegable, o si la nota se teclea) y adapta cada nota a eso. La etapa (deducida del nombre del grupo: ESO, BTO, CFGM/CFGS...) solo afina el rango numérico.

## Escalas por etapa

| Etapa | Cómo se expresa la nota | Norma estatal | Norma de Navarra |
|---|---|---|---|
| Primaria | Términos: Insuficiente (IN), Suficiente (SU), Bien (BI), Notable (NT), Sobresaliente (SB) | RD 157/2022 | Orden Foral de evaluación de Primaria (BON 2023) |
| ESO (materias y ámbitos) | Los mismos términos: IN negativa; SU, BI, NT, SB positivas. Sin nota numérica | RD 217/2022, art. 31 | Orden Foral 53/2023, de 12 de junio, art. 12 |
| Bachillerato | Número de 0 a 10 **sin decimales**; negativas las inferiores a 5. "NP" (no presentado) en la extraordinaria. "MH" tras un 10 | RD 243/2022 | Orden Foral 45/2023, de 10 de mayo, art. 10 y 19 |
| FP grado medio y superior | Módulos profesionales: número de **1 a 10 sin decimales**; positivas de 5 en adelante. Nota final del ciclo: media con dos decimales (la calcula el sistema) | RD 659/2023 | Orden Foral 46/2026, de 25 de septiembre (BON 15-10-2026) |
| FP grado básico | Se evalúa por ámbitos y módulos según su normativa propia; algunas comunidades usan los términos de la ESO para los ámbitos | RD 659/2023 y RD 217/2022 | Orden Foral 46/2026 |

Otros valores que aparecen en actas de Navarra y que el servidor solo escribe si la pantalla los ofrece: **EX** (exento), **PEX** (pendiente de exención, en evaluaciones parciales), **CV** (convalidada), **NP**. En el Educa real hemos visto además **FPEX** en los desplegables de ESO y Bachillerato.

### Formación en empresa (FP)

Con la nueva FP la estancia en empresa ya no es un módulo aparte con "Apto / No apto": sus resultados se integran en la nota de cada módulo, que pone el profesorado (Orden Foral 46/2026, art. 29.4: la valoración de la empresa no se convierte automáticamente en nota numérica). En planes antiguos la FCT sí se calificaba Apto / No apto. El servidor admite ambas cosas: si la pantalla ofrece Apto / No apto, exige el término y rechaza números.

## Conversión de números a términos

La norma de la ESO no fija una tabla número → término (las actas solo llevan el término). El servidor aplica la equivalencia tradicional, que es la que usan los centros y la que recogen otras comunidades (p. ej. Castilla y León, Orden EDU/424/2024, art. 7.6):

| Nota del fichero | Término |
|---|---|
| 0, 1, 2, 3, 4 | IN |
| 5 | SU |
| 6 | BI |
| 7, 8 | NT |
| 9, 10 | SB |

No redondea: un 6,5 se rechaza y decide el profesor. La vista previa enseña siempre el término y, entre paréntesis, el número de origen.

## Pendiente de comprobar

- No se ha visto ninguna pantalla de FP en el Educa real (la cuenta de pruebas no tiene grupos de FP); lo de FP está probado solo con el simulador.
- La Orden Foral 46/2026 es muy reciente: no hemos podido leer sus anexos ni el detalle de cómo se consignan exenciones y convalidaciones en FP.
- Un resumen automático de la Orden Foral 53/2023 abreviaba Suficiente como "SF"; el Educa real muestra "SU". El servidor acepta las dos.

## Fuentes

- LOMLOE: Ley Orgánica 3/2020, de 29 de diciembre (BOE-A-2020-17264).
- RD 157/2022 (Primaria), RD 217/2022 (ESO), RD 243/2022 (Bachillerato), RD 659/2023 (FP): https://boe.es/boe/dias/2023/07/22/pdfs/BOE-A-2023-16889.pdf
- Navarra, ESO: https://laadministracionaldia.inap.es/noticia.asp?id=1234848
- Navarra, Bachillerato: https://laadministracionaldia.inap.es/noticia.asp?id=1233983
- Navarra, FP: https://laadministracionaldia.inap.es/noticia.asp?id=1270198
- Eurydice, Bachillerato y FP: https://eurydice.eacea.ec.europa.eu/es/eurypedia/spain/evaluacion-certificacion-y-promocion-en-la-ensenanza-secundaria-superior-general y https://eurydice.eacea.ec.europa.eu/es/eurypedia/spain/evaluacion-promocion-y-certificacion-en-la-ensenanza-secundaria-superior
