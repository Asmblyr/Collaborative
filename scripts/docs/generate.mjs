import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root, routeInventory } from "./route-inventory.mjs";
import { operationContract } from "./http-contracts.mjs";
import { itemCommitSchemas } from "./item-commit-contract.mjs";

const require = createRequire(path.join(root, "package.json"));
const check = process.argv.includes("--check");
const catalog = JSON.parse(
  await readFile(path.join(root, "docs/reference/endpoints.json"), "utf8"),
);
const routes = await routeInventory();
const keys = routes.map((route) => `${route.method} ${route.path}`);
const missing = keys.filter((key) => !catalog[key]);
const stale = Object.keys(catalog).filter((key) => !keys.includes(key));
if (missing.length || stale.length) {
  throw new Error(
    `Review endpoint access documentation. Missing: ${missing.join(", ")}; removed: ${stale.join(", ")}`,
  );
}

async function output(relative, content) {
  const target = path.join(root, relative);
  if (check) {
    const current = await readFile(target, "utf8").catch(() => "");
    if (current !== content) {
      throw new Error(
        `Documentation is stale: ${relative}. Run pnpm docs:generate.`,
      );
    }
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

const paths = {};
const delegated = [];
const rows = [];
for (const route of routes) {
  const key = `${route.method} ${route.path}`;
  const entry = catalog[key];
  if (!entry.access || typeof entry.public !== "boolean") {
    throw new Error(`Invalid access declaration: ${key}`);
  }
  rows.push(`| \`${key}\` | ${entry.access} | \`${route.source}\` |`);
  if (route.method === "ALL") {
    delegated.push({ ...route, ...entry });
    continue;
  }
  const address = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  const contract = operationContract(key);
  paths[address] ??= {};
  paths[address][route.method.toLowerCase()] = {
    tags: [route.path.split("/")[1]],
    operationId: `${route.method.toLowerCase()}_${route.path.replace(/[^A-Za-z0-9]+/g, "_")}`,
    summary: key,
    description: `${entry.access}. ${contract ? "" : "Схемы тела и ответа пока не детализированы; см. реализацию обработчика. "}Источник: ${route.source}`,
    security: entry.public ? [] : [{ bearerAuth: [] }],
    parameters: [...address.matchAll(/\{([^}]+)\}/g)].map((match) => ({
      name: match[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    })),
    responses: {
      default: {
        description:
          "Контракт ответа смотрите в обработчике; эта операция описана на уровне маршрута и доступа.",
      },
    },
    "x-contract-level": contract ? "documented" : "route-only",
    "x-source": route.source,
    ...contract,
  };
  if (contract?.query) {
    paths[address][route.method.toLowerCase()].parameters.push(
      ...contract.query,
    );
    delete paths[address][route.method.toLowerCase()].query;
  }
}
const spec = {
  openapi: "3.1.0",
  info: {
    title: "Asmblyr Core HTTP API",
    version: "0.0.0",
    description:
      "Все статические маршруты Core и их требования доступа. Часть операций имеет только route-only описание; спецификация не является полной схемой для генерации клиента. OAuth protocol и динамические маршруты плагинов описаны отдельно.",
  },
  servers: [{ url: "http://localhost:3001", description: "Локальный Core" }],
  paths,
  components: {
    schemas: itemCommitSchemas,
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Непрозрачный access token пользователя или сервиса. Разделы настроек доступны только человеку.",
      },
    },
  },
  "x-delegated-routes": delegated,
};
await output("docs/public/openapi.json", JSON.stringify(spec, null, 2) + "\n");
await output(
  "docs/reference/routes.md",
  `# Матрица HTTP-маршрутов\n\nСгенерировано из Core и проверенного каталога доступа. ${routes.length} деклараций.\n\nЭто описание границ; их исполнение проверяют интеграционные тесты. Динамические маршруты плагинов и внутренние endpoints oidc-provider не перечисляются отдельно.\n\n| Метод и путь | Доступ | Источник в репозитории |\n| --- | --- | --- |\n${rows.join("\n")}\n`,
);

const guides = {
  "sdk-guide": "packages/sdk/README.md",
  "kit-guide": "packages/kit/README.md",
  "kit-hooks": "packages/kit/HOOKS.md",
  "kit-fields": "packages/kit/FIELDS.md",
  "kit-lifecycle": "packages/kit/LIFECYCLE.md",
  "kit-capabilities": "packages/kit/CAPABILITIES.md",
  "kit-ui": "packages/kit/UI.md",
  "plugin-color": "examples/plugins/color/README.md",
};
for (const [name, source] of Object.entries(guides)) {
  let content = await readFile(path.join(root, source), "utf8");
  content = content
    .replace(/\((?:\.\/)?HOOKS\.md\)/g, "(./kit-hooks.md)")
    .replace(/\((?:\.\/)?FIELDS\.md\)/g, "(./kit-fields.md)")
    .replace(/\((?:\.\/)?LIFECYCLE\.md\)/g, "(./kit-lifecycle.md)")
    .replace(/\((?:\.\/)?CAPABILITIES\.md\)/g, "(./kit-capabilities.md)")
    .replace(/\((?:\.\/)?UI\.md\)/g, "(./kit-ui.md)")
    .replaceAll("../sdk/README.md", "./sdk-guide.md")
    .replaceAll(
      "../../docs/development/plugin-actions.md",
      "../development/plugin-actions.md",
    )
    .replaceAll("../../examples/plugins/color/README.md", "./plugin-color.md")
    .replaceAll("../../../packages/kit/FIELDS.md", "./kit-fields.md");
  if (name === "plugin-color") {
    content = content.replaceAll(
      "(../README.md)",
      "(https://github.com/Asmblyr/Collaborative/blob/main/examples/plugins/README.md)",
    );
  }
  await output(
    `docs/reference/${name}.md`,
    `<!-- Generated from ${source}; edit the source. -->\n\n${content.replaceAll("\r\n", "\n")}`,
  );
}
if (!check) {
  const swagger = path.dirname(require.resolve("swagger-ui-dist/package.json"));
  await mkdir(path.join(root, "docs/public/api"), { recursive: true });
  for (const file of [
    "swagger-ui.css",
    "swagger-ui-bundle.js",
    "LICENSE",
    "NOTICE",
  ]) {
    await cp(
      path.join(swagger, file),
      path.join(root, "docs/public/api", file),
    );
  }
  for (const name of ["sdk", "kit"]) {
    const typedocRoot = path.dirname(require.resolve("typedoc/package.json"));
    const result = spawnSync(
      process.execPath,
      [
        path.join(typedocRoot, "bin/typedoc"),
        "--plugin",
        "typedoc-plugin-markdown",
        "--entryPoints",
        `packages/${name}/src/index.ts`,
        "--tsconfig",
        `packages/${name}/tsconfig.json`,
        "--out",
        `docs/reference/${name}`,
        "--readme",
        "none",
        "--disableSources",
        "--excludeInternal",
        "--sanitizeComments",
        "--parametersFormat",
        "table",
        "--indexFormat",
        "table",
      ],
      { cwd: root, stdio: "inherit" },
    );
    if (result.status !== 0) {
      throw new Error(`TypeDoc failed for ${name}`);
    }
  }
}
console.log(
  `Documentation ${check ? "checked" : "generated"}: ${routes.length} routes.`,
);
