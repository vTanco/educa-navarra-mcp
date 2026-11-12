# Cómo publicar una versión

## Cada versión (automático)

1. Actualiza `CHANGELOG.md`.
2. Sube la versión y crea la etiqueta:
   ```bash
   npm version patch   # 1.0.0 -> 1.0.1 (minor para novedades, major para cambios incompatibles)
   git push --follow-tags
   ```
3. GitHub Actions (`.github/workflows/release.yml`) pasa las pruebas, crea la versión en GitHub con el fichero `educa-navarra-mcp.mcpb` adjunto y publica en npm.

El enlace de descarga del README (`releases/latest/download/educa-navarra-mcp.mcpb`) apunta siempre a la última versión.

## Una sola vez: conectar npm con GitHub

Para que GitHub publique en npm sin guardar contraseñas ni tokens:

1. Entra en [npmjs.com](https://www.npmjs.com) → paquete **educa-navarra-mcp** → **Settings** → **Trusted publishing**.
2. Elige **GitHub Actions** y rellena: organización o usuario `vTanco`, repositorio `educa-navarra-mcp`, workflow `release.yml`.
3. Guarda. Desde entonces, cada etiqueta `v*` publica sola.

npm solo deja configurar esto cuando el paquete ya existe, así que la **primera publicación** se hace a mano desde el ordenador de la persona mantenedora:

```bash
npm login          # abre el navegador
npm ci && npm run build && npm test
npm publish --access public
```

## Probar el paquete de Claude Desktop sin publicar

```bash
npm run build && npm run pack:mcpb
```

Genera `build/educa-navarra-mcp.mcpb`. Haz doble clic en él para instalarlo en tu Claude Desktop.
