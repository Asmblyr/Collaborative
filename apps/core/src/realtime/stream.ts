import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type {
  PresenceScope,
  RealtimeEvent,
} from "@asmblyr-collaborative/contracts";
import { loadAccess, requireGrant } from "../permissions/access.js";
import { presenceKey } from "../presence/access.js";
import { parsePresenceInput } from "../presence/input.js";
import { leavePresence, touchPresence } from "../presence/repository.js";
import { ItemError } from "../items/validation.js";
import { getItem } from "../items/service.js";
import { releaseClientLocks } from "./locks.js";
import type { RealtimeBus } from "./bus.js";
import { realtimeEvent } from "./publish.js";

const streamHeartbeatMs = 15_000;
const presenceRenewalMs = 20_000;

function sameScope(left: PresenceScope, right: PresenceScope): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function registerRealtimeStream(
  app: FastifyInstance,
  database: Knex | null,
  bus: RealtimeBus,
): void {
  function db(): Knex {
    if (!database) {
      throw new ItemError("Database is not configured", 503);
    }
    return database;
  }

  app.get<{ Querystring: { clientId?: string; scope?: string } }>(
    "/realtime/stream",
    async (request, reply) => {
      if (!request.query.scope || request.query.scope.length > 1024) {
        throw new ItemError("Invalid realtime scope", 400);
      }
      let scope: PresenceScope;
      try {
        scope = parsePresenceInput({
          clientId: request.query.clientId,
          scope: JSON.parse(request.query.scope),
        }).scope;
      } catch (error) {
        if (error instanceof ItemError) {
          throw error;
        }
        throw new ItemError("Invalid realtime scope", 400);
      }
      const clientId = request.query.clientId!;
      const authorization = request.headers.authorization;
      let access = await loadAccess(db(), authorization);
      if (access.principal.kind !== "user") {
        throw new ItemError("Human session required", 403);
      }
      const principal = access.principal;
      const connectionId = randomUUID();
      const openedAt = Date.now();
      let sent = 0;
      const key = await presenceKey(db(), access, scope);
      let initialLocks: RealtimeEvent[] = [];
      if (scope.kind === "record") {
        const collection = scope.collection;
        const [, collectionId, recordId] = JSON.parse(key) as [
          string,
          string,
          string,
        ];
        scope = { ...scope, id: recordId };
        const visible = await getItem(
          db(),
          scope.collection,
          recordId,
          requireGrant(access, scope.collection, "read"),
          undefined,
          access,
        );
        const rows = await db()("public.asmblyr_field_locks as lock")
          .join(
            "public.asmblyr_auth_sessions as session",
            "session.id",
            "lock.session_id",
          )
          .join("public.asmblyr_users as usr", "usr.id", "lock.user_id")
          .where({
            "lock.collection_id": collectionId,
            "lock.record_id": recordId,
            "usr.status": "active",
          })
          .where("lock.expires_at", ">", db().fn.now())
          .whereNull("session.revoked_at")
          .where("session.expires_at", ">", db().fn.now())
          .select(
            "lock.field",
            "lock.user_id",
            "lock.expires_at",
            "usr.display_name",
          );
        initialLocks = rows
          .filter((row) => Object.hasOwn(visible, row.field))
          .map((row) =>
            realtimeEvent(
              "field.locked",
              { kind: "user", id: row.user_id },
              {
                collection,
                recordId,
                field: row.field,
                holder: {
                  id: row.user_id,
                  displayName: row.display_name || "Участник",
                },
                expiresAt: row.expires_at.toISOString(),
              },
            ),
          );
      }
      const initial = await touchPresence(db(), principal, clientId, key);

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      });
      reply.raw.flushHeaders();
      let closed = false;
      let pending = 0;
      function send(event: RealtimeEvent): void {
        if (closed || reply.raw.writableLength > 256_000) {
          stop();
          return;
        }
        reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
        sent += 1;
      }
      function sendPresence(result: typeof initial): void {
        send(
          realtimeEvent("presence.changed", null, {
            scope,
            participants: result.data.participants,
            total: result.data.total,
          }),
        );
      }
      const unsubscribe = bus.subscribe(scope, (event) => {
        if (closed || pending >= 32) {
          if (pending >= 32) stop();
          return;
        }
        pending += 1;
        void deliver(event).finally(() => {
          pending -= 1;
        });
      });
      async function deliver(event: RealtimeEvent): Promise<void> {
        try {
          access = await loadAccess(db(), authorization);
          if (
            access.principal.kind !== "user" ||
            access.principal.sessionId !== principal.sessionId
          ) {
            stop();
            return;
          }
          if (event.type === "presence.changed") {
            if (sameScope(scope, event.payload.scope)) {
              await presenceKey(db(), access, scope);
              sendPresence(await touchPresence(db(), principal, clientId, key));
            }
            return;
          }
          if (
            event.type === "collection.changed" &&
            event.payload.collection === ""
          ) {
            stop();
            return;
          }
          if (scope.kind === "page" || event.type === "collection.changed") {
            return;
          }
          if (event.payload.collection !== scope.collection) {
            return;
          }
          if (scope.kind === "collection") {
            await presenceKey(db(), access, scope);
            if (
              event.type === "record.deleted" &&
              access.rowRules?.has(`${scope.collection}:read`)
            ) {
              return;
            }
            if (event.type !== "record.deleted") {
              try {
                await getItem(
                  db(),
                  scope.collection,
                  event.payload.recordId,
                  requireGrant(access, scope.collection, "read"),
                  undefined,
                  access,
                );
              } catch (error) {
                if (error instanceof ItemError && error.statusCode === 404) {
                  return;
                }
                throw error;
              }
            }
            send(
              realtimeEvent("collection.changed", event.actor, {
                collection: scope.collection,
              }),
            );
            return;
          }
          if (event.payload.recordId !== scope.id) {
            return;
          }
          if (event.type === "record.deleted") {
            // Deleted rows cannot be checked against conditional row grants.
            requireGrant(access, scope.collection, "read");
            if (!access.rowRules?.has(`${scope.collection}:read`)) {
              send(event);
            }
            return;
          }
          await presenceKey(db(), access, scope);
          const readable = requireGrant(access, scope.collection, "read");
          const visible = await getItem(
            db(),
            scope.collection,
            scope.id,
            readable,
            undefined,
            access,
          );
          if (
            event.type === "record.updated" ||
            event.type === "record.created"
          ) {
            const changedFields = event.payload.changedFields.filter((field) =>
              Object.hasOwn(visible, field),
            );
            send({ ...event, payload: { ...event.payload, changedFields } });
          } else if (Object.hasOwn(visible, event.payload.field)) {
            send(event);
          }
        } catch {
          stop();
        }
      }
      function stop(): void {
        if (closed) {
          return;
        }
        closed = true;
        request.log.info(
          {
            connectionId,
            userId: principal.id,
            collection: scope.kind === "page" ? null : scope.collection,
            scope: scope.kind,
            sent,
            durationMs: Date.now() - openedAt,
          },
          "Realtime connection closed",
        );
        unsubscribe();
        clearInterval(heartbeat);
        clearInterval(renewal);
        reply.raw.end();
        void releaseClientLocks(db(), principal.sessionId, clientId).catch(
          () => undefined,
        );
        void leavePresence(db(), principal.sessionId, clientId)
          .then(() =>
            bus.publish(
              realtimeEvent("presence.changed", null, {
                scope,
                participants: [],
                total: 0,
              }),
            ),
          )
          .catch(() => undefined);
      }
      const heartbeat = setInterval(() => {
        if (!closed) reply.raw.write(": heartbeat\n\n");
      }, streamHeartbeatMs);
      const renewal = setInterval(() => {
        void loadAccess(db(), authorization)
          .then((fresh) => {
            if (
              fresh.principal.kind !== "user" ||
              fresh.principal.sessionId !== principal.sessionId
            ) {
              stop();
              return;
            }
            return presenceKey(db(), fresh, scope).then(() =>
              touchPresence(db(), principal, clientId, key),
            );
          })
          .catch(stop);
      }, presenceRenewalMs);
      reply.raw.on("close", stop);
      request.log.info(
        {
          connectionId,
          userId: principal.id,
          collection: scope.kind === "page" ? null : scope.collection,
          scope: scope.kind,
        },
        "Realtime connection opened",
      );
      sendPresence(initial);
      for (const lock of initialLocks) send(lock);
      void bus
        .publish(
          realtimeEvent("presence.changed", null, {
            scope,
            participants: [],
            total: 0,
          }),
        )
        .catch(() => stop());
    },
  );
}
