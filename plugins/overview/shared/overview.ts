export interface Overview {
  viewer: {
    id: string;
    kind: "user" | "service";
    displayName: string | null;
  };
  checkedAt: string;
}
