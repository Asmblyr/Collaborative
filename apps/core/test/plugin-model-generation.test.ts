import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { modelValidator } from "@asmblyr-collaborative/kit/model";
import {
  sourceEndpoints,
  builtEndpoints,
  importEndpoints,
} from "../src/plugins/route-index.js";
import { modelPluginFixture } from "./support/model-plugin-fixture.js";

const handler = `
import { defineModelContext as model, defineModelAnnotation, AccessGate, defineHandler } from '@asmblyr-collaborative/kit';
import type { Input } from '../../../shared/input.ts';
const annotation = defineModelAnnotation({title:'Example',description:'Example model',middleware:AccessGate.authenticated});
export default model<Input>(defineHandler(async () => ({ total: 42, currency: 'RUB' as const })), annotation);
`;
const input = `export interface Input {
  /** Number of seats.
   * @title Seats
   * @integer
   * @minimum 1
   * @maximum 5
   */
  seats: number;
  label: string | null;
  nested: { tags: readonly string[]; enabled: boolean };
}`;

test("model builder resolves imported aliases, infers results and shares strict runtime schemas with source", async (t) => {
  const fixture = await modelPluginFixture(t);
  await fixture.write("shared/input.ts", input);
  await fixture.write("server/api/example/calculate.post.ts", handler);
  await fixture.build();
  const index = path.join(fixture.root, "dist/routes.json");
  const built = await builtEndpoints(pathToFileURL(index), "example");
  const source = await sourceEndpoints(fixture.root);
  assert.deepEqual(source[0].model, built[0].model);
  const model = source[0].model!;
  assert.equal(model.id, "calculate");
  assert.deepEqual(model.outputSchema.properties, {
    total: { type: "number" },
    currency: { type: "string", const: "RUB" },
  });
  const validator = modelValidator(model.inputSchema);
  const valid = {
    seats: 2,
    label: null,
    nested: { tags: ["a"], enabled: true },
  };
  assert.deepEqual(validator.parse(valid), valid);
  for (const invalid of [
    { ...valid, seats: 0 },
    { ...valid, seats: 6 },
    { ...valid, seats: 1.5 },
    { ...valid, admin: true },
    { ...valid, label: undefined },
    { ...valid, nested: { ...valid.nested, extra: true } },
  ])
    assert.equal(validator.safeParse(invalid).success, false);

  const endpoints = await importEndpoints(source, "example");
  const action = endpoints[0].handler.meta!.asmblyr!;
  assert.deepEqual(action.inputSchema.properties.seats, {
    type: "integer",
    title: "Seats",
    description: "Number of seats.",
    minimum: 1,
    maximum: 5,
  });
  assert.throws(() => action.parseOutput({ total: 42, currency: "USD" }));
  assert.deepEqual(action.parseInput(valid), valid);

  // Development regenerates schemas from current TS, including shared type edits.
  await fixture.write(
    "shared/input.ts",
    input.replace("@maximum 5", "@maximum 10"),
  );
  const changed = await sourceEndpoints(fixture.root);
  assert.equal(
    modelValidator(changed[0].model!.inputSchema).safeParse({
      ...valid,
      seats: 8,
    }).success,
    true,
  );
  const generated = JSON.parse(
    await readFile(
      path.join(fixture.root, ".asmblyr/models/example/calculate.post.json"),
      "utf8",
    ),
  );
  assert.deepEqual(generated, changed[0].model);

  // Type errors do not replace the last working production output.
  const previous = await readFile(index, "utf8");
  await fixture.write(
    "shared/input.ts",
    "export interface Input { value: any }",
  );
  await assert.rejects(fixture.build(), /Unsupported model type/);
  assert.equal(await readFile(index, "utf8"), previous);
  await rm(path.join(fixture.root, "server/api/example/calculate.post.ts"));
  assert.deepEqual(await sourceEndpoints(fixture.root), []);
});

test("unsupported types, constraints and non-POST model routes fail closed", async (t) => {
  const fixture = await modelPluginFixture(t);
  await fixture.write("server/api/example/calculate.post.ts", handler);
  for (const [body, expected] of [
    ["value?: string", /must be required/],
    ["value: Date", /Unsupported model type|must describe JSON/],
    ["value: unknown", /Unsupported model type/],
    ["value: Input", /Recursive model/],
    ["[key: string]: string", /keys must be explicit/],
    ["/** @minimum 0 */ value: string", /requires a number/],
    ["/** @minimun 0 */ value: number", /Unsupported model annotation/],
  ] as const) {
    await fixture.write(
      "shared/input.ts",
      `export interface Input {\n${body}\n}`,
    );
    await assert.rejects(sourceEndpoints(fixture.root), expected, body);
  }
  await fixture.write("shared/input.ts", input);
  await fixture.write(
    "server/api/example/calculate.post.ts",
    `${handler}\nconst invalid: string = 42;`,
  );
  await assert.rejects(sourceEndpoints(fixture.root), /not assignable/);
  await fixture.write("server/api/example/calculate.post.ts", handler);
  await fixture.write("server/api/example/other.get.ts", handler);
  await assert.rejects(sourceEndpoints(fixture.root), /static .post.ts/);
});
