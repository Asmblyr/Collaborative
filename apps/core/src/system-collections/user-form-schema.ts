import type { Knex } from "knex";
import type {
  SystemCollectionField,
  FieldPresentation,
} from "@asmblyr-collaborative/contracts";
import { customFields } from "./repository.js";
import { storedProfileDisplay } from "../auth/profile-display-config.js";
import { profileDisplaySchema } from "../auth/profile-display-schema.js";
import { InputError } from "../shared/input.js";
import { parseFieldPresentation } from "../collections/field-presentation-validation.js";

export const profileBaseFields: SystemCollectionField[] = [
  ["firstName", "Имя"],
  ["lastName", "Фамилия"],
  ["displayName", "Отображаемое имя"],
  ["email", "Электронная почта"],
  ["description", "О себе"],
].map(([name, label]) => ({
  name,
  type: name === "email" ? "email" : "text",
  managed: true,
  required: false,
  nullable: true,
  presentation: parseFieldPresentation(
    {
      label,
      constraints: { maxLength: name === "description" ? 2000 : 120 },
      ...(name === "description" ? { interface: "textarea" as const } : {}),
      width:
        name === "firstName" || name === "lastName"
          ? ("half" as const)
          : ("full" as const),
    },
    name === "email" ? "email" : "text",
  ) as FieldPresentation,
}));

export function displayFieldName(id: string): string {
  return `@display:${id}`;
}

export async function userFormFields(
  db: Knex,
): Promise<SystemCollectionField[]> {
  const custom = await customFields(db, "users");
  const config = await storedProfileDisplay(db);
  const projections: SystemCollectionField[] = [];
  if (config.entries.length) {
    const schema = await profileDisplaySchema(db);
    for (const entry of config.entries) {
      try {
        const binding = schema.resolve(entry.path);
        if (binding.signature !== entry.signature) {
          continue;
        }
        projections.push({
          name: displayFieldName(entry.id),
          type:
            binding.type === "user"
              ? "text"
              : binding.type === "tags"
                ? "json"
                : binding.type,
          managed: true,
          nullable: true,
          required: false,
          presentation: parseFieldPresentation(
            {
              label: entry.label || entry.path.at(-1) || entry.id,
              ...(binding.type === "tags" ? { interface: "tags" } : {}),
            },
            binding.type === "tags" ? "json" : "text",
          ) as FieldPresentation,
        });
      } catch (error) {
        if (!(error instanceof InputError)) {
          throw error;
        }
      }
    }
  }
  return [
    ...profileBaseFields,
    ...custom.map((field) => ({
      ...field.definition,
      type: field.definition.relation ? "relation" : field.definition.type,
      managed: false,
      presentation: field.presentation,
    })),
    ...projections,
  ];
}
