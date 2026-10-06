/** Public /users/me response, independent of the database's user row. */
export interface CurrentUser {
  id: string;
  email: string;
  superuser: boolean;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  description: string | null;
  avatarId: string | null;
  pictureUrl: string | null;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
}

/** Partial own-profile update. Account identity and access are never writable here. */
export interface UserProfilePatch {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  description?: string | null;
  pictureUrl?: string | null;
  avatarId?: string | null;
}

/** Extended fields live in an ordinary, permission-scoped collection. */
export interface UserProfileExtension<Row = Record<string, unknown>> {
  collection: string;
  userId: string;
  exists: boolean;
  data: Row | null;
}

export interface UserProfileExtensionResult<Row = Record<string, unknown>> {
  data: UserProfileExtension<Row> | null;
}

export interface CurrentUserResult {
  data: CurrentUser;
}
