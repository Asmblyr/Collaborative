import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  type TranslationsResult,
  type UiLocale,
} from "@asmblyr-collaborative/contracts";
import {
  coreTranslations,
  translationMessages,
  collectionLabels,
} from "@asmblyr-collaborative/contracts/translations";
import { loadAccess } from "../permissions/access.js";
import { AuthInputError } from "../auth/validation.js";
import { visibleCatalog } from "../collections/visible-catalog.js";
import type { LoadedPlugin } from "../plugins/definition.js";

export function registerTranslationRoutes(
  app: FastifyInstance,
  database: Knex | null,
  plugins: readonly LoadedPlugin[],
): void {
  app.get<{ Querystring: { locale?: string } }>(
    "/translations",
    async (request, reply): Promise<TranslationsResult> => {
      if (!database) {
        throw Object.assign(new Error("Database is not configured"), {
          statusCode: 503,
        });
      }
      const access = await loadAccess(database, request.headers.authorization);
      const locale: UiLocale =
        request.query.locale === undefined
          ? "ru"
          : (request.query.locale as UiLocale);
      if (
        Object.keys(request.query).some((key) => key !== "locale") ||
        !["ru", "en"].includes(locale)
      ) {
        throw new AuthInputError("locale must be ru or en");
      }
      const core = translationMessages(coreTranslations, locale);
      const pluginMessages = Object.fromEntries(
        plugins
          .filter((plugin) => plugin.namespace)
          .map((plugin) => [
            plugin.namespace!,
            translationMessages(plugin.translations, locale),
          ]),
      );
      const collections = await visibleCatalog(database, access);
      const catalogs = plugins.flatMap((plugin) =>
        plugin.namespace
          ? [{ namespace: plugin.namespace, translations: plugin.translations }]
          : [],
      );
      const schema = Object.fromEntries(
        collections.map((collection) => [
          collection.name,
          collectionLabels(collection, locale, catalogs),
        ]),
      );
      reply.header("cache-control", "private, no-store");
      return {
        data: {
          version: 1,
          locale,
          fallbackLocale: "ru",
          core,
          plugins: pluginMessages,
          schema,
        },
      };
    },
  );
}
