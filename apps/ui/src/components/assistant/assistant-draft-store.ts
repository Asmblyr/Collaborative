/** Unsent text belongs to a conversation and stays only in this widget's memory. */
export class AssistantDraftStore {
  private activeId: string | null = null;
  private readonly drafts = new Map<string | null, string>();

  get text(): string {
    return this.drafts.get(this.activeId) ?? "";
  }

  write(update: string | ((previous: string) => string)): string {
    const text = typeof update === "function" ? update(this.text) : update;
    if (text === "") {
      this.drafts.delete(this.activeId);
    } else {
      this.drafts.set(this.activeId, text);
    }
    return text;
  }

  select(id: string | null): string {
    if (id === this.activeId) {
      return this.text;
    }
    // Typing before the first session is loaded/created must survive binding its ID.
    if (this.activeId === null && id !== null && this.text !== "") {
      this.drafts.set(id, this.text);
      this.drafts.delete(null);
    }
    this.activeId = id;
    return this.text;
  }

  has(id: string): boolean {
    return Boolean(this.drafts.get(id)?.trim());
  }

  remove(id: string): string {
    this.drafts.delete(id);
    if (id === this.activeId) {
      this.activeId = null;
    }
    return this.text;
  }
}
