import {
  defineHook,
  defineSettings,
  useSettings,
  type HookContext,
} from "../src/index.js";

const settings = defineSettings({
  title: "Example",
  fields: {
    enabled: { type: "boolean", label: "Enabled", default: true },
    length: {
      type: "number",
      label: "Length",
      default: 100,
      min: 1,
      max: 1000,
    },
  },
});

export function checkedSettings(context: HookContext) {
  const values = useSettings(context, settings);
  const enabled: boolean = values.enabled;
  const length: number = values.length;
  // @ts-expect-error Values preserve the declared field type.
  const text: string = values.length;
  // @ts-expect-error Settings snapshots are immutable.
  values.enabled = false;
  return { enabled, length, text };
}

defineHook("items.delete", (event, context) => {
  const id: string = event.itemId;
  // @ts-expect-error Hooks cannot mutate ordinary collections through items.
  context.items.delete(event.collection, id);
});

defineHook("collections.delete", (event) => {
  // @ts-expect-error A collection event has no item ID.
  const id: string = event.itemId;
  return void id;
});

// @ts-expect-error Unknown lifecycle events are rejected.
defineHook("items.drop", () => {});
