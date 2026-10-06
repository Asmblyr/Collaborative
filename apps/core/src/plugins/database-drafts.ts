import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type { PluginPreparedAction } from "@asmblyr-collaborative/contracts";
import { ItemError } from "../items/validation.js";

/** User-scoped prepared forms remain usable after balancing or restarting Core. */
export class DatabaseActionDrafts {
  constructor(private readonly db: Knex) {}

  async create(
    owner: string,
    value: Omit<PluginPreparedAction, "draftId" | "expiresAt" | "href">,
  ): Promise<PluginPreparedAction> {
    return this.db.transaction(async (trx) => {
      await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [
        "asmblyr:action-drafts",
      ]);
      await trx("public.asmblyr_action_drafts")
        .where("expires_at", "<=", trx.fn.now())
        .delete();
      const [{ total, own }] = (
        await trx.raw(
          "SELECT count(*)::int AS total, count(*) FILTER (WHERE owner = ?)::int AS own FROM public.asmblyr_action_drafts",
          [owner],
        )
      ).rows;
      if (total >= 256 || own >= 32) {
        throw new ItemError(
          "Слишком много подготовленных форм. Повторите позже.",
          429,
        );
      }
      const draftId = randomUUID();
      const draft: PluginPreparedAction = {
        ...value,
        draftId,
        expiresAt: new Date(Date.now() + 20 * 60000).toISOString(),
        href: `/extensions/${value.namespace}/${value.pageId}?draft=${draftId}`,
      };
      await trx("public.asmblyr_action_drafts").insert({
        id: draftId,
        owner,
        namespace: value.namespace,
        expires_at: draft.expiresAt,
        value: JSON.stringify(draft),
      });
      return draft;
    });
  }

  async get(
    owner: string,
    namespace: string,
    id: string,
  ): Promise<PluginPreparedAction> {
    const row = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
      ? await this.db("public.asmblyr_action_drafts")
          .where({ id, owner, namespace })
          .where("expires_at", ">", this.db.fn.now())
          .first("value")
      : undefined;
    if (!row) {
      throw new ItemError(
        "Подготовленная форма недоступна или срок её хранения истёк.",
        404,
      );
    }
    return row.value;
  }
}
