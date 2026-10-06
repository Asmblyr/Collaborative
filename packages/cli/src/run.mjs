import { readFile, stat } from "node:fs/promises";
import { createClient } from "@asmblyr-collaborative/sdk";
import {
  generateSchemaTypes,
  parseSchemaSnapshot,
} from "@asmblyr-collaborative/sdk/schema";
import { createHash } from "node:crypto";
import { apiUrl, outputPath, readConfig, writeOutput } from "./config.mjs";
import { parseArguments } from "./arguments.mjs";
import { browserLogin } from "./login.mjs";

const help = `asm connect --url <Asmblyr URL> [--schema-file asmblyr.schema.json] [--types-file asmblyr.schema.ts]
asm schema pull [--config asmblyr.config.json]
asm generate [--config asmblyr.config.json]
asm schema generate [--config asmblyr.config.json]
asm schema check [--offline] [--config asmblyr.config.json]
Credentials: browser sign-in by default; ASMBLYR_ACCESS_TOKEN or --token-stdin for CI.
--no-browser prints the sign-in URL. Credentials are never saved. Requires Node.js 22+.
connect verifies access, then writes a credential-free config, schema and TypeScript types.
generate rebuilds TypeScript from the saved snapshot, without network or credentials.
schema check exits 1 when schema or generated types have changed.`;

function verified(input) {
  const snapshot = parseSchemaSnapshot(input);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        collections: snapshot.collections,
        ...(snapshot.methods === undefined
          ? {}
          : { methods: snapshot.methods }),
      }),
    )
    .digest("hex");
  if (hash !== snapshot.hash) {
    throw new Error("Schema hash does not match its contents");
  }
  return snapshot;
}
export async function run(
  args,
  {
    cwd = process.cwd(),
    env = process.env,
    stdin = process.stdin,
    out = console.log,
    fetch,
    login = browserLogin,
    openBrowser,
  } = {},
) {
  const { command, flags } = parseArguments(args);
  if (command === "help") {
    out(help);
    return 0;
  }
  const file = flags.config ?? "asmblyr.config.json";
  let config;
  if (command === "connect") {
    if (!flags.url) {
      throw new Error("connect requires --url");
    }
    config = {
      version: 1,
      url: apiUrl(flags.url),
      schemaFile: flags["schema-file"] ?? "asmblyr.schema.json",
      typesFile: flags["types-file"] ?? "asmblyr.schema.ts",
    };
    // Do not overwrite an unrelated project file on connect.
    for (const output of [file, config.schemaFile, config.typesFile]) {
      const target = outputPath(cwd, output);
      try {
        await stat(target);
        throw new Error(
          `Output already exists: ${output}. Use schema pull for an existing connection.`,
        );
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }
    if (
      new Set(
        [file, config.schemaFile, config.typesFile].map((p) =>
          outputPath(cwd, p),
        ),
      ).size !== 3
    ) {
      throw new Error("Outputs must be separate files");
    }
  } else {
    config = await readConfig(cwd, file);
  }
  if (command === "schema generate") {
    const saved = verified(
      JSON.parse(await readFile(outputPath(cwd, config.schemaFile), "utf8")),
    );
    await writeOutput(cwd, config.typesFile, generateSchemaTypes(saved));
    out(`Types generated from saved schema: ${config.typesFile}`);
    return 0;
  }
  let current;
  if (!flags.offline) {
    let token = env.ASMBLYR_ACCESS_TOKEN;
    if (flags["token-stdin"]) {
      const chunks = [];
      let length = 0;
      for await (const chunk of stdin) {
        length += chunk.length;
        if (length > 16384) {
          throw new Error("Credential input is too large");
        }
        chunks.push(chunk);
      }
      token = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
        .toString("utf8")
        .trim();
    }
    if (!token && !flags["token-stdin"]) {
      const connection = await login(config.url, {
        fetch,
        out,
        openBrowser,
        noBrowser: flags["no-browser"],
      });
      config.url = connection.url;
      token = connection.token;
    }
    if (!token || /\s/.test(token) || token.length > 16384) {
      throw new Error("Set ASMBLYR_ACCESS_TOKEN or provide --token-stdin");
    }
    try {
      const result = await createClient({
        baseUrl: config.url,
        accessToken: token,
        fetch,
        timeoutMs: 15000,
      }).schema.pull();
      current = verified(result.data);
    } catch (error) {
      if (typeof error.status === "number") {
        throw new Error(`Schema request failed (HTTP ${error.status})`);
      }
      throw new Error(
        "Could not fetch a valid schema. Check the URL, connection and credential permissions.",
      );
    }
  }
  if (command === "schema check") {
    const saved = verified(
      JSON.parse(await readFile(outputPath(cwd, config.schemaFile), "utf8")),
    );
    const types = await readFile(outputPath(cwd, config.typesFile), "utf8");
    const source = current ?? saved;
    const matches =
      source.hash === saved.hash && types === generateSchemaTypes(source);
    out(
      matches
        ? "Schema and generated types are current."
        : "Schema or generated types changed. Run asm schema pull.",
    );
    return matches ? 0 : 1;
  }
  await writeOutput(
    cwd,
    config.schemaFile,
    `${JSON.stringify(current, null, 2)}\n`,
  );
  await writeOutput(cwd, config.typesFile, generateSchemaTypes(current));
  if (command === "connect") {
    await writeOutput(cwd, file, `${JSON.stringify(config, null, 2)}\n`);
  }
  out(
    `Schema saved: ${current.collections.length} collections. Types: ${config.typesFile}`,
  );
  return 0;
}
