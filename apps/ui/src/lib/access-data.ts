import type { AccessUser, Permission, Policy } from "@/components/access/types";
import { coreAddress } from "./session";

export interface AccessData {
  users: AccessUser[];
  policies: Policy[];
  permissions: Permission[];
}

export async function loadResource<T>(
  path: string,
  token: string,
): Promise<T[]> {
  const response = await fetch(coreAddress(path), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error("Core API недоступен");
  }
  const result = (await response.json()) as { data: T[] };
  return result.data;
}

export async function loadAccessData(
  token: string,
  section: "users" | "policies" = "policies",
): Promise<{
  data: AccessData;
  error: string;
}> {
  try {
    const [users, policies, permissions] = await Promise.all([
      loadResource<AccessUser>("/users", token),
      loadResource<Policy>(
        section === "users" ? "/settings/options/policies" : "/policies",
        token,
      ),
      section === "policies"
        ? loadResource<Permission>("/permissions", token)
        : Promise.resolve([]),
    ]);
    return { data: { users, policies, permissions }, error: "" };
  } catch {
    return {
      data: { users: [], policies: [], permissions: [] },
      error: "Core API недоступен",
    };
  }
}
