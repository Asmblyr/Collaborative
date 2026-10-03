// Never print the assertion, access token, environment or token response.
const base = process.env.ASMBLYR_CORE_URL;
const federationId = process.env.ASMBLYR_FEDERATION_ID;
const assertion = process.env.ASMBLYR_ID_TOKEN;
if (!base || !federationId || !assertion) throw new Error("Set ASMBLYR_CORE_URL; run with the GitLab CI ID token");
const endpoint = new URL(base);
if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)))) {
  throw new Error("Core must use HTTPS (HTTP is allowed only for a local runner)");
}
endpoint.pathname = endpoint.pathname.replace(/\/$/, "") + "/auth/federation-token";
const response = await fetch(endpoint, {
  method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ federationId, assertion }),
});
if (!response.ok) throw new Error("Federation exchange failed: HTTP " + response.status);
const grant = await response.json();
if (grant.tokenType !== "Bearer" || typeof grant.accessToken !== "string" ||
    !grant.accessToken.startsWith("asm_st_")) throw new Error("Unexpected token response");
endpoint.pathname = endpoint.pathname.replace(/\/auth\/federation-token$/, "/collections");
const resources = await fetch(endpoint, {
  redirect: "error", signal: AbortSignal.timeout(10000),
  headers: { authorization: "Bearer " + grant.accessToken },
});
if (!resources.ok) throw new Error("Resource request failed: HTTP " + resources.status);
const body = await resources.json();
if (!Array.isArray(body.data)) throw new Error("Unexpected collections response");
console.log("Federation OK; collections visible: " + body.data.length + "; token lifetime: " + grant.expiresIn + "s");
