<a id="http-api-и-openapi"></a>

# HTTP API and OpenAPI

The public API at `http://localhost:3000/api` is served directly by Core. Standalone Core at `http://localhost:3001` supports the same routes with or without /api. Plugin routes use /api/&lt;namespace&gt;/… on the common domain. Browsers use HttpOnly sessions; SDK/external applications use Bearer tokens.

- <a href="/api/index.html" target="_blank" rel="noopener">Open interactive reference</a>
- [Download OpenAPI 3.1 JSON](/openapi.json)
- [Route/access matrix](./routes.md)
- [HTTP SDK](./sdk-guide.md)

Start with [client setup](./sdk-guide.md#connect-a-client), [filters/pagination](./sdk-guide.md#available-methods), [relationship saves](./sdk-guide.md#writes-and-relationships), and [errors](./sdk-guide.md#errors-and-cancellation). See [data](../features/data.md) for collection/search limits and [access matrix](../security/access-matrix.md) for authorization.

The reference runs without a CDN. Request execution, external Swagger validation, and authorization persistence are disabled so browsing documentation does not mutate data.

<a id="полнота"></a>

## Coverage

All static Core REST routes are listed. Key items/auth/settings operations include JSON contracts; others are explicitly x-contract-level:route-only, documenting method, path, path parameters, access, and source file without claiming full body/response schemas. Do not generate a complete SDK from this incomplete specification.

ALL /oauth/\* is under x-delegated-routes. OIDC discovery supplies actual protocol endpoints. Dynamic plugin routes come from files/build indexes and are not automatically included in static Core OpenAPI.

<a id="авторизация-и-ошибки"></a>

## Authentication and errors

Use Authorization: Bearer &lt;accessToken&gt;. Core access tokens are opaque; external-application OAuth tokens do not work here. Settings require a human and the relevant section grant. The Bearer security scheme describes transport, not sufficient permissions.

Typical statuses: 400 invalid input, 401 unauthenticated, 403 denied, 404 missing/not disclosed, 409 conflict, 429 rate limit, and 503 dependency unavailable. Response envelopes vary: auth token pairs are direct; items/users usually use data.

Core errors use { code, message, details, requestId }. Details is currently empty and excludes protected values/internal errors. Preserve requestId for diagnostics. Infrastructure may return a different error if Core is unreachable.

Collection schemas are dynamic. Successful create/update may return data:null without read grants. Large IDs/totals remain strings. SDK documentation describes the client contract.
