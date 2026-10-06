import type {
  CurrentUserResult,
  UserProfilePatch,
  UserProfileExtensionResult,
  UserPreferences,
} from "@asmblyr-collaborative/contracts";
import type { RequestOptions } from "./options.js";
import type { Transport } from "./transport.js";
import type {
  ReadRow,
  ProfileCreateRow,
  UpdateRow,
} from "./collection-schema.js";
import type { ReadableItem } from "./items.js";

type CollectionName<Schema> = Extract<keyof Schema, string>;

export interface UsersClient<Schema extends object> {
  me(request?: RequestOptions): Promise<CurrentUserResult>;
  updateMe(
    patch: UserProfilePatch,
    request?: RequestOptions,
  ): Promise<CurrentUserResult>;
  preferences(request?: RequestOptions): Promise<{ data: UserPreferences }>;
  updatePreferences(
    patch: Partial<UserPreferences>,
    request?: RequestOptions,
  ): Promise<{ data: UserPreferences }>;
  /** The collection must match the installation's selected profile extension. */
  extension<Name extends CollectionName<Schema>>(
    collection: Name,
    request?: RequestOptions,
  ): Promise<UserProfileExtensionResult<ReadableItem<ReadRow<Schema[Name]>>>>;
  saveExtension<Name extends CollectionName<Schema>>(
    collection: Name,
    values: ProfileCreateRow<Schema[Name]> | UpdateRow<Schema[Name]>,
    request?: RequestOptions,
  ): Promise<UserProfileExtensionResult<ReadableItem<ReadRow<Schema[Name]>>>>;
}

export function createUsersClient<Schema extends object>(
  transport: Transport,
): UsersClient<Schema> {
  async function verify<Result extends UserProfileExtensionResult>(
    result: Result,
    collection: string,
  ): Promise<Result> {
    if (result.data && result.data.collection !== collection) {
      throw new Error(
        "The selected profile extension differs from the generated client schema",
      );
    }
    return result;
  }
  return {
    me: (request) => transport.get("/users/me", undefined, request),
    updateMe: (patch, request) =>
      transport.write("PATCH", "/users/me", patch, request),
    preferences: (request) =>
      transport.get("/users/me/preferences", undefined, request),
    updatePreferences: (patch, request) =>
      transport.write("PATCH", "/users/me/preferences", patch, request),
    extension: async (collection, request) =>
      verify(
        await transport.get("/users/me/extension", undefined, request),
        collection,
      ),
    saveExtension: async (collection, values, request) =>
      verify(
        await transport.write(
          "PATCH",
          "/users/me/extension",
          { collection, values },
          request,
        ),
        collection,
      ),
  };
}
