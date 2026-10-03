export const COMMENT_MAX_LENGTH = 10_000;
export const COMMENTS_PAGE_SIZE = 30;

export interface CommentTarget {
  collection: string;
  item: string;
}

export interface CommentInput {
  body: string;
}

export interface Comment {
  id: string;
  body: string;
  author: { id: string; kind: "user" | "service"; name: string | null } | null;
  createdAt: string;
  updatedAt: string;
  isOwn: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface CommentPage {
  data: Comment[];
  page: { number: number; size: number; total: string };
  canCreate: boolean;
  maxLength: number;
}

export function supportsComments(collection: string): boolean {
  return (
    !collection.startsWith("asmblyr_") && !collection.startsWith("plugin_")
  );
}
