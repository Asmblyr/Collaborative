import type { Knex } from "knex";
import { authenticateAccess, type AuthenticatedUser } from "./tokens.js";
import {
  authenticateService,
  type AuthenticatedService,
} from "../services/tokens.js";

export type Principal =
  | ({ kind: "user" } & AuthenticatedUser)
  | AuthenticatedService;

export async function authenticatePrincipal(
  db: Knex,
  authorization?: string,
): Promise<Principal> {
  if (/^Bearer asm_st_/i.test(authorization ?? ""))
    return authenticateService(db, authorization!);
  return { kind: "user", ...(await authenticateAccess(db, authorization)) };
}
