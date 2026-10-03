export const presencePages: readonly [
  "/",
  "/files",
  "/search",
  "/settings",
  "/access",
  "/services",
  "/oauth-apps",
  "/system-settings",
  "/system-settings/users",
  "/system-settings/policies",
  "/system-settings/services",
  "/system-settings/assistant",
  "/system-settings/plugins",
  "/system-settings/terms",
  "/system-settings/oauth",
];
export type PresenceScope =
  | { kind: "page"; page: (typeof presencePages)[number] }
  | { kind: "collection"; collection: string }
  | { kind: "record"; collection: string; id: string };
export interface PresenceInput {
  clientId: string;
  scope: PresenceScope;
}
export interface PresenceParticipant {
  id: string;
  displayName: string;
  pictureUrl: string | null;
  /** Number of open views belonging to this person, including other tabs. */
  views: number;
  self: boolean;
}
export interface PresenceResult {
  data: { participants: PresenceParticipant[]; total: number };
}
