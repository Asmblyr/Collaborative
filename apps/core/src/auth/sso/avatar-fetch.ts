import { createHash } from "node:crypto";
import type { LookupAddress } from "node:dns";
import { lookup as dnsLookupDefault } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import {
  MAX_AVATAR_BYTES,
  avatarRasterType,
  decodeDataUriAvatar,
  isBlockedIp,
  validateHttpsAvatarUrl,
  type AvatarMimeType,
  type DownloadedAvatar,
} from "./avatar-validation.js";

export {
  MAX_AVATAR_BYTES,
  avatarRasterType,
  decodeDataUriAvatar,
  isBlockedIp,
  validateHttpsAvatarUrl,
  type AvatarMimeType,
  type DownloadedAvatar,
};

export const AVATAR_FETCH_TIMEOUT_MS = 2500;
export const MAX_AVATAR_REDIRECTS = 3;

export interface AvatarHttpResponse {
  status: number;
  location?: string;
  contentLength?: number;
  body?: AsyncIterable<Buffer | Uint8Array> | Buffer;
}

export type AvatarDnsLookup = (hostname: string) => Promise<LookupAddress[]>;

export type AvatarHttpRequester = (params: {
  url: URL;
  address: string;
  family: 4 | 6;
  headers: Record<string, string>;
  signal: AbortSignal;
}) => Promise<AvatarHttpResponse>;

export interface AvatarFetchOptions {
  accessToken?: string;
  trustedTokenOrigins?: ReadonlySet<string>;
  timeoutMs?: number;
  maxBytes?: number;
  dnsLookup?: AvatarDnsLookup;
  httpRequest?: AvatarHttpRequester;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function defaultHttpRequest(params: {
  url: URL;
  address: string;
  family: 4 | 6;
  headers: Record<string, string>;
  signal: AbortSignal;
}): Promise<AvatarHttpResponse> {
  const rawHostname = params.url.hostname.replace(/^\[|\]$/g, "");
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: "https:",
        hostname: rawHostname,
        port: params.url.port || 443,
        path: `${params.url.pathname}${params.url.search}`,
        method: "GET",
        headers: params.headers,
        servername: isIP(rawHostname) ? undefined : rawHostname,
        signal: params.signal,
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all) {
            callback(null, [
              { address: params.address, family: params.family },
            ]);
          } else {
            callback(null, params.address, params.family);
          }
        },
      },
      (res) => {
        const rawLength = res.headers["content-length"];
        const parsedLength =
          typeof rawLength === "string" && /^\d+$/.test(rawLength)
            ? Number(rawLength)
            : undefined;
        resolve({
          status: res.statusCode ?? 0,
          location:
            typeof res.headers.location === "string"
              ? res.headers.location
              : undefined,
          contentLength: parsedLength,
          body: res,
        });
      },
    );
    req.once("error", reject);
    req.end();
  });
}

async function readBoundedBody(
  body: AsyncIterable<Buffer | Uint8Array> | Buffer | undefined,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  if (!body) {
    throw new Error("Empty avatar response");
  }
  if (Buffer.isBuffer(body)) {
    if (!body.length || body.length > maxBytes) {
      throw new Error("Avatar exceeds size limit");
    }
    return body;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    if (signal.aborted) {
      throw new Error("Avatar download timed out");
    }
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error("Avatar exceeds size limit");
    }
    chunks.push(buf);
  }
  if (total === 0) {
    throw new Error("Empty avatar response");
  }
  return Buffer.concat(chunks, total);
}

async function resolveSafeTarget(
  hostname: string,
  lookup: AvatarDnsLookup,
): Promise<{ address: string; family: 4 | 6 }> {
  const cleaned = hostname.replace(/^\[|\]$/g, "");
  const ipVersion = isIP(cleaned);
  if (ipVersion === 4 || ipVersion === 6) {
    if (isBlockedIp(cleaned)) {
      throw new Error("Avatar IP is blocked");
    }
    return { address: cleaned, family: ipVersion };
  }

  const records = await lookup(cleaned);
  if (!records.length) {
    throw new Error("Avatar hostname could not be resolved");
  }
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new Error("Avatar resolved to a blocked IP address");
    }
  }
  const selected = records[0];
  return {
    address: selected.address,
    family: selected.family === 6 ? 6 : 4,
  };
}

function discardBody(
  body: AsyncIterable<Buffer | Uint8Array> | Buffer | undefined,
): void {
  if (!body || Buffer.isBuffer(body)) {
    return;
  }
  const stream = body as { destroy?: () => void; resume?: () => void };
  if (typeof stream.destroy === "function") {
    stream.destroy();
  } else if (typeof stream.resume === "function") {
    stream.resume();
  }
}

export async function fetchSsoAvatar(
  rawPicture: string,
  options: AvatarFetchOptions = {},
): Promise<DownloadedAvatar> {
  const maxBytes = options.maxBytes ?? MAX_AVATAR_BYTES;
  if (rawPicture.startsWith("data:")) {
    const decoded = decodeDataUriAvatar(rawPicture, maxBytes);
    if (!decoded) {
      throw new Error("Unsupported or oversized avatar data URI");
    }
    return decoded;
  }

  const initialUrl = validateHttpsAvatarUrl(rawPicture);
  if (!initialUrl) {
    throw new Error("Invalid avatar URL");
  }

  const dnsLookup: AvatarDnsLookup =
    options.dnsLookup ??
    ((hostname) => dnsLookupDefault(hostname, { all: true, verbatim: true }));
  const requester = options.httpRequest ?? defaultHttpRequest;
  const timeoutMs = options.timeoutMs ?? AVATAR_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref();

  try {
    let currentUrl = initialUrl;
    for (let redirect = 0; redirect <= MAX_AVATAR_REDIRECTS; redirect += 1) {
      const target = await resolveSafeTarget(currentUrl.hostname, dnsLookup);
      const headers: Record<string, string> = {
        accept: "image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
      };
      if (
        options.accessToken &&
        options.trustedTokenOrigins?.has(currentUrl.origin)
      ) {
        headers.authorization = `Bearer ${options.accessToken}`;
      }

      const response = await requester({
        url: currentUrl,
        address: target.address,
        family: target.family,
        headers,
        signal: controller.signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        discardBody(response.body);
        if (!response.location || redirect === MAX_AVATAR_REDIRECTS) {
          throw new Error("Too many avatar redirects");
        }
        const nextUrl = validateHttpsAvatarUrl(
          new URL(response.location, currentUrl).href,
        );
        if (!nextUrl) {
          throw new Error("Blocked avatar redirect target");
        }
        currentUrl = nextUrl;
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        discardBody(response.body);
        throw new Error(`Avatar fetch failed with status ${response.status}`);
      }
      if (
        response.contentLength !== undefined &&
        response.contentLength > maxBytes
      ) {
        discardBody(response.body);
        throw new Error("Avatar exceeds size limit");
      }

      const content = await readBoundedBody(
        response.body,
        maxBytes,
        controller.signal,
      );
      const mimeType = avatarRasterType(content);
      if (!mimeType) {
        throw new Error("Avatar is not a supported raster image");
      }

      return {
        content,
        mimeType,
        sha256: createHash("sha256").update(content).digest("hex"),
        sourceUrl: initialUrl.href,
      };
    }

    throw new Error("Too many avatar redirects");
  } finally {
    clearTimeout(timer);
  }
}
