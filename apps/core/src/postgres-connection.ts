import pg from "pg";
import type { Knex } from "knex";

/** Override DATE on this pool only; the driver must never turn it into an instant. */
export function postgresConnection(
  connectionString: string,
): Knex.PgConnectionConfig {
  return {
    connectionString,
    types: {
      getTypeParser(oid, format) {
        if (
          [pg.types.builtins.DATE, pg.types.builtins.INT8].includes(oid) &&
          (!format || format === "text")
        ) {
          return (value: string) => value;
        }
        return pg.types.getTypeParser(
          oid,
          format === "binary" ? "binary" : "text",
        );
      },
    },
  };
}
