import type { Transport } from "./transport.js";
import type { RequestOptions } from "./options.js";

export type PluginPaths<Methods extends object> = {
  readonly [Namespace in keyof Methods]: {
    readonly [Id in keyof Methods[Namespace]]: string;
  };
};
export type PluginsClient<Methods extends object> = {
  readonly [Namespace in keyof Methods]: {
    readonly [Id in keyof Methods[Namespace]]: (
      input: Methods[Namespace][Id] extends { input: infer Input }
        ? Input
        : never,
      request?: RequestOptions,
    ) => Promise<
      Methods[Namespace][Id] extends { output: infer Output } ? Output : never
    >;
  };
};
export function copyPluginPaths<Methods extends object>(
  paths: PluginPaths<Methods>,
): PluginPaths<Methods> {
  const copied = Object.create(null);
  for (const [namespace, methods] of Object.entries(
    paths as Record<string, Record<string, string>>,
  )) {
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(namespace)) {
      throw new TypeError("Invalid plugin namespace");
    }
    const group = Object.create(null);
    for (const [id, path] of Object.entries(methods)) {
      if (
        !/^[a-z][a-z0-9-]{0,31}$/.test(id) ||
        !/^\/[a-z][a-z0-9_]*(?:\/[a-zA-Z0-9_-]+)+$/.test(path) ||
        path.split("/")[1] !== namespace ||
        path.split("/").slice(2).join("-") !== id
      ) {
        throw new TypeError("Invalid plugin method path");
      }
      group[id] = path;
    }
    copied[namespace] = Object.freeze(group);
  }
  return Object.freeze(copied);
}
export function createPluginsClient<Methods extends object>(
  paths: PluginPaths<Methods>,
  transport: Transport,
): PluginsClient<Methods> {
  const result = Object.create(null);
  for (const [namespace, methods] of Object.entries(
    paths as Record<string, Record<string, string>>,
  )) {
    const group = Object.create(null);
    for (const [id, path] of Object.entries(methods)) {
      group[id] = async (input: object, request?: RequestOptions) => {
        const response = await transport.write<{
          data: { namespace: string; actionId: string; output: object };
        }>("POST", path, input, request);
        if (
          response?.data?.namespace !== namespace ||
          response.data.actionId !== id ||
          !response.data.output ||
          typeof response.data.output !== "object" ||
          Array.isArray(response.data.output)
        ) {
          throw new TypeError("Plugin returned an invalid model response");
        }
        return response.data.output;
      };
    }
    result[namespace] = Object.freeze(group);
  }
  return Object.freeze(result);
}
