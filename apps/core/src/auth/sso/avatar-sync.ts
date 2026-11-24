import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { deleteFile, uploadFile } from "../../files/service.js";
import type { FileStorage } from "../../files/storage/types.js";
import {
  resolveRuntime,
  type RuntimeSource,
} from "../../shared/runtime-source.js";
import type { SsoProvider } from "./config.js";
import {
  AVATAR_FETCH_TIMEOUT_MS,
  fetchSsoAvatar,
  validateHttpsAvatarUrl,
  type AvatarFetchOptions,
  type AvatarMimeType,
  type DownloadedAvatar,
} from "./avatar-fetch.js";

interface UserAvatarRow {
  avatar_id: string | null;
  picture_url: string | null;
}

interface SsoAvatarRow {
  user_id: string;
  file_id: string | null;
  provider: string;
  source_url: string | null;
  source_sha256: string | null;
}

export type AvatarFetcher = (
  rawPicture: string,
  options: AvatarFetchOptions,
) => Promise<DownloadedAvatar>;

export interface SyncSsoAvatarOptions {
  db: Knex;
  provider: SsoProvider;
  userId: string;
  picture: string | null;
  accessToken?: string;
  storage?: RuntimeSource<FileStorage>;
  requestId?: string;
  fetcher?: AvatarFetcher;
  timeoutMs?: number;
  onError?: (providerId: string, reason: string) => void;
}

const AVATAR_SYNC_TIMEOUT_MS = 3000;

function avatarFilename(mimeType: AvatarMimeType): string {
  if (mimeType === "image/png") {
    return "sso-avatar.png";
  }
  if (mimeType === "image/webp") {
    return "sso-avatar.webp";
  }
  return "sso-avatar.jpg";
}

function trustedTokenOrigins(provider: SsoProvider): Set<string> {
  const origins = new Set<string>();
  if (!provider.avatarSendToken) {
    return origins;
  }

  try {
    origins.add(new URL(provider.issuer).origin);
  } catch {
    // Ignore unparseable issuer
  }
  if (provider.driver === "oauth2") {
    try {
      origins.add(new URL(provider.profileUrl).origin);
    } catch {
      // Ignore unparseable profile URL
    }
  }
  return origins;
}

async function resolveStorage(
  source: RuntimeSource<FileStorage> | undefined,
  db: Knex,
): Promise<FileStorage | null> {
  if (!source) {
    return null;
  }
  if (typeof source === "function") {
    return (source as (database?: Knex) => Promise<FileStorage | null>)(db);
  }
  return resolveRuntime(source);
}

async function applyFallbackPictureUrl(
  db: Knex,
  provider: SsoProvider,
  userId: string,
  picture: string,
): Promise<void> {
  const validUrl = validateHttpsAvatarUrl(picture);
  if (!validUrl) {
    return;
  }
  const href = validUrl.href;

  await db.transaction(async (trx) => {
    const user = await trx("public.asmblyr_users")
      .where({ id: userId })
      .forUpdate()
      .first<UserAvatarRow>("avatar_id", "picture_url");
    if (!user || user.avatar_id !== null) {
      return;
    }

    const tracked = await trx("public.asmblyr_sso_avatars")
      .where({ user_id: userId })
      .first<SsoAvatarRow>();

    if (provider.avatarSync === "if_empty") {
      if (user.picture_url) {
        return;
      }
    } else if (user.picture_url) {
      const managedBySso =
        tracked?.file_id === null && tracked.source_url === user.picture_url;
      if (!managedBySso || user.picture_url === href) {
        return;
      }
    }

    await trx("public.asmblyr_users")
      .where({ id: userId })
      .update({ picture_url: href, updated_at: trx.fn.now() });
    await trx("public.asmblyr_sso_avatars")
      .insert({
        user_id: userId,
        file_id: null,
        provider: provider.id,
        source_url: href,
        source_sha256: null,
        updated_at: trx.fn.now(),
      })
      .onConflict("user_id")
      .merge({
        file_id: null,
        provider: provider.id,
        source_url: href,
        source_sha256: null,
        updated_at: trx.fn.now(),
      });
  });
}

function hasManualAvatarSetting(
  user: UserAvatarRow,
  tracked: SsoAvatarRow | undefined,
): boolean {
  if (user.avatar_id !== null) {
    return user.avatar_id !== tracked?.file_id;
  }
  return (
    Boolean(user.picture_url) &&
    !(tracked?.file_id === null && tracked.source_url === user.picture_url)
  );
}

async function performAvatarSync(options: SyncSsoAvatarOptions): Promise<void> {
  const { db, provider, userId, picture } = options;
  if (provider.avatarSync === "off" || !picture) {
    return;
  }

  const [user, tracked] = await Promise.all([
    db("public.asmblyr_users")
      .where({ id: userId })
      .first<UserAvatarRow>("avatar_id", "picture_url"),
    db("public.asmblyr_sso_avatars")
      .where({ user_id: userId })
      .first<SsoAvatarRow>(),
  ]);
  if (!user || hasManualAvatarSetting(user, tracked)) {
    return;
  }
  if (provider.avatarSync === "if_empty" && user.avatar_id !== null) {
    return;
  }

  const storage = await resolveStorage(options.storage, db);
  if (!storage) {
    if (provider.avatarFallbackUrl) {
      await applyFallbackPictureUrl(db, provider, userId, picture);
    }
    return;
  }

  const validatedUrl = picture.startsWith("data:")
    ? null
    : validateHttpsAvatarUrl(picture);
  if (
    validatedUrl &&
    user.avatar_id !== null &&
    user.avatar_id === tracked?.file_id &&
    tracked.provider === provider.id &&
    tracked.source_url === validatedUrl.href
  ) {
    return;
  }

  const fetcher = options.fetcher ?? fetchSsoAvatar;
  const downloaded = await fetcher(picture, {
    accessToken: provider.avatarSendToken ? options.accessToken : undefined,
    trustedTokenOrigins: trustedTokenOrigins(provider),
    timeoutMs: options.timeoutMs ?? AVATAR_FETCH_TIMEOUT_MS,
  });

  if (
    user.avatar_id !== null &&
    user.avatar_id === tracked?.file_id &&
    tracked.source_sha256 === downloaded.sha256
  ) {
    await db("public.asmblyr_sso_avatars").where({ user_id: userId }).update({
      provider: provider.id,
      source_url: downloaded.sourceUrl,
      updated_at: db.fn.now(),
    });
    return;
  }

  const actor = { id: userId, requestId: options.requestId ?? randomUUID() };
  const uploaded = await uploadFile(
    db,
    options.storage!,
    downloaded.content,
    {
      filename: avatarFilename(downloaded.mimeType),
      mimeType: downloaded.mimeType,
    },
    actor,
  );

  let cleanupFileId: string | null = null;
  await db.transaction(async (trx) => {
    const currentUser = await trx("public.asmblyr_users")
      .where({ id: userId })
      .forUpdate()
      .first<UserAvatarRow>("avatar_id", "picture_url");
    if (!currentUser) {
      cleanupFileId = uploaded.id;
      return;
    }

    const currentTracked = await trx("public.asmblyr_sso_avatars")
      .where({ user_id: userId })
      .first<SsoAvatarRow>();

    if (
      hasManualAvatarSetting(currentUser, currentTracked) ||
      (provider.avatarSync === "if_empty" && currentUser.avatar_id !== null)
    ) {
      cleanupFileId = uploaded.id;
      return;
    }

    if (
      currentTracked?.file_id &&
      currentTracked.file_id === currentUser.avatar_id
    ) {
      cleanupFileId = currentTracked.file_id;
    }

    const clearFallbackUrl =
      currentTracked?.file_id === null &&
      currentTracked.source_url === currentUser.picture_url;
    await trx("public.asmblyr_users")
      .where({ id: userId })
      .update({
        avatar_id: uploaded.id,
        ...(clearFallbackUrl ? { picture_url: null } : {}),
        updated_at: trx.fn.now(),
      });
    await trx("public.asmblyr_sso_avatars")
      .insert({
        user_id: userId,
        file_id: uploaded.id,
        provider: provider.id,
        source_url: downloaded.sourceUrl,
        source_sha256: downloaded.sha256,
        updated_at: trx.fn.now(),
      })
      .onConflict("user_id")
      .merge({
        file_id: uploaded.id,
        provider: provider.id,
        source_url: downloaded.sourceUrl,
        source_sha256: downloaded.sha256,
        updated_at: trx.fn.now(),
      });
  });

  if (cleanupFileId) {
    try {
      await deleteFile(db, options.storage!, cleanupFileId, actor);
    } catch {
      // Best-effort cleanup of replaced or superseded avatar file
    }
  }
}

export async function syncSsoAvatar(
  options: SyncSsoAvatarOptions,
): Promise<void> {
  if (options.provider.avatarSync === "off" || !options.picture) {
    return;
  }

  const deadlineMs = options.timeoutMs ?? AVATAR_SYNC_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("SSO avatar sync timed out")),
      deadlineMs,
    );
  });

  const syncPromise = performAvatarSync(options);
  syncPromise.catch(() => {
    // Prevent unhandled rejection if the outer deadline wins Promise.race
  });

  try {
    await Promise.race([syncPromise, timeout]);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "SSO avatar sync failed";
    options.onError?.(options.provider.id, reason);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
