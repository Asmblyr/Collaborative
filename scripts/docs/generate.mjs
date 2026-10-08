import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root, routeInventory } from "./route-inventory.mjs";
import { operationContract } from "./http-contracts.mjs";
import { generateGuides } from "./guides.mjs";
import {
  checkPageCoverage,
  httpText,
  localizeSpec,
  localizeTypeDoc,
  markdownFiles,
} from "./localization.mjs";
import { swaggerPage } from "./swagger-page.mjs";
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
const rows = { en: [], ru: [] };
for (const route of routes) {
  const key = `${route.method} ${route.path}`;
  const entry = catalog[key];
  if (!entry.access || typeof entry.public !== "boolean") {
    throw new Error(`Invalid access declaration: ${key}`);
  }
  for (const locale of ["en", "ru"]) {
    rows[locale].push(
      `| \`${key}\` | ${httpText(entry.access, locale)} | \`${route.source}\` |`,
    );
  }
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
    security: entry.public ? [] : [{ bearerAuth: [] }, { browserSession: [] }],
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
    title: "Collaborative Core HTTP API",
    version: "0.0.0",
    description:
      "Все статические маршруты Core и их требования доступа. Часть операций имеет только route-only описание; спецификация не является полной схемой для генерации клиента. OAuth protocol и динамические маршруты плагинов описаны отдельно.",
  },
  servers: [
    {
      url: "http://localhost:3000/api",
      description: "Публичный API на домене админки",
    },
    { url: "http://localhost:3001", description: "Самостоятельный Core" },
  ],
  paths,
  components: {
    schemas: itemCommitSchemas,
    securitySchemes: {
      browserSession: {
        type: "apiKey",
        in: "cookie",
        name: "asmblyr_session",
        description:
          "HttpOnly browser session; префикс меняется SESSION_COOKIE_PREFIX. Записывающие запросы требуют Origin = AUTH_UI_URL. Cookie не отменяет права конкретной операции.",
      },
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
for (const locale of ["en", "ru"]) {
  const prefix = locale === "ru" ? "ru/" : "";
  await output(
    "docs/public/" + prefix + "openapi.json",
    JSON.stringify(localizeSpec(spec, locale), null, 2) + "\n",
  );
  await output("docs/public/" + prefix + "api/index.html", swaggerPage(locale));
  const intro =
    locale === "ru"
      ? "# Матрица HTTP-маршрутов\n\nСгенерировано из Core и проверенного каталога доступа. " +
        routes.length +
        " деклараций.\n\nЭто описание границ; их исполнение проверяют интеграционные тесты. Динамические маршруты плагинов и внутренние endpoints oidc-provider не перечисляются отдельно.\n\n| Метод и путь | Доступ | Источник в репозитории |"
      : "# HTTP route matrix\n\nGenerated from Core and the reviewed access catalog. " +
        routes.length +
        " declarations.\n\nThis describes access boundaries; integration tests verify enforcement. Dynamic plugin routes and internal oidc-provider endpoints are not listed individually.\n\n| Method and path | Access | Source in the repository |";
  await output(
    "docs/" + prefix + "reference/routes.md",
    intro + "\n| --- | --- | --- |\n" + rows[locale].join("\n") + "\n",
  );
}
await generateGuides(output);
await output(
  "docs/public/assets/brand/collaborative-symbol-dark.svg",
  (
    await readFile(
      path.join(root, "docs/assets/brand/collaborative-symbol.svg"),
      "utf8",
    )
  )
    .replaceAll("\r\n", "\n")
    .replaceAll("#1B2930", "#F5F3EE"),
);
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
  await mkdir(path.join(root, "docs/public/assets/brand"), { recursive: true });
  for (const file of [
    "collaborative-symbol.svg",
    "collaborative-logo-light.svg",
    "collaborative-logo-dark.svg",
    "collaborative-social.png",
  ]) {
    await cp(
      path.join(root, "docs/assets/brand", file),
      path.join(root, "docs/public/assets/brand", file),
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
for (const name of ["sdk", "kit"]) {
  const directory = path.join(root, "docs/reference", name);
  for (const file of await markdownFiles(directory)) {
    const relative = path.relative(directory, file).replaceAll("\\", "/");
    await output(
      "docs/ru/reference/" + name + "/" + relative,
      localizeTypeDoc(await readFile(file, "utf8")),
    );
  }
}
await checkPageCoverage();
console.log(
  `Documentation ${check ? "checked" : "generated"}: ${routes.length} routes.`,
);
