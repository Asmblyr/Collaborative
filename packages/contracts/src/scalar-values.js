/** Calendar values stay strings: there is no instant or timezone to convert. */
export function parseCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Expected a calendar date in YYYY-MM-DD format");
  }
  const [year, month, day] = value.split("-").map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (
    year === 0 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date");
  }
  return value;
}

/** PostgreSQL int8 uses canonical strings, including inside JSON. */
export function parseBigintString(value) {
  if (typeof value !== "string" || !/^(?:0|-?[1-9]\d{0,18})$/.test(value)) {
    throw new Error("Expected a canonical bigint string");
  }
  const integer = BigInt(value);
  if (integer < -9223372036854775808n || integer > 9223372036854775807n) {
    throw new Error("Bigint is outside the PostgreSQL int8 range");
  }
  return value;
}
