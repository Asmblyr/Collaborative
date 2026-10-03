import type { Knex } from "knex";
import { grantFor, type Access } from "../permissions/access.js";
import { objectInput } from "../shared/input.js";
import { ItemError } from "../items/validation.js";

interface CatalogQuery {
  q: string;
  page: number;
  limit: number;
}
interface CollectionSummary {
  name: string;
  displayName: string | null;
  description: string | null;
}

function parseCatalogQuery(args: unknown): CatalogQuery {
  const body = objectInput(args, ["q", "page", "limit"]);
  const q = body.q === null ? "" : body.q;
  if (
    typeof q !== "string" ||
    q.length > 100 ||
    typeof body.page !== "number" ||
    !Number.isInteger(body.page) ||
    body.page < 1 ||
    body.page > 50 ||
    typeof body.limit !== "number" ||
    !Number.isInteger(body.limit) ||
    body.limit < 1 ||
    body.limit > 20
  ) {
    throw new ItemError("Invalid collection query", 400);
  }
  return { q: q.trim(), page: body.page, limit: body.limit };
}

export async function discoverCollections(
  db: Knex,
  access: Access,
  args: unknown,
) {
  const input = parseCatalogQuery(args);
  const query = db("asmblyr_collections")
    .withSchema("public")
    .select<
      CollectionSummary[]
    >("name", { displayName: "display_name", description: "mcp_description" })
    .where("mcp_enabled", true)
    .whereRaw("left(name, 8) <> ?", ["asmblyr_"]);

  if (!access.principal.superuser) {
    const readable = [...access.grants.keys()]
      .filter((key) => key.endsWith(":read"))
      .map((key) => key.slice(0, -5))
      .filter((name) => grantFor(access, name, "read") !== null);
    query.whereIn("name", readable);
  }
  if (input.q) {
    // strpos treats %, _ and backslashes literally, without wildcard expansion.
    query.whereRaw(
      "strpos(lower(name || ' ' || coalesce(display_name, '')), lower(?)) > 0",
      [input.q],
    );
  }
  const rows = await query
    .orderBy("name")
    .limit(input.limit + 1)
    .offset((input.page - 1) * input.limit);
  return {
    collections: rows
      .slice(0, input.limit)
      .map((row) => ({ ...row, displayName: row.displayName ?? row.name })),
    page: input.page,
    size: input.limit,
    hasMore: rows.length > input.limit,
    pageLimit: 50,
  };
}
