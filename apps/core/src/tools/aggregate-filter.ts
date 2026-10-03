/** Join complete group keys with a canonical filter without changing OR semantics. */
export function aggregateGroupFilter(base: object, values: Record<string, string | null>): object {
  const group = base as { logic: "and" | "or"; children: object[] };
  const keys = Object.entries(values).map(([field, value]) => {
    if (value === null) return { field, op: "isNull" };
    return { field, op: "eq", value };
  });
  return {
    logic: "and",
    children: [...(group.logic === "and" ? group.children : [group]), ...keys],
  };
}
