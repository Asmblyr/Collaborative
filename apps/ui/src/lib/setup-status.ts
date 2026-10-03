export interface SetupStatus {
  needsSetup: boolean;
  configured: boolean;
}

export async function loadSetupStatus(): Promise<SetupStatus | null> {
  const coreUrl = process.env.CORE_URL ?? "http://127.0.0.1:3001";
  try {
    const response = await fetch(new URL("/auth/setup/status", coreUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    return (await response.json()) as SetupStatus;
  } catch {
    return null;
  }
}
