// Protocol requests must never forward the main Asmblyr session to an OAuth client.
export function oauthCookies(value: string): string {
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => /^asmblyr_oidc_(session|interaction|resume)(\.sig)?=/.test(entry))
    .join("; ");
}
