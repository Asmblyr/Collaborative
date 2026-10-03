export interface PasskeyConfig {
  rpId: string;
  origin: string;
  rpName: string;
}

export function passkeysFromEnv(env: NodeJS.ProcessEnv): PasskeyConfig {
  const origin = new URL(env.AUTH_UI_URL ?? "http://localhost:3000");
  if (
    origin.protocol !== "https:" &&
    !(origin.protocol === "http:" && origin.hostname === "localhost")
  ) {
    throw new Error("Passkeys require HTTPS or localhost");
  }
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("AUTH_UI_URL must be an exact UI origin");
  }
  const rpId = env.PASSKEY_RP_ID ?? origin.hostname;
  if (rpId !== origin.hostname) {
    throw new Error("PASSKEY_RP_ID must match the UI hostname");
  }
  if (env.NODE_ENV === "production" && !env.AUTH_UI_URL) {
    throw new Error("AUTH_UI_URL is required in production");
  }
  return { rpId, origin: origin.origin, rpName: "Asmblyr" };
}
