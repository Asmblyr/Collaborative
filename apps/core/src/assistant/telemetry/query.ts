import { AuthInputError } from "../../auth/validation.js";
import { objectInput } from "../../shared/input.js";

export interface TelemetryQuery {
  days: number;
  until: Date;
  userId?: string;
  before?: { time: Date; id: string };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function date(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new AuthInputError("Invalid telemetry timestamp");
  return new Date(value);
}

export function parseTelemetryQuery(value: unknown): TelemetryQuery {
  const input = objectInput(value, ["days", "until", "cursor", "userId"]);
  if (input.days !== undefined && !["1", "7", "30", "90"].includes(input.days as string))
    throw new AuthInputError("Expected days: 1, 7, 30 or 90");
  const until = input.until === undefined ? new Date() : date(input.until);
  if (until.getTime() > Date.now() + 60_000)
    throw new AuthInputError("Telemetry period cannot be in the future");
  if (input.userId !== undefined && (typeof input.userId !== "string" || !uuid.test(input.userId)))
    throw new AuthInputError("Invalid user ID");
  let before: TelemetryQuery["before"];
  if (input.cursor !== undefined) {
    if (
      typeof input.cursor !== "string" ||
      input.cursor.length > 200 ||
      !/^[A-Za-z0-9_-]+$/.test(input.cursor)
    )
      throw new AuthInputError("Invalid telemetry cursor");
    const [time, id, extra] = Buffer.from(input.cursor, "base64url").toString("utf8").split("|");
    if (!id || !uuid.test(id) || extra !== undefined)
      throw new AuthInputError("Invalid telemetry cursor");
    before = { time: date(time), id };
  }
  return {
    days: Number(input.days ?? 7),
    until,
    userId: input.userId as string | undefined,
    before,
  };
}

export function telemetryCursor(time: Date, id: string) {
  return Buffer.from(`${time.toISOString()}|${id}`).toString("base64url");
}
