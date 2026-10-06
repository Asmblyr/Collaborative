import type {
  ItemFilterCondition,
  ItemFilterGroup,
} from "@asmblyr-collaborative/contracts";
export type FilterNode = ItemFilterCondition | ItemFilterGroup;
const nodes = new WeakMap<Predicate, FilterNode>();
export class Predicate {
  constructor(node: FilterNode) {
    nodes.set(this, node);
    Object.freeze(this);
  }
  and(other: Predicate): Predicate {
    return combine("and", this, other);
  }
  or(other: Predicate): Predicate {
    return combine("or", this, other);
  }
}
export function predicateNode(value: Predicate): FilterNode {
  const node = nodes.get(value);
  if (!node) {
    throw new TypeError("where must return a field predicate");
  }
  return node;
}
function combine(
  logic: "and" | "or",
  left: Predicate,
  right: Predicate,
): Predicate {
  const children = [left, right].flatMap((value) => {
    const node = predicateNode(value);
    return "logic" in node && node.logic === logic ? node.children : [node];
  });
  return new Predicate({ logic, children });
}
export function predicateGroup(value: Predicate): ItemFilterGroup {
  const node = predicateNode(value);
  return "logic" in node ? node : { logic: "and", children: [node] };
}
