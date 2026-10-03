import type { Knex } from "knex";

export async function securityEvent(
  database: Knex,
  actorId: string,
  action: string,
  subjectId: string,
  details: Record<string, unknown> = {},
) {
  await database("asmblyr_security_events")
    .withSchema("public")
    .insert({
      actor_id: actorId,
      action,
      subject_id: subjectId,
      details: JSON.stringify(details),
    });
}
