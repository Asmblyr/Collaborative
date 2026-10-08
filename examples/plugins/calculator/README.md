# Calculator

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

One action shared by a form, internal MCP, and the assistant. [Enable the example](../README.md) first; it is disabled by default. Page: http://localhost:3000/extensions/calculator/home.

- Shared/calculation.ts defines input/output types, labels, and JSDoc constraints.
- Server/api/calculator/calculate.post.ts is an H3 handler using integer minor-unit arithmetic. File routing determines URL/method. DefineModelContext and defineModelAnnotation explicitly expose it to MCP. ReadOnly:true blocks writes.
- `plugin.ts` is definePlugin({}), without handler registration.
- Ui/pages/calculator-page.tsx uses shadcn and useAction.

HTTP: POST /calculator/calculate, or /api/calculator/calculate from UI. HTTP/MCP share the handler. The builder creates .asmblyr/models/calculator/calculate.post.json for Core/UI input/output validation. Generated files stay out of Git.

Run pnpm dev at the root. Core needs local PostgreSQL for sessions; Calculator has no tables. Restart UI after enabling the package.

```text
Calculate the price for 150 users over 12 months at 990 rubles per user
per month with a 10% discount. Open the calculator.
```

Result: 1,603,800 ₽. The assistant prepares a private form for twenty minutes. Click Open page to navigate; manual values can then be recalculated. PostgreSQL snapshots survive Core restarts until expiry. Supply every parameter: the assistant must not invent prices or discounts.

See [action contracts and limits](../../../docs/development/plugin-actions.md).
