import type { TermInput } from "@asmblyr-collaborative/contracts";
import { InputError, objectInput, textInput } from "../shared/input.js";

export function parseTermId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new InputError("Invalid term ID");
  }
  return value.toLowerCase();
}

export function parseTermIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 5)
    throw new InputError("Use up to 5 terms");
  const ids = value.map(parseTermId);
  if (new Set(ids).size !== ids.length) throw new InputError("Duplicate terms");
  return ids;
}

export function parseTermInput(value: unknown): TermInput {
  const body = objectInput(value, [
    "name",
    "description",
    "aliases",
    "enabled",
  ]);
  const name = textInput(body.name, 80);
  if (
    typeof body.description !== "string" ||
    !body.description.trim() ||
    body.description.length > 1000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.description)
  ) {
    throw new InputError("Определение должно содержать от 1 до 1000 символов");
  }
  const description = body.description.trim();
  if (
    !Array.isArray(body.aliases) ||
    body.aliases.length > 12 ||
    typeof body.enabled !== "boolean"
  ) {
    throw new InputError("Expected aliases (up to 12) and enabled flag");
  }
  const aliases = body.aliases.map((alias) => textInput(alias, 80));
  const words = [name, ...aliases].map((word) => word.toLocaleLowerCase("ru"));
  if (new Set(words).size !== words.length)
    throw new InputError("Название и синонимы не должны повторяться");
  return { name, description, aliases, enabled: body.enabled };
}
