import type { Knex } from "knex";
import type {
  UserFormConfiguration,
  UserFieldSelfAccess,
} from "@asmblyr-collaborative/contracts";
import { parseFormLayout, reconcileForm } from "../collections/form-layout.js";
import { objectInput, InputError } from "../shared/input.js";
import { lockSystemCollection } from "./repository.js";
import { userFormFields, profileBaseFields } from "./user-form-schema.js";
import { securityEvent } from "../auth/security-events.js";

export async function readUserFormConfiguration(
  db: Knex,
): Promise<UserFormConfiguration> {
  const fields = await userFormFields(db);
  const row = await db("public.asmblyr_user_form").where({ id: 1 }).first();
  const names = configurableOwnerFields(fields);
  return {
    fields,
    layout: reconcileForm(
      row.layout,
      fields.map((field) => field.name),
    ),
    selfAccess: Object.fromEntries(
      Object.entries(
        row.self_access as Record<string, UserFieldSelfAccess>,
      ).filter(([name]) => names.includes(name)),
    ),
  };
}

export async function saveUserFormConfiguration(
  db: Knex,
  body: unknown,
  actorId: string,
): Promise<UserFormConfiguration> {
  const input = objectInput(body, ["layout", "selfAccess"]);
  return db.transaction(async (trx) => {
    await lockSystemCollection(trx, "users", "ACCESS SHARE");
    await trx("public.asmblyr_user_form").where({ id: 1 }).forUpdate().first();
    const fields = await userFormFields(trx);
    const names = configurableOwnerFields(fields);
    const access = objectInput(input.selfAccess, names);
    if (
      Object.values(access).some(
        (value) => value !== "read" && value !== "write",
      )
    ) {
      throw new InputError("Invalid owner field access");
    }
    const layout = parseFormLayout(input.layout, fields);
    await trx("public.asmblyr_user_form")
      .where({ id: 1 })
      .update({
        layout: layout === null ? null : JSON.stringify(layout),
        self_access: JSON.stringify(access),
      });
    await securityEvent(trx, actorId, "users.form_configured", actorId, {
      selfAccess: access,
    });
    return readUserFormConfiguration(trx);
  });
}

function configurableOwnerFields(
  fields: UserFormConfiguration["fields"],
): string[] {
  return [
    ...fields.filter((field) => !field.managed).map((field) => field.name),
    ...profileBaseFields
      .filter((field) => field.name !== "email")
      .map((field) => field.name),
  ];
}
