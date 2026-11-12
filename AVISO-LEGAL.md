# Aviso legal y privacidad

*Última actualización: noviembre de 2026*

## 1. Herramienta no oficial

**educa-navarra-mcp** es un proyecto independiente, de código abierto y sin ánimo de lucro, creado por docentes. **No está desarrollado, respaldado ni supervisado por el Gobierno de Navarra, el Departamento de Educación ni sus proveedores.** "Educa" es el nombre del portal educativo del Gobierno de Navarra y aquí se usa únicamente para describir con qué funciona la herramienta. No se usan sus logotipos ni su imagen.

La herramienta no utiliza ninguna interfaz privada ni salta ninguna medida de seguridad: maneja el navegador de tu ordenador, con tu propia cuenta y tus permisos, igual que lo harías tú a mano.

## 2. Tu responsabilidad como docente

- Las calificaciones son un acto administrativo del que **tú eres responsable**. Revisa siempre la vista previa y la pantalla de Educa antes de confirmar el guardado.
- La herramienta solo guarda cuando lo confirmas expresamente, y nunca cierra, firma, bloquea ni publica una evaluación: esos pasos los haces tú.
- Usa solo tu propia cuenta. No compartas tus credenciales ni las de otra persona.
- Respeta las instrucciones de tu centro y del Departamento sobre el uso de herramientas digitales y de inteligencia artificial.

## 3. Datos personales (RGPD y LOPDGDD)

Las notas y los nombres del alumnado son datos personales de menores en muchos casos. Conviene que sepas exactamente por dónde pasan:

| Dato | Dónde está | ¿Sale de tu ordenador? |
|---|---|---|
| Usuario y contraseña de Educa | En tu ordenador (Claude Desktop los guarda cifrados; en las otras opciones, en el fichero o variables que tú configures) | Solo hacia el formulario de acceso de Educa |
| Sesión del navegador | Carpeta `.educa-mcp` de tu usuario | No |
| Tu Excel o CSV | Donde tú lo guardes | El conector lo lee en local; **lo que Claude muestre en el chat sí pasa por la IA** |
| Nombres y notas de Educa (vista previa, lecturas, capturas) | Se envían como respuesta de las herramientas | **Sí: forman parte de la conversación con el proveedor de IA que uses** |

El proyecto **no tiene servidores propios** y no recoge, almacena ni recibe ningún dato: ni credenciales, ni datos del alumnado, ni estadísticas de uso.

Lo que sí ocurre es que la aplicación de IA que uses (por ejemplo Claude, de Anthropic) recibe el contenido de la conversación, incluidos los nombres y notas que las herramientas le devuelven. Ese tratamiento se rige por las condiciones y la política de privacidad de ese proveedor y por el tipo de cuenta que tengas. **Antes de usarla con datos reales, comprueba que tu centro o el Departamento permiten tratar datos del alumnado con esa herramienta de IA**, y en caso de duda consulta con la persona delegada de protección de datos.

Para reducir los datos que se comparten:

- Usa el fichero con solo las columnas necesarias (alumno y nota).
- No pidas capturas de pantalla ni volcados de la página si no hace falta.
- Si abres un aviso en GitHub, **no incluyas nombres ni notas reales**.

## 4. Sin garantía

El software se ofrece **"tal cual", sin garantía de ningún tipo**, según la [licencia MIT](LICENSE). Educa puede cambiar su diseño en cualquier momento y hacer que la herramienta deje de funcionar o se comporte de forma inesperada. Los autores no se hacen responsables de calificaciones erróneas, pérdidas de datos ni de cualquier otro perjuicio derivado de su uso.

## 5. Contacto

Dudas, errores o propuestas: [github.com/vTanco/educa-navarra-mcp/issues](https://github.com/vTanco/educa-navarra-mcp/issues).
