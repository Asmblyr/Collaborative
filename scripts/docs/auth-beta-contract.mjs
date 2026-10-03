const str = { type: "string" };
const obj = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const json = (schema) => ({ "application/json": { schema } });
const body = (schema) => ({ required: true, content: json(schema) });
const response = (schema) => ({ description: "Успех", content: json(schema) });
const pair = obj({
  tokenType: { const: "Bearer" },
  accessToken: str,
  refreshToken: str,
  expiresIn: { type: "integer" },
  refreshExpiresAt: { ...str, format: "date-time" },
});
const keyList = obj({
  data: {
    type: "array",
    items: obj({
      id: str,
      name: str,
      createdAt: { ...str, format: "date-time" },
      lastUsedAt: { type: ["string", "null"], format: "date-time" },
    }),
  },
});
const clientResponse = (registration) =>
  obj(
    {
      id: str,
      rawId: str,
      type: { const: "public-key" },
      response: registration
        ? obj(
            {
              attestationObject: str,
              clientDataJSON: str,
              transports: { type: "array", items: str },
            },
            ["attestationObject", "clientDataJSON"],
          )
        : obj(
            {
              authenticatorData: str,
              clientDataJSON: str,
              signature: str,
              userHandle: { type: ["string", "null"] },
            },
            ["authenticatorData", "clientDataJSON", "signature"],
          ),
      clientExtensionResults: { type: "object", additionalProperties: true },
      authenticatorAttachment: { enum: ["platform", "cross-platform"] },
    },
    ["id", "rawId", "type", "response", "clientExtensionResults"],
  );
export function authBetaContract(key) {
  if (key === "POST /auth/invitations/claim") {
    return {
      requestBody: body(
        obj({
          token: { ...str, pattern: "^asm_(inv|rec)_[A-Za-z0-9_-]{43}$" },
        }),
      ),
      responses: {
        200: response(pair),
        401: {
          description:
            "Истёкшая/использованная ссылка или отключённый пользователь",
        },
      },
    };
  }
  if (key === "POST /users/:id/recovery") {
    return {
      responses: {
        200: response(
          obj({
            data: obj({
              invitationToken: str,
              expiresAt: { ...str, format: "date-time" },
            }),
          }),
        ),
      },
    };
  }
  if (key === "POST /users/me/password/setup") {
    return {
      requestBody: body(
        obj({ password: { ...str, minLength: 12, maxLength: 1024 } }),
      ),
      responses: {
        204: { description: "Первый пароль добавлен" },
        409: { description: "Пароль уже существует" },
      },
    };
  }
  if (key === "GET /users/me/passkeys") {
    return { responses: { 200: response(keyList) } };
  }
  if (key === "DELETE /users/me/passkeys/:id") {
    return {
      responses: {
        204: { description: "Собственный ключ удалён" },
        409: { description: "Последний способ входа нельзя удалить" },
      },
    };
  }
  if (
    key === "POST /users/me/passkeys" ||
    key === "POST /auth/passkeys/login"
  ) {
    const registration = key === "POST /users/me/passkeys";
    return {
      requestBody: body(
        obj(
          {
            challengeId: { ...str, format: "uuid" },
            response: clientResponse(registration),
            ...(registration
              ? { name: { ...str, minLength: 1, maxLength: 120 } }
              : {}),
          },
          ["challengeId", "response"],
        ),
      ),
      responses: {
        [registration ? 201 : 200]: response(registration ? keyList : pair),
        401: {
          description: "WebAuthn verification failed or challenge used/expired",
        },
      },
    };
  }
  if (
    key === "POST /auth/passkeys/options" ||
    key === "POST /users/me/passkeys/options"
  ) {
    const registration = key.includes("/users/");
    const descriptor = obj(
      {
        id: str,
        type: { const: "public-key" },
        transports: { type: "array", items: str },
      },
      ["id", "type"],
    );
    const options = {
      type: "object",
      additionalProperties: true,
      properties: {
        challenge: str,
        timeout: { type: "integer" },
        ...(registration
          ? {
              rp: obj({ id: str, name: str }),
              user: obj({ id: str, name: str, displayName: str }),
              pubKeyCredParams: {
                type: "array",
                items: obj({
                  type: { const: "public-key" },
                  alg: { type: "integer" },
                }),
              },
              excludeCredentials: { type: "array", items: descriptor },
              authenticatorSelection: obj(
                {
                  residentKey: { const: "required" },
                  userVerification: { const: "required" },
                  requireResidentKey: { type: "boolean" },
                },
                ["residentKey", "userVerification"],
              ),
            }
          : { rpId: str, userVerification: { const: "required" } }),
      },
      required: registration
        ? ["challenge", "rp", "user", "pubKeyCredParams"]
        : ["challenge", "rpId", "userVerification"],
    };
    return {
      responses: {
        200: response(
          obj({ challengeId: { ...str, format: "uuid" }, options }),
        ),
      },
    };
  }
  return null;
}
