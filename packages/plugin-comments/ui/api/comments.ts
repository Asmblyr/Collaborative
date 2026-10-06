import type { PluginRequest } from "@asmblyr-collaborative/kit/ui";
import type {
  Comment,
  CommentPage,
  CommentTarget,
} from "../../shared/comments.js";

export function createCommentsClient(
  request: PluginRequest,
  target: CommentTarget,
) {
  const base = `/${encodeURIComponent(target.collection)}/${encodeURIComponent(target.item)}`;
  const path = (id: string) => `${base}/${encodeURIComponent(id)}`;

  function body(text: string): RequestInit {
    return {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text }),
    };
  }

  return {
    async get(id: string, signal: AbortSignal): Promise<Comment> {
      return (await request<{ data: Comment }>(path(id), { signal })).data;
    },
    following(signal: AbortSignal): Promise<{ enabled: boolean }> {
      return request(`${base}/subscription`, { signal });
    },
    follow(enabled: boolean): Promise<{ enabled: boolean }> {
      return request(`${base}/subscription`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    },
    list(page: number, signal: AbortSignal): Promise<CommentPage> {
      return request(`${base}?page=${page}`, { signal });
    },
    async create(text: string): Promise<Comment> {
      const result = await request<{ data: Comment }>(base, {
        method: "POST",
        ...body(text),
      });
      return result.data;
    },
    async update(id: string, text: string): Promise<Comment> {
      const result = await request<{ data: Comment }>(path(id), {
        method: "PATCH",
        ...body(text),
      });
      return result.data;
    },
    delete(id: string): Promise<void> {
      return request(path(id), { method: "DELETE" });
    },
  };
}
