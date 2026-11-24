export const FALLBACK_TIMEZONES: readonly string[] = [
  "UTC",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/Azores",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Dubai",
  "Asia/Yekaterinburg",
  "Asia/Tashkent",
  "Asia/Almaty",
  "Asia/Kolkata",
  "Asia/Omsk",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Bangkok",
  "Asia/Irkutsk",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Yakutsk",
  "Asia/Tokyo",
  "Asia/Vladivostok",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export interface TimezoneOption {
  id: string;
  offsetLabel: string;
  offsetMinutes: number;
  label: string;
  searchText: string;
}

const OFFSET_PATTERN = /(?:GMT|UTC)\s*([+-−])(\d{1,2})(?::?(\d{2}))?/i;

export function supportedTimeZones(
  supportedValuesOf?: (key: "timeZone") => string[],
): string[] {
  let raw: string[] = [];
  try {
    if (supportedValuesOf) {
      raw = supportedValuesOf("timeZone");
    } else if (typeof Intl.supportedValuesOf === "function") {
      raw = Intl.supportedValuesOf("timeZone");
    }
  } catch {
    raw = [];
  }
  const source = raw.length > 0 ? raw : [...FALLBACK_TIMEZONES];
  const unique = new Set<string>(source);
  unique.add("UTC");
  return [...unique];
}

function padTwo(value: number): string {
  return String(Math.abs(value)).padStart(2, "0");
}

function parseOffsetString(raw: string): {
  offsetLabel: string;
  offsetMinutes: number;
} {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "GMT" || trimmed === "UTC") {
    return { offsetLabel: "UTC+00:00", offsetMinutes: 0 };
  }
  const match = OFFSET_PATTERN.exec(trimmed);
  if (!match) {
    return { offsetLabel: "UTC+00:00", offsetMinutes: 0 };
  }
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;
  const totalMinutes = sign * (hours * 60 + minutes);
  const prefix = totalMinutes < 0 ? "-" : "+";
  return {
    offsetLabel: `UTC${prefix}${padTwo(hours)}:${padTwo(minutes)}`,
    offsetMinutes: totalMinutes,
  };
}

export function formatUtcOffset(
  timeZone: string,
  referenceDate: Date = new Date(),
): { offsetLabel: string; offsetMinutes: number } {
  for (const style of ["longOffset", "shortOffset"] as const) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: style,
      }).formatToParts(referenceDate);
      const token = parts.find((part) => part.type === "timeZoneName")?.value;
      if (token) {
        return parseOffsetString(token);
      }
    } catch {
      /* Try fallback style or default UTC+00:00. */
    }
  }
  return { offsetLabel: "UTC+00:00", offsetMinutes: 0 };
}

function offsetSearchTokens(
  offsetLabel: string,
  offsetMinutes: number,
): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const shortHour =
    minutes === 0 ? `${sign}${hours}` : `${sign}${hours}:${padTwo(minutes)}`;
  const padded = `${sign}${padTwo(hours)}:${padTwo(minutes)}`;
  return [
    offsetLabel.toLowerCase(),
    `utc${shortHour}`,
    `gmt${padded}`,
    `gmt${shortHour}`,
    padded,
    shortHour,
  ].join(" ");
}

export function buildTimezoneOption(
  timeZone: string,
  referenceDate: Date = new Date(),
): TimezoneOption {
  const { offsetLabel, offsetMinutes } = formatUtcOffset(
    timeZone,
    referenceDate,
  );
  const normalizedId = timeZone.toLowerCase();
  const spacedId = normalizedId.replace(/[_/]+/g, " ");
  const searchText = [
    normalizedId,
    spacedId,
    offsetSearchTokens(offsetLabel, offsetMinutes),
  ].join(" ");
  return {
    id: timeZone,
    offsetLabel,
    offsetMinutes,
    label: `${offsetLabel} · ${timeZone}`,
    searchText,
  };
}

export function buildTimezoneOptions(
  zones?: readonly string[],
  referenceDate: Date = new Date(),
): TimezoneOption[] {
  const list = zones ? [...new Set(zones)] : supportedTimeZones();
  return list
    .map((zone) => buildTimezoneOption(zone, referenceDate))
    .sort((left, right) => {
      if (left.offsetMinutes !== right.offsetMinutes) {
        return left.offsetMinutes - right.offsetMinutes;
      }
      if (left.id === "UTC") return -1;
      if (right.id === "UTC") return 1;
      return left.id.localeCompare(right.id, "en");
    });
}

function normalizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .replaceAll("−", "-")
    .split(/\s+/)
    .filter(Boolean);
}

export function filterTimezoneOptions(
  options: readonly TimezoneOption[],
  query: string,
): TimezoneOption[] {
  const tokens = normalizeQuery(query);
  if (tokens.length === 0) {
    return [...options];
  }
  return options.filter((option) =>
    tokens.every((token) => option.searchText.includes(token)),
  );
}

export function matchesAutoTimezoneQuery(
  query: string,
  browserOption: TimezoneOption,
): boolean {
  const tokens = normalizeQuery(query);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = `auto detect device авто определить автоматически устройство ${browserOption.searchText}`;
  return tokens.every((token) => haystack.includes(token));
}

export function detectBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function canonicalTimeZone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return new Intl.DateTimeFormat("en", {
    timeZone: trimmed,
  }).resolvedOptions().timeZone;
}
