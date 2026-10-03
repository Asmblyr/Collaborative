import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { ModelDefinition } from "../model-schema.js";
import { modelTypeSchema } from "./model-type-schema.js";
import type { ApiRouteFile } from "./route-files.js";

function defaultExpression(source: ts.SourceFile): ts.Expression | undefined {
  const entry = source.statements.find(ts.isExportAssignment);
  if (!entry) return;
  if (!ts.isIdentifier(entry.expression)) return entry.expression;
  const name = entry.expression.text;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const variable = statement.declarationList.declarations.find(
      (declaration) => declaration.name.getText(source) === name,
    );
    if (variable) return variable.initializer;
  }
  return;
}

function isModelCall(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): expression is ts.CallExpression {
  if (!ts.isCallExpression(expression)) return false;
  let symbol = checker.getSymbolAtLocation(expression.expression);
  if (!symbol) return false;
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return (
    symbol.name === "defineModelContext" &&
    !!symbol.declarations?.some((declaration) =>
      declaration.getSourceFile().fileName.replaceAll("\\", "/").endsWith("/model-context.d.ts"),
    )
  );
}

export function generateModelDefinitions(
  program: ts.Program,
  root: string,
  routes: readonly ApiRouteFile[],
): Map<string, ModelDefinition> {
  const checker = program.getTypeChecker();
  const models = new Map<string, ModelDefinition>();
  for (const route of routes) {
    const source = program.getSourceFile(path.join(root, "server/api", route.file));
    const expression = source && defaultExpression(source);
    if (!expression || !isModelCall(expression, checker)) continue;
    if (route.method !== "POST" || route.path.includes(":")) {
      throw new Error(`${route.file}: model handlers require a static .post.ts route`);
    }
    if (expression.typeArguments?.length !== 1 || expression.arguments.length !== 2) {
      throw new Error(`${route.file}: use defineModelContext<Input>(handler, annotation)`);
    }
    const inputType = checker.getTypeFromTypeNode(expression.typeArguments[0]!);
    const handlerType = checker.getTypeAtLocation(expression.arguments[0]!);
    const signature = handlerType.getCallSignatures()[0];
    if (!signature) throw new Error(`${route.file}: model handler must be callable`);
    const outputType = checker.getAwaitedType(checker.getReturnTypeOfSignature(signature));
    if (!outputType) throw new Error(`${route.file}: cannot infer model result`);
    try {
      const id = route.path.split("/").slice(2).join("-") || "index";
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(id))
        throw new Error("Model route needs an action ID of at most 32 characters");
      models.set(route.file, {
        id,
        inputSchema: modelTypeSchema(checker, inputType, expression),
        outputSchema: modelTypeSchema(checker, outputType, expression),
      });
    } catch (error) {
      throw new Error(
        `${route.file}: ${error instanceof Error ? error.message : "Invalid model type"}`,
      );
    }
  }
  return models;
}

/** Browser-safe schemas; write only changed content to avoid dev watcher loops. */
export async function writeModelDefinitions(
  root: string,
  models: ReadonlyMap<string, ModelDefinition>,
): Promise<void> {
  for (const [route, model] of models) {
    const destination = path.join(root, ".asmblyr/models", `${route.slice(0, -3)}.json`);
    const content = `${JSON.stringify(model, null, 2)}\n`;
    const previous = await readFile(destination, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (previous === content) continue;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}

export async function sourceModelDefinitions(
  root: string,
  routes: readonly ApiRouteFile[],
): Promise<Map<string, ModelDefinition>> {
  // Plain fixture packages need no TS configuration; annotated handlers fail closed in the loader.
  const configPath = path.join(root, "tsconfig.json");
  if (!ts.sys.fileExists(configPath)) return new Map();
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(`Cannot read plugin tsconfig in ${root}`);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) throw new Error(formatModelDiagnostics(parsed.errors));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const models = generateModelDefinitions(program, root, routes);
  if (!models.size) return models;
  await writeModelDefinitions(root, models);
  // Generated JSON can be imported by the UI. Resolve it before checking the full package.
  const checked = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(checked);
  if (diagnostics.length) throw new Error(formatModelDiagnostics(diagnostics));
  return models;
}

function formatModelDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  });
}
