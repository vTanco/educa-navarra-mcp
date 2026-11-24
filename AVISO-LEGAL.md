# Aviso legal y privacidad

*Última actualización: noviembre de 2026*

## 1. Herramienta no oficial

**educa-navarra-mcp** es un proyecto independiente, de código abierto y sin ánimo de lucro, creado por docentes. **No está desarrollado, respaldado ni supervisado por el Gobierno de Navarra, el Departamento de Educación ni sus proveedores.** "Educa" es el nombre del portal educativo del Gobierno de Navarra y aquí se usa únicamente para describir con qué funciona la herramienta. No se usan sus logotipos ni su imagen.

La herramienta no utiliza ninguna interfaz privada ni salta ninguna medida de seguridad: maneja el navegador de tu ordenador, con tu propia cuenta y tus permisos, igual que lo harías tú a mano.

## 2. Tu responsabilidad como docente

- Las calificaciones y los partes de convivencia son actos de los que **tú eres responsable**. El relato de un parte que redacta la IA es una propuesta: revísalo y corrígelo antes de guardarlo.
- Revisa siempre la vista previa y la pantalla de Educa antes de confirmar el guardado.
- La herramienta solo guarda cuando lo confirmas expresamente, y nunca cierra, firma, bloquea ni publica una evaluación: esos pasos los haces tú.
- Usa solo tu propia cuenta. No compartas tus credenciales ni las de otra persona.
- Usa la herramienta bajo tu responsabilidad y conforme a las normas de tu centro, a las instrucciones del Departamento sobre herramientas digitales e inteligencia artificial y a las indicaciones de la persona delegada de protección de datos (DPD) del Departamento de Educación.

## 3. Datos personales (RGPD y LOPDGDD)

Los datos de Educa están sujetos a la Ley Orgánica 3/2018, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD), y al Reglamento General de Protección de Datos (RGPD). El responsable de esos datos es el Departamento de Educación; quien accede a Educa los trata bajo sus instrucciones y con deber de confidencialidad. La herramienta está diseñada para ayudar a cumplir esa normativa, pero el cumplimiento depende también de cómo la uses y de lo que autoricen tu centro y el Departamento.

### Modo privado (activado por defecto)

Con el modo privado, el proveedor de IA no recibe datos identificativos del alumnado:

- Cada alumno aparece en las respuestas de la herramienta con un código (A01, A02…). La correspondencia entre códigos y nombres solo existe en la memoria de tu ordenador mientras la herramienta está abierta; no se guarda en disco.
- No se envían NIA ni el texto de las observaciones para las familias.
- La vista previa con nombres se abre en una pestaña del navegador de la herramienta, en tu ordenador.
- En los partes de convivencia eliges al alumno en la ventana de Educa, y la herramienta rechaza relatos que contengan nombres o apellidos de alumnos del grupo.
- Las herramientas que devolverían el contenido completo de la página quedan desactivadas o recortadas.

Un dato seudonimizado sigue siendo, en principio, un dato personal para quien puede reidentificarlo (en este caso, solo tú). El modo privado reduce mucho el riesgo, pero lo que escribas tú en el chat sí llega a la IA.

Desactiva el modo privado solo si tu centro o el Departamento han autorizado expresamente tratar datos del alumnado con la herramienta de IA que uses.

### Por dónde pasa cada dato

| Dato | Dónde está | ¿Llega a la IA con modo privado? | ¿Y sin él? |
|---|---|---|---|
| Usuario y contraseña de Educa | En tu ordenador (Claude Desktop los guarda cifrados; en las otras opciones, en el fichero o variables que tú configures) | No | No |
| Sesión del navegador | Carpeta `.educa-mcp` de tu usuario | No | No |
| Nombres y NIA del alumnado | Educa y tu Excel | No: solo códigos | Sí |
| Notas | Educa y tu Excel | Sí, asociadas a un código | Sí, con el nombre |
| Observaciones para las familias | Tu Excel y Educa | No (solo cuántas hay) | Sí |
| Relato de un parte de convivencia | La conversación y, al guardarlo, Educa | Sí, sin nombres de alumnos | Sí |
| Lo que tú escribes en el chat | La conversación | Sí | Sí |
| Capturas de pantalla al guardar | Carpeta `.educa-mcp/capturas`; se borran a los 30 días | No | No |

El proyecto **no tiene servidores propios** y no recoge, almacena ni recibe ningún dato: ni credenciales, ni datos del alumnado, ni estadísticas de uso.

La aplicación de IA que uses (por ejemplo Claude, de Anthropic) recibe el contenido de la conversación. Ese tratamiento se rige por las condiciones y la política de privacidad de ese proveedor y por el tipo de cuenta que tengas. En caso de duda, consulta con la persona delegada de protección de datos del Departamento.

Para reducir aún más los datos que se comparten:

- Mantén activado el modo privado.
- No escribas en el chat nombres de alumnos ni datos de salud o familiares.
- En Claude, desactiva en **Ajustes → Privacidad** el uso de tus conversaciones para mejorar los modelos (*Ayudar a mejorar Claude*) y borra las conversaciones que ya no necesites.
- No uses la herramienta en un ordenador compartido: el navegador recuerda la sesión de Educa.
- Si abres un aviso en GitHub, **no incluyas nombres ni notas reales**.

## 4. Sin garantía

El software se ofrece **"tal cual", sin garantía de ningún tipo**, según la [licencia MIT](LICENSE). Educa puede cambiar su diseño en cualquier momento y hacer que la herramienta deje de funcionar o se comporte de forma inesperada. Los autores no se hacen responsables de calificaciones erróneas, pérdidas de datos ni de cualquier otro perjuicio derivado de su uso.

## 5. Contacto

Dudas, errores o propuestas: [github.com/vTanco/educa-navarra-mcp/issues](https://github.com/vTanco/educa-navarra-mcp/issues).
