import { coreAddress } from "./session";
import type { LoginProvider } from "./sso";

export async function loadLoginProviders(): Promise<LoginProvider[]> {
  try {
    const response = await fetch(coreAddress("/auth/providers"), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    return ((await response.json()) as { data: LoginProvider[] }).data;
  } catch {
    return [];
  }
}
