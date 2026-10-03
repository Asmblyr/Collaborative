/** Public /users/me response, independent of the database's user row. */
export interface CurrentUser {
  id: string;
  email: string;
  superuser: boolean;
  displayName: string | null;
  pictureUrl: string | null;
  hasPassword: boolean;
  createdAt: string;
}

export interface CurrentUserResult {
  data: CurrentUser;
}
