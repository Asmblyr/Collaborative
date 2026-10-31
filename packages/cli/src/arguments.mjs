/**
 * @param {string[]} args
 * @returns {{command: "help" | "connect" | "schema pull" | "schema check" | "schema generate" | "extensions list" | "extensions info" | "extensions enable" | "extensions disable", flags: Record<string, string | boolean>, extensionId?: string}}
 */
export function parseArguments(args) {
  const flags = {};
  const words = [];
  const values = new Set(["url", "config", "schema-file", "types-file"]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (Object.hasOwn(flags, key)) {
      throw new Error(`Duplicate flag: --${key}`);
    }
    if (values.has(key)) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      flags[key] = args[++i];
    } else if (
      ["token-stdin", "offline", "no-browser", "help", "yes"].includes(key)
    ) {
      flags[key] = true;
    } else {
      throw new Error(
        `Unsupported flag: --${key}. Credentials use ASMBLYR_ACCESS_TOKEN or --token-stdin.`,
      );
    }
  }
  const input = words.join(" ");
  const extensionCommand =
    words[0] === "extensions" &&
    ["info", "enable", "disable"].includes(words[1]) &&
    words.length === 3;
  const extensionId = extensionCommand ? words[2] : undefined;
  const selected = extensionCommand ? `extensions ${words[1]}` : input;
  const command = selected === "generate" ? "schema generate" : selected;
  if (flags.help || !command) {
    return { command: "help", flags };
  }
  if (
    ![
      "connect",
      "schema pull",
      "schema check",
      "schema generate",
      "extensions list",
      "extensions info",
      "extensions enable",
      "extensions disable",
    ].includes(command)
  ) {
    throw new Error(
      "Use connect, generate, schema pull/check, or extensions list/info/enable/disable",
    );
  }
  const allowed =
    command === "connect"
      ? [
          "url",
          "config",
          "schema-file",
          "types-file",
          "token-stdin",
          "no-browser",
        ]
      : command === "schema generate"
        ? ["config"]
        : command.startsWith("extensions ")
          ? [
              "config",
              "token-stdin",
              ...(command === "extensions enable" ||
              command === "extensions disable"
                ? ["yes"]
                : []),
            ]
          : [
              "config",
              "token-stdin",
              "no-browser",
              ...(command === "schema check" ? ["offline"] : []),
            ];
  if (Object.keys(flags).some((key) => !allowed.includes(key))) {
    throw new Error("Flag is not supported for this command");
  }
  return { command, flags, ...(extensionId ? { extensionId } : {}) };
}
