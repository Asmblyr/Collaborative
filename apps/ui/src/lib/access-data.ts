import type { AccessUser, Permission, Policy } from "@/components/access/types";
import { readCoreResource } from "./core-resource";
import { requestErrorMessage } from "./http-request";

export interface AccessData {
  users: AccessUser[];
  policies: Policy[];
  permissions: Permission[];
}

export async function loadResource<T>(
  path: string,
  token: string,
): Promise<T[]> {
  return readCoreResource<T[]>(token, path, 10000);
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
  } catch (cause) {
    return {
      data: { users: [], policies: [], permissions: [] },
      error: requestErrorMessage(cause),
    };
  }
}
