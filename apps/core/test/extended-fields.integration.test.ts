import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { featureFixture } from "./support/feature-fixture.js";

test("extended fields: precision, choices, file grants and live references", async (t) => {
  const f = await featureFixture(),
    name = `${f.prefix}_fields`;
  f.names.push(name);
  const { call, db, memberHeaders } = f;
  try {
    await call(
      "POST",
      "/collections",
      {
        name,
        fields: [
          {
            name: "price",
            type: "decimal",
            defaultValue: "12345678901234567890.1234567890",
          },
          { name: "details", type: "json", defaultValue: { nested: ["a", 2] } },
          { name: "status", type: "text", defaultValue: "draft" },
          { name: "tags", type: "json", required: true, defaultValue: ["a"] },
          { name: "cover", type: "file" },
          { name: "gallery", type: "files" },
        ],
      },
      201,
    );
    const choices = {
      options: [
        { value: "draft", label: "Draft" },
        { value: "live", label: "Live" },
      ],
    };
    await call("PUT", `/collections/${name}/fields/status/presentation`, {
      interface: "select",
      ...choices,
    });
    await call("PUT", `/collections/${name}/fields/tags/presentation`, {
      interface: "multiselect",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    const item = await call("POST", `/items/${name}`, {}, 201);
    await t.test(
      "decimal roundtrip never loses precision; defaults and JSON arrays are real values",
      async () => {
        assert.equal(item.price, "12345678901234567890.1234567890");
        assert.deepEqual(item.details, { nested: ["a", 2] });
        assert.deepEqual(item.tags, ["a"]);
        const updated = await call("PATCH", `/items/${name}/${item.id}`, {
          price: "-0.00",
          details: ["nested", { ok: true }],
        });
        assert.equal(updated.price, "0.0000000000");
        assert.deepEqual(updated.details, ["nested", { ok: true }]);
        for (const price of [
          "1e5",
          "0001",
          "1.12345678901",
          "123456789012345678901",
        ])
          await call("PATCH", `/items/${name}/${item.id}`, { price }, 400);
        const filter = encodeURIComponent(
          JSON.stringify([{ field: "price", op: "gte", value: "0" }]),
        );
        assert.equal(
          (
            await f.app.inject({
              method: "GET",
              url: `/items/${name}?filter=${filter}`,
            })
          ).json().page.total,
          "1",
        );
      },
    );
    await t.test(
      "choices validate API/default changes while required and nullable remain separate",
      async () => {
        await call(
          "PATCH",
          `/items/${name}/${item.id}`,
          { status: "missing" },
          400,
        );
        await call(
          "PATCH",
          `/items/${name}/${item.id}`,
          { tags: ["a", "a"] },
          400,
        );
        await call("PATCH", `/items/${name}/${item.id}`, { tags: [] }, 400);
        await call("PATCH", `/items/${name}/${item.id}`, { tags: null }, 400);
        await call(
          "PATCH",
          `/collections/${name}/fields/status`,
          { defaultValue: "missing" },
          400,
        );
        await call(
          "PATCH",
          `/collections/${name}/fields/tags`,
          { defaultValue: [] },
          400,
        );
        await call(
          "PUT",
          `/collections/${name}/fields/status/presentation`,
          { interface: "select", options: [{ value: "live", label: "Live" }] },
          400,
        );
        await call("PATCH", `/items/${name}/${item.id}`, {
          tags: ["a", "b"],
          status: "live",
        });
      },
    );
    const uploaded = await f.app.inject({
      method: "POST",
      url: "/files",
      headers: {
        ...f.adminHeaders,
        "content-type": "application/octet-stream",
        "x-file-name": `${f.prefix}.txt`,
      },
      payload: Buffer.from("fixture bytes"),
    });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const fileId = uploaded.json().data.id;
    const readPolicy = await f.grant(name, "read", [
      "status",
      "cover",
      "gallery",
    ]);
    await f.grant(name, "update", ["cover", "gallery"]);
    await t.test(
      "attached files can be read by field grant but cannot be arbitrarily selected or deleted",
      async () => {
        await call("GET", `/files/${fileId}`, undefined, 404, memberHeaders);
        await call(
          "PATCH",
          `/items/${name}/${item.id}`,
          { cover: fileId },
          403,
          memberHeaders,
        );
        await call("PATCH", `/items/${name}/${item.id}`, {
          cover: fileId,
          gallery: [fileId],
        });
        assert.equal(
          (await call("GET", `/files/${fileId}`, undefined, 200, memberHeaders))
            .id,
          fileId,
        );
        const resolved = await call(
          "GET",
          `/files/resolve?ids=${fileId},${randomUUID()}`,
          undefined,
          200,
          memberHeaders,
        );
        assert.equal(resolved.length, 1);
        const content = await f.app.inject({
          method: "GET",
          url: `/files/${fileId}/content`,
          headers: memberHeaders,
        });
        assert.equal(content.statusCode, 200);
        assert.equal(content.body, "fixture bytes");
        await call("DELETE", `/files/${fileId}`, undefined, 409);
        await call("GET", "/files", undefined, 403, memberHeaders);
        await call(
          "PATCH",
          `/items/${name}/${item.id}`,
          { gallery: [] },
          200,
          memberHeaders,
        );
        await call(
          "DELETE",
          `/policies/${readPolicy}/users/${f.member.id}`,
          undefined,
          204,
        );
        await call("GET", `/files/${fileId}`, undefined, 404, memberHeaders);
        await call(
          "PATCH",
          `/items/${name}/${item.id}`,
          { cover: null },
          200,
          memberHeaders,
        );
      },
    );
    await t.test(
      "deletion checks actual SQL rows and repairs stale cache references",
      async () => {
        await db(name)
          .where({ id: item.id })
          .update({ gallery: JSON.stringify([fileId]) });
        await call("DELETE", `/files/${fileId}`, undefined, 409);
        await db(name)
          .where({ id: item.id })
          .update({ gallery: JSON.stringify([]) });
        await call("DELETE", `/files/${fileId}`, undefined, 204);
      },
    );
  } finally {
    await f.close();
  }
});
