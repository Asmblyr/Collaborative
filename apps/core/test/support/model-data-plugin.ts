import type { TestContext } from "node:test";
import {
  sourceEndpoints,
  importEndpoints,
} from "../../src/plugins/route-index.js";
import type { LoadedPlugin } from "../../src/plugins/definition.js";
import { modelPluginFixture } from "./model-plugin-fixture.js";

export async function modelDataPlugin(t: TestContext): Promise<LoadedPlugin> {
  const fixture = await modelPluginFixture(t);
  const input = `export interface Input {
    collection: string;
    id: string;
    field: string;
    value: string | null;
    operation: 'get' | 'list' | 'search' | 'filter' | 'update' | 'create' | 'delete' | 'commit';
  }`;
  await fixture.write("shared/input.ts", input);
  for (const [id, gate, readOnly] of [
    ["data", "authenticated", false],
    ["readonly", "authenticated", true],
    ["admin", "superuser", false],
  ] as const) {
    await fixture.write(
      `server/api/example/${id}.post.ts`,
      `
      import { AccessGate, defineHandler, defineModelAnnotation, defineModelContext, useItems } from '@asmblyr-collaborative/kit';
      import type { Input } from '../../../shared/input.ts';
      const annotation = defineModelAnnotation({title:'Data',description:'Fixture data operation',middleware:AccessGate.${gate},readOnly:${readOnly}});
      export default defineModelContext<Input>(defineHandler(async event => {
        const {collection,id,field,value,operation} = await event.req.json() as Input;
        const items = useItems(event);
        let result: unknown;
        switch(operation) {
          case 'get': result = await items.get(collection,id); break;
          case 'list': result = await items.list(collection); break;
          case 'search': result = await items.list(collection,{q:value ?? ''}); break;
          case 'filter': result = await items.list(collection,{filter:{logic:'and',children:[{field,op:'eq',value:value ?? ''}]}}); break;
          case 'update': result = await items.update(collection,id,{[field]:value}); break;
          case 'create': result = await items.create(collection,{[field]:value}); break;
          case 'delete': await items.delete(collection,id); break;
          case 'commit': result = await items.commit(collection,{id,values:{[field]:value}}); break;
        }
        return {data:JSON.stringify(result ?? null)};
      }),annotation);
    `,
    );
  }
  return {
    name: "model-data",
    capabilities: ["items.read", "items.write"],
    namespace: "example",
    definition: {},
    endpoints: await importEndpoints(
      await sourceEndpoints(fixture.root),
      "model-data",
    ),
  };
}
