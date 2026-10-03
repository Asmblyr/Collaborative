export interface CollectionLocation { folderId: string | null; parentCollection: string | null }
export interface NavigableCollection {
  name: string;
  displayName?: string | null;
  folderId: string | null;
  parentCollection?: string | null;
}
export interface CollectionNode<T extends NavigableCollection = NavigableCollection> {
  collection: T;
  children: CollectionNode<T>[];
}

// Build only from the visible catalog: unavailable parents never hide accessible children.
export function collectionTree<T extends NavigableCollection>(collections: T[]): CollectionNode<T>[] {
  const nodes = new Map(collections.map((collection) => [collection.name, { collection, children: [] } as CollectionNode<T>]));
  const roots: CollectionNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.collection.parentCollection ?? "");
    if (parent && canNestCollection(node.collection.name, parent.collection.name, collections)) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function canNestCollection(name: string, parent: string, collections: NavigableCollection[]): boolean {
  const parents = new Map(collections.map((collection) => [collection.name, collection.parentCollection]));
  const visited = new Set([name]);
  let current: string | null | undefined = parent;
  while (current) {
    if (visited.has(current)) return false;
    visited.add(current);
    current = parents.get(current);
  }
  return true;
}

export function flattenCollections<T extends NavigableCollection>(nodes: CollectionNode<T>[], depth = 0): { collection: T; depth: number }[] {
  return nodes.flatMap((node) => [{ collection: node.collection, depth }, ...flattenCollections(node.children, depth + 1)]);
}

export function collectionLocation(collection: NavigableCollection): CollectionLocation {
  return { folderId: collection.folderId, parentCollection: collection.parentCollection ?? null };
}

export function locationValue(location: CollectionLocation): string {
  return location.parentCollection ? `collection:${location.parentCollection}` : location.folderId ? `folder:${location.folderId}` : "root";
}

export function locationFromValue(value: string): CollectionLocation {
  return { folderId: value.startsWith("folder:") ? value.slice(7) : null,
    parentCollection: value.startsWith("collection:") ? value.slice(11) : null };
}
