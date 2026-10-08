// Swagger's operation names remain API identifiers. Localized prose comes from the spec.
export function swaggerPage(locale) {
  const ru = locale === "ru";
  const assets = ru ? "../../api/" : "./";
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Collaborative HTTP API</title>
    <link rel="stylesheet" href="${assets}swagger-ui.css" />
    <style>body { margin: 0; } nav { padding: 16px 24px; font: 14px system-ui; background: #fafafa; border-bottom: 1px solid #ddd; } nav a { margin-right: 20px; color: #1b2930; }</style>
  </head>
  <body>
    <nav aria-label="${ru ? "Навигация" : "Navigation"}">
      <a href="../reference/http.html">${ru ? "Документация" : "Documentation"}</a>
      <a href="${ru ? "../../api/index.html" : "../ru/api/index.html"}" lang="${ru ? "en" : "ru"}">${ru ? "English" : "Русский"}</a>
      <a href="../openapi.json">OpenAPI JSON</a>
    </nav>
    <div id="swagger-ui"></div>
    <script src="${assets}swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: "../openapi.json", dom_id: "#swagger-ui", validatorUrl: null,
        supportedSubmitMethods: [], persistAuthorization: false,
        defaultModelsExpandDepth: 0,
      });
    </script>
  </body>
</html>
`;
}
