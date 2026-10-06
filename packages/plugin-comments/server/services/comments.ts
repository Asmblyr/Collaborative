import {
  EndpointError,
  useStorage,
  useSettings,
  type AsmblyrContext,
  type CollectionStorage,
} from "@asmblyr-collaborative/kit";
import {
  COMMENTS_PAGE_SIZE,
  type Comment,
  type CommentInput,
  type CommentPage,
  type CommentTarget,
} from "../../shared/comments.js";
import entries from "../collections/entries.js";
import { presentComment } from "../presenters/comment.js";
import settings from "../settings.js";

/** One instance per authenticated request. The target's reader may participate in its discussion. */
export class CommentsService {
  private readonly entries: CollectionStorage<typeof entries>;

  constructor(private readonly context: AsmblyrContext) {
    this.entries = useStorage(context, entries);
  }

  async list(target: CommentTarget, page: number): Promise<CommentPage> {
    target = await this.readableTarget(target);
    const options = useSettings(this.context, settings);
    const result = await this.entries.list({
      page,
      limit: COMMENTS_PAGE_SIZE,
      sort: "created_at",
      direction: "desc",
      filter: {
        logic: "and",
        children: [
          { field: "collection", op: "eq", value: target.collection },
          { field: "item", op: "eq", value: target.item },
        ],
      },
    });
    return {
      data: result.data.map((row) => presentComment(row, this.context.actor)),
      page: result.page,
      canCreate: options.allowNewComments,
      maxLength: options.maxLength,
    };
  }

  async create(target: CommentTarget, input: CommentInput): Promise<Comment> {
    return this.withTarget(target, async (service, canonical) => {
      const options = service.validateInput(input);
      if (!options.allowNewComments) {
        throw new EndpointError(
          403,
          "COMMENTS_DISABLED",
          "Новые комментарии отключены администратором",
        );
      }
      const { actor } = service.context;
      const row = await service.entries.create({
        ...canonical,
        body: input.body,
        author_id: actor.id,
        author_kind: actor.kind,
        author_name: actor.displayName ?? null,
      });
      await service.notifications().publish({
        ...canonical,
        eventId: row.id,
        panelId: "discussion",
        targetId: row.id,
        preview: input.body.trim().slice(0, 300),
      });
      return presentComment(row, actor);
    });
  }

  async update(
    target: CommentTarget,
    id: string,
    input: CommentInput,
  ): Promise<Comment> {
    return this.withTarget(target, async (service, canonical) => {
      service.validateInput(input);
      await service.requireOwnComment(canonical, id);
      const row = await service.entries.update(id, { body: input.body });
      await service.notifications().update(id, input.body.trim().slice(0, 300));
      return presentComment(row, service.context.actor);
    });
  }

  async delete(target: CommentTarget, id: string): Promise<void> {
    await this.withTarget(target, async (service, canonical) => {
      await service.requireOwnComment(canonical, id);
      await service.entries.delete(id);
      await service.notifications().remove(id);
    });
  }

  async get(target: CommentTarget, id: string): Promise<Comment> {
    const canonical = await this.readableTarget(target);
    return presentComment(
      await this.commentAt(canonical, id),
      this.context.actor,
    );
  }

  async following(target: CommentTarget): Promise<{ enabled: boolean }> {
    const canonical = await this.readableTarget(target);
    return { enabled: await this.notifications().following(canonical) };
  }

  async follow(target: CommentTarget, enabled: boolean): Promise<void> {
    await this.withTarget(target, async (service, canonical) => {
      await service.notifications().follow(canonical, enabled);
    });
  }

  private notifications() {
    if (!this.context.notifications) {
      throw new EndpointError(
        403,
        "PLUGIN_CAPABILITY_DENIED",
        "Notifications capability is unavailable",
      );
    }
    return this.context.notifications;
  }

  private validateInput(input: CommentInput) {
    const options = useSettings(this.context, settings);
    if (!input.body.trim() || input.body.length > options.maxLength) {
      throw new EndpointError(
        400,
        "INVALID_COMMENT",
        `Комментарий должен содержать от 1 до ${options.maxLength} символов`,
      );
    }
    return options;
  }

  private async readableTarget(target: CommentTarget): Promise<CommentTarget> {
    const { data } = await this.context.items.get(
      target.collection,
      target.item,
      { fields: [] },
    );
    // fields: [] returns the primary key only; normalize UUID casing through the database.
    return {
      collection: target.collection,
      item: String(Object.values(data)[0]),
    };
  }

  private async withTarget<T>(
    target: CommentTarget,
    run: (service: CommentsService, canonical: CommentTarget) => Promise<T>,
  ): Promise<T> {
    if (!this.context.withRecord) {
      throw new Error("Record transaction capability is unavailable");
    }
    return this.context.withRecord(
      target.collection,
      target.item,
      async (context) => {
        const service = new CommentsService(context);
        return run(service, await service.readableTarget(target));
      },
    );
  }

  private async requireOwnComment(
    target: CommentTarget,
    id: string,
  ): Promise<void> {
    const row = await this.commentAt(target, id);

    const { actor } = this.context;
    if (row.author_id !== actor.id || row.author_kind !== actor.kind) {
      throw new EndpointError(
        403,
        "COMMENT_FORBIDDEN",
        "Можно изменять только свои комментарии",
      );
    }
  }

  private async commentAt(target: CommentTarget, id: string) {
    const row = await this.entries.get(id);
    if (row.collection !== target.collection || row.item !== target.item) {
      throw new EndpointError(
        404,
        "COMMENT_NOT_FOUND",
        "Комментарий не найден",
      );
    }

    return row;
  }
}
