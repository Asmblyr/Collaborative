import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class OAuthCipher {
  private readonly key: Buffer;

  constructor(key: string) {
    this.key = Buffer.from(key, "base64url");
    if (this.key.length !== 32)
      throw new Error("OAuth storage key must be 32 bytes");
  }

  seal(value: unknown, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64url",
    );
  }

  open<T>(value: string, context: string): T {
    const bytes = Buffer.from(value, "base64url");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      bytes.subarray(0, 12),
    );
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        cipher.update(bytes.subarray(28)),
        cipher.final(),
      ]).toString("utf8"),
    ) as T;
  }
}
