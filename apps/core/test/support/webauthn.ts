import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest();
export function virtualPasskey() {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const id = randomBytes(32);
  const publicKey = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x!, "base64url")],
      [-3, Buffer.from(jwk.y!, "base64url")],
    ]),
  );
  const authData = (flags: number, counter: number) => {
    const suffix = Buffer.alloc(5);
    suffix[0] = flags;
    suffix.writeUInt32BE(counter, 1);
    return Buffer.concat([hash("localhost"), suffix]);
  };
  const client = (type: string, challenge: string, origin: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin }));
  return {
    id: id.toString("base64url"),
    registration(
      challenge: string,
      origin = "http://localhost:3000",
      verified = true,
    ) {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(id.length);
      const attestation = isoCBOR.encode(
        new Map<string, unknown>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          [
            "authData",
            Buffer.concat([
              authData(verified ? 0x45 : 0x41, 0),
              Buffer.alloc(16),
              length,
              id,
              publicKey,
            ]),
          ],
        ]) as Parameters<typeof isoCBOR.encode>[0],
      );
      return {
        id: id.toString("base64url"),
        rawId: id.toString("base64url"),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          attestationObject: Buffer.from(attestation).toString("base64url"),
          clientDataJSON: client("webauthn.create", challenge, origin).toString(
            "base64url",
          ),
          transports: ["internal"],
        },
      };
    },
    authentication(
      challenge: string,
      counter = 1,
      origin = "http://localhost:3000",
      verified = true,
    ) {
      const data = authData(verified ? 5 : 1, counter);
      const clientData = client("webauthn.get", challenge, origin);
      const signature = sign(
        "sha256",
        Buffer.concat([data, hash(clientData)]),
        pair.privateKey,
      );
      return {
        id: id.toString("base64url"),
        rawId: id.toString("base64url"),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          authenticatorData: data.toString("base64url"),
          clientDataJSON: clientData.toString("base64url"),
          signature: signature.toString("base64url"),
        },
      };
    },
  };
}
