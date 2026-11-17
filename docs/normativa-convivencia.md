# Partes de convivencia: normativa de Navarra y qué hace el conector

Resumen para clasificar los partes (en Educa, *informes de convivencia*). No sustituye al texto legal ni al reglamento de convivencia de tu centro.

## Principio de diseño

El conector **no impone una lista de conductas**: lee en cada formulario las categorías, conductas, espacios y medidas que ofrece Educa en tu centro y solo permite elegir entre ellas. La tabla de abajo sirve para explicar a qué artículo corresponde cada opción y para que Claude proponga la más adecuada. Si Educa cambia sus rótulos o el Departamento aprueba un decreto nuevo, el conector sigue funcionando con lo que muestre Educa; solo habría que actualizar esta tabla y `src/convivencia.ts`.

## Norma vigente

- **Decreto Foral 47/2010**, de 23 de agosto, de derechos y deberes del alumnado y de la convivencia en los centros educativos no universitarios públicos y privados concertados de Navarra.
- Modificado por el **Decreto Foral 57/2014**, de 2 de julio.
- Cada centro puede concretar las conductas en su reglamento de convivencia (art. 17.3).

En 2026 el Departamento de Educación ha presentado un nuevo decreto foral de convivencia que sustituirá al de 2010 (acoso y ciberacoso, violencia contra las mujeres, LGTBI+fobia, salud mental, prácticas restaurativas). Mientras no se publique en el BON, rige el de 2010.

## Dos categorías

| Categoría en Educa | Artículo | Qué es | Quién impone la medida |
|---|---|---|---|
| Conductas contrarias | Art. 14 | No alteran gravemente la convivencia | El profesor en el aula (medidas a y b del art. 16); la dirección o persona delegada, el resto |
| Conductas perjudiciales | Art. 17 | Alteran gravemente la convivencia | La dirección, con procedimiento (arts. 19 a 21) |

Plazos útiles: la información a la familia en conflictos de convivencia, lo antes posible y como máximo en tres días lectivos (art. 26). Las conductas contrarias no pueden corregirse pasados 20 días lectivos desde que se conoce a su autor (art. 16.5).

## Correspondencia con los rótulos de Educa

Rótulos tal como aparecen en el Educa de un instituto de Navarra (noviembre de 2026). Descripciones resumidas.

### Contrarias a la convivencia (art. 14)

| Educa | Art. | Conducta |
|---|---|---|
| NO ESTUDIA | 14 a) | No cumplir el deber de estudio o perturbar la clase |
| NO JUSTIFICA | 14 b) | Faltas de puntualidad o asistencia sin justificar |
| NO TRAE MATERIAL | 14 c) | Venir a clase sin material de forma reiterada |
| ACTITUD PASIVA | 14 d) | No hacer las tareas de forma continuada |
| COPIA | 14 e) | Copiar o dejar copiar |
| CONTRA DIGNIDAD | 14 f) | Manifestaciones contrarias a la dignidad de las personas o a los derechos democráticos |
| FALTA DE RESPETO | 14 g) | Falta de respeto a la autoridad del profesorado o desobediencia |
| DESCONSIDERACIÓN | 14 h) | Trato incorrecto o desconsiderado |
| INASISTENCIA GRUPAL | 14 i) | Ausencias colectivas no autorizadas |
| INFORMACIÓN FALSA | 14 j) | Faltar a la verdad sin perjuicio grave |
| LLEVAR SIN AUTORIZACIÓN | 14 k) | Llevar o usar objetos no permitidos (por ejemplo, el móvil) |
| UTILIZAR SIN AUTORIZACIÓN | 14 l) | Usar espacios o equipos sin permiso o con fines no educativos |
| INDUMENTARIA | 14 m) | Incumplir las normas de indumentaria |
| HIGIENE | 14 n) | Descuido reiterado de la higiene |
| DETERIORO DE INSTALACIÓN | 14 ñ) | Daños leves intencionados |
| PERJUDICAR LIMPIEZA | 14 o) | Ensuciar instalaciones, pintadas |
| CONSUMIR TABACO O ALCOHOL | 14 p) | Fumar o beber alcohol en el centro o sus actividades |
| NO ENTREGAR A FAMILIA | 14 q) | No entregar a la familia la información del centro |
| OTRA CUALQUIERA | 14 r) | Otra incorrección que altere la actividad sin ser grave |

### Gravemente perjudiciales para la convivencia (art. 17)

| Educa | Art. | Conducta |
|---|---|---|
| OFENSA O AGRESIÓN GRAVE | 17.1 a) | Injurias, amenazas, violencia, acoso o agresiones |
| GRABACIÓN | 17.1 b) | Grabar sin autorización |
| DIFUNDE IMAGEN | 17.1 c) | Difundir grabaciones o conductas |
| DETERIORO MATERIAL | 17.1 d) | Daños graves intencionados |
| AGRESIÓN | 17.1 e) | Conductas que ponen en riesgo la integridad física |
| FALSIFICAR | 17.1 f) | Faltar a la verdad con perjuicio grave |
| SUSTRAER | 17.1 g) | Sustraer pertenencias |
| SUPLANTAR | 17.1 h) | Suplantar, falsificar o sustraer documentos académicos |
| NO COMUNICAR | 17.1 i) | No comunicar conductas graves conocidas |
| INSUBORDINACIÓN | 17.1 j) | Insubordinación, incumplir las medidas impuestas |
| APOLOGÍA | 17.1 k) | Escritos contra derechos constitucionales o apología del terrorismo |
| DROGAS / ALCOHOL | 17.1 l) | Consumo o tráfico de drogas, consumo reiterado de tabaco o alcohol |
| REITERAR CONDUCTA | 17.1 m) | Reiteración de conductas contrarias |
| IMPEDIR ACTIVIDADES | 17.1 n) | Impedir el normal desarrollo de las actividades |
| INCUMPLIMIENTO DE COMPROMISOS | 17.1 ñ) | Incumplir compromisos de convivencia firmados |
| INCITAR | 17.2 | Incitar a otros a cometer conductas graves |

La correspondencia de *FALSIFICAR* y *SUPLANTAR* se ha deducido del orden de la lista de Educa; el icono de información junto a la conducta elegida en Educa muestra su descripción completa.

## Cómo redacta Claude el relato

El campo *Observaciones de lo sucedido* admite 4000 caracteres. Las instrucciones del conector piden:

- Hechos observables, en orden y en tercera persona: qué hizo o dijo el alumno, cuándo y dónde, cómo respondió a las indicaciones y qué medida inmediata se tomó.
- Tono formal y objetivo, sin juicios sobre la persona, diagnósticos ni adjetivos valorativos.
- Sin nombres de otros alumnos (un compañero, iniciales) y sin datos de salud o familiares innecesarios.
- Palabras textuales entre comillas solo si el docente las da. Nada inventado.

## Fuentes

- Decreto Foral 47/2010, de 23 de agosto, texto consolidado con la modificación de 2014.
- Decreto Foral 57/2014, de 2 de julio (BON de 30 de julio de 2014).
- Departamento de Educación del Gobierno de Navarra: presentación del nuevo decreto foral de convivencia (mayo de 2026).
