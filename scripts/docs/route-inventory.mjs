import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(path.join(root, "apps/core/package.json"));
const ts = require("typescript");

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await files(target)));
    } else if (entry.name.endsWith(".ts")) {
      result.push(target);
    }
  }
  return result;
}

export async function routeInventory() {
  const routes = [];
  for (const file of await files(path.join(root, "apps/core/src"))) {
    const source = ts.createSourceFile(
      file,
      await readFile(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const constants = new Map();
    function collect(node) {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isStringLiteralLike(node.initializer)
      ) {
        constants.set(node.name.text, node.initializer.text);
      }
      ts.forEachChild(node, collect);
    }
    collect(source);
    function routePath(node) {
      if (!node) {
        return null;
      }
      if (ts.isStringLiteralLike(node)) {
        return node.text;
      }
      if (ts.isIdentifier(node)) {
        return constants.get(node.text) ?? null;
      }
      if (ts.isTemplateExpression(node)) {
        let value = node.head.text;
        for (const span of node.templateSpans) {
          const part = routePath(span.expression);
          if (part === null) {
            return null;
          }
          value += part + span.literal.text;
        }
        return value;
      }
      return null;
    }
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const method = node.expression.name.text.toUpperCase();
        const receiver = node.expression.expression.getText(source);
        const isServer = receiver === "app" || receiver === "scope";
        if (
          isServer &&
          method === "ROUTE" &&
          !file.endsWith(path.join("plugins", "routes.ts"))
        ) {
          throw new Error(
            `Add explicit support for route object declarations in ${file}`,
          );
        }
        const argument = node.arguments[0];
        const address = routePath(argument);
        if (
          isServer &&
          [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "ALL",
            "HEAD",
            "OPTIONS",
          ].includes(method) &&
          !address
        ) {
          throw new Error(
            `Unresolved route path in ${file}: ${node.getText(source).slice(0, 100)}`,
          );
        }
        if (
          [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "ALL",
            "HEAD",
            "OPTIONS",
          ].includes(method) &&
          address?.startsWith("/")
        ) {
          routes.push({
            method,
            path: address,
            source: path.relative(root, file).replaceAll("\\", "/"),
            line:
              source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return routes.sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}
