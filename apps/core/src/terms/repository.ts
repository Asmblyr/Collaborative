import type { Knex } from "knex";
import type {
  TermDefinition,
  TermInput,
} from "@asmblyr-collaborative/contracts";
import { ItemError } from "../items/validation.js";
import { postgresCode } from "../shared/postgres-error.js";

const columns = ["id", "name", "description", "aliases", "enabled", "builtin"];

export async function listTerms(db: Knex): Promise<TermDefinition[]> {
  return db("asmblyr_terms")
    .withSchema("public")
    .select(columns)
    .orderBy("name");
}

export async function saveTerm(
  db: Knex,
  input: TermInput,
  id?: string,
): Promise<TermDefinition> {
  try {
    return await db.transaction(async (trx) => {
      // Serialises the global size bound and overlapping vocabulary checks.
      await trx.raw(
        "LOCK TABLE public.asmblyr_terms IN SHARE ROW EXCLUSIVE MODE",
      );
      const terms = await listTerms(trx);
      if (id && !terms.some((term) => term.id === id))
        throw new ItemError("Term not found", 404);
      if (!id && terms.length >= 100)
        throw new ItemError("Можно создать до 100 терминов", 409);
      const words = new Set(
        [input.name, ...input.aliases].map((word) =>
          word.toLocaleLowerCase("ru"),
        ),
      );
      const overlap = terms.some(
        (term) =>
          term.id !== id &&
          term.enabled &&
          input.enabled &&
          [term.name, ...term.aliases].some((word) =>
            words.has(word.toLocaleLowerCase("ru")),
          ),
      );
      if (overlap)
        throw new ItemError(
          "Название или синоним уже используется другим включённым термином",
          409,
        );
      const values = {
        ...input,
        aliases: JSON.stringify(input.aliases),
        updated_at: trx.fn.now(),
      };
      const query = trx("asmblyr_terms").withSchema("public");
      const [row] = await (
        id ? query.where({ id }).update(values) : query.insert(values)
      ).returning<TermDefinition[]>(columns);
      return row!;
    });
  } catch (error) {
    if (postgresCode(error) === "23505")
      throw new ItemError("Термин с таким названием уже существует", 409);
    throw error;
  }
}

export interface BoundTerm extends TermDefinition {
  filter: object;
}

export async function boundTerms(
  db: Knex,
  collectionId: string,
): Promise<BoundTerm[]> {
  return db("asmblyr_collection_terms as binding")
    .withSchema("public")
    .join("asmblyr_terms as term", "term.id", "binding.term_id")
    .where("binding.collection_id", collectionId)
    .select(...columns.map((column) => `term.${column}`), "binding.filter")
    .orderBy("term.name");
}

export async function writeBinding(
  db: Knex,
  collectionId: string,
  termId: string,
  filter: object,
): Promise<void> {
  await db("asmblyr_collection_terms")
    .withSchema("public")
    .insert({
      collection_id: collectionId,
      term_id: termId,
      filter: JSON.stringify(filter),
    })
    .onConflict(["collection_id", "term_id"])
    .merge({ filter: JSON.stringify(filter), updated_at: db.fn.now() });
}
