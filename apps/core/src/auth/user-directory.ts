import type { Knex } from "knex";
import { listCollections } from "../collections/catalog-repository.js";
import type { Collection } from "../collections/types.js";
import { itemLabel, itemLabelField } from "../items/item-label.js";
import { customFields } from "../system-collections/repository.js";
import { profileExtensionBinding } from "./profile-extension-config.js";
import { normalizeSearchText } from "./user-references.js";
import type { UsersListQuery } from "./validation.js";

const safeIdentifier = /^[a-z][a-z0-9_]{0,62}$/;
const searchableScalarTypes = new Set([
  "text",
  "email",
  "integer",
  "bigint",
  "decimal",
  "date",
  "datetime",
]);

export interface UserDirectoryRow {
  id: string;
  email: string;
  status: string;
  superuser: boolean;
  created_at: Date;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  description: string | null;
  avatarId: string | null;
  pictureUrl: string | null;
  lastLoginAt: Date | null;
  lastActiveAt: Date | null;
  hasPassword: boolean;
  invitationPending: boolean;
  hasDelegation: boolean;
  department: string | null;
  policyIds: string[];
}

export interface UsersStatusCounts {
  all: number;
  active: number;
  disabled: number;
  invited: number;
}

export interface UsersDirectoryMeta {
  total: number;
  page: number;
  limit: number;
  statusCounts: UsersStatusCounts;
  departments: string[];
}

export interface UsersDirectoryPage {
  data: UserDirectoryRow[];
  meta: UsersDirectoryMeta;
}

interface ResolvedRelationField {
  column: string;
  labelsById: Map<string, string>;
}

interface DepartmentSource {
  location: "users" | "extension";
  table: string;
  keyColumn: string;
  column: string;
  labelsById: Map<string, string> | null;
}

interface ExtensionMetadata {
  table: string;
  keyColumn: string;
  scalarColumns: string[];
  relationFields: ResolvedRelationField[];
}

interface CustomProfileContext {
  userScalarColumns: string[];
  userRelationFields: ResolvedRelationField[];
  extension: ExtensionMetadata | null;
  departmentSource: DepartmentSource | null;
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function sortDepartmentLabels(labels: Iterable<string>): string[] {
  const unique = new Set<string>();
  for (const label of labels) {
    const trimmed = label.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  }
  return [...unique].sort((left, right) =>
    normalizeSearchText(left).localeCompare(normalizeSearchText(right), "ru", {
      sensitivity: "base",
    }),
  );
}

function preferredLabelColumn(collection: Collection): string {
  const named = collection.fields.find(
    (field) =>
      (field.name === "name" || field.name === "title") &&
      (field.type === "text" || field.type === "email") &&
      !field.presentation?.sensitive,
  );
  if (named) {
    return named.name;
  }
  return itemLabelField(
    collection.primaryKey.name,
    collection.fields.filter((field) => !field.presentation?.sensitive),
    undefined,
    ["*"],
  );
}

async function loadRelationLabels(
  database: Knex,
  targetCollection: string,
  catalogByName: Map<string, Collection>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (targetCollection === "@users") {
    const rows = await database("public.asmblyr_users").select<
      {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string;
      }[]
    >("id", "display_name", "first_name", "last_name", "email");
    for (const row of rows) {
      const label =
        row.display_name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        row.email;
      map.set(String(row.id), label);
    }
    return map;
  }
  const collection = catalogByName.get(targetCollection);
  if (
    !collection ||
    !safeIdentifier.test(collection.name) ||
    !safeIdentifier.test(collection.primaryKey.name)
  ) {
    return map;
  }
  const labelCol = preferredLabelColumn(collection);
  if (!safeIdentifier.test(labelCol)) {
    return map;
  }
  const columns =
    labelCol === collection.primaryKey.name
      ? [collection.primaryKey.name]
      : [collection.primaryKey.name, labelCol];
  const rows = await database(collection.name)
    .withSchema("public")
    .select<Record<string, unknown>[]>(columns);
  for (const row of rows) {
    const id = row[collection.primaryKey.name];
    if (id === null || id === undefined) {
      continue;
    }
    map.set(String(id), itemLabel(row[labelCol], id));
  }
  return map;
}

function isDepartmentFieldName(
  fieldName: string,
  relationCollection?: string,
): boolean {
  const lower = fieldName.toLowerCase();
  return (
    lower === "department" ||
    lower === "department_id" ||
    relationCollection?.toLowerCase() === "departments"
  );
}

async function loadCustomProfileContext(
  database: Knex,
): Promise<CustomProfileContext> {
  const empty: CustomProfileContext = {
    userScalarColumns: [],
    userRelationFields: [],
    extension: null,
    departmentSource: null,
  };
  let userFields: Awaited<ReturnType<typeof customFields>> = [];
  try {
    userFields = await customFields(database, "users").select(
      "collection_name",
      "field_name",
      "definition",
      "presentation",
    );
  } catch {
    userFields = [];
  }

  let extensionBinding: Awaited<ReturnType<typeof profileExtensionBinding>> =
    null;
  try {
    extensionBinding = await profileExtensionBinding(database);
  } catch {
    extensionBinding = null;
  }

  const needsCatalog =
    Boolean(extensionBinding) ||
    userFields.some((field) => field.definition?.relation?.kind === "m2o");
  const catalogByName = new Map<string, Collection>();
  if (needsCatalog) {
    try {
      const catalog = await listCollections(database);
      for (const collection of catalog) {
        catalogByName.set(collection.name, collection);
      }
    } catch {
      // Minimal or mocked database without collection catalog metadata.
    }
  }

  const labelCache = new Map<string, Map<string, string>>();
  async function relationLabelsFor(
    target: string,
  ): Promise<Map<string, string>> {
    const cached = labelCache.get(target);
    if (cached) {
      return cached;
    }
    try {
      const loaded = await loadRelationLabels(database, target, catalogByName);
      labelCache.set(target, loaded);
      return loaded;
    } catch {
      const fallback = new Map<string, string>();
      labelCache.set(target, fallback);
      return fallback;
    }
  }

  const userScalarColumns: string[] = [];
  const userRelationFields: ResolvedRelationField[] = [];
  let departmentSource: DepartmentSource | null = null;

  for (const field of userFields) {
    if (
      field.presentation?.sensitive ||
      !safeIdentifier.test(field.field_name)
    ) {
      continue;
    }
    const relation = field.definition?.relation;
    if (relation?.kind === "m2o" && relation.collection) {
      const labelsById = await relationLabelsFor(relation.collection);
      userRelationFields.push({ column: field.field_name, labelsById });
      if (
        !departmentSource &&
        isDepartmentFieldName(field.field_name, relation.collection)
      ) {
        departmentSource = {
          location: "users",
          table: "asmblyr_users",
          keyColumn: "id",
          column: field.field_name,
          labelsById,
        };
      }
    } else if (searchableScalarTypes.has(field.definition?.type ?? "")) {
      userScalarColumns.push(field.field_name);
      if (!departmentSource && isDepartmentFieldName(field.field_name)) {
        departmentSource = {
          location: "users",
          table: "asmblyr_users",
          keyColumn: "id",
          column: field.field_name,
          labelsById: null,
        };
      }
    }
  }

  let extension: ExtensionMetadata | null = null;
  if (
    extensionBinding &&
    safeIdentifier.test(extensionBinding.collection) &&
    safeIdentifier.test(extensionBinding.key)
  ) {
    const extCollection = catalogByName.get(extensionBinding.collection);
    if (extCollection) {
      const scalarColumns: string[] = [];
      const relationFields: ResolvedRelationField[] = [];
      for (const field of extCollection.fields) {
        if (
          field.presentation?.sensitive ||
          !safeIdentifier.test(field.name) ||
          field.name === extensionBinding.key
        ) {
          continue;
        }
        if (field.relation?.kind === "m2o" && field.relation.collection) {
          const labelsById = await relationLabelsFor(field.relation.collection);
          relationFields.push({ column: field.name, labelsById });
          if (
            !departmentSource &&
            isDepartmentFieldName(field.name, field.relation.collection)
          ) {
            departmentSource = {
              location: "extension",
              table: extensionBinding.collection,
              keyColumn: extensionBinding.key,
              column: field.name,
              labelsById,
            };
          }
        } else if (searchableScalarTypes.has(field.type)) {
          scalarColumns.push(field.name);
          if (!departmentSource && isDepartmentFieldName(field.name)) {
            departmentSource = {
              location: "extension",
              table: extensionBinding.collection,
              keyColumn: extensionBinding.key,
              column: field.name,
              labelsById: null,
            };
          }
        }
      }
      extension = {
        table: extensionBinding.collection,
        keyColumn: extensionBinding.key,
        scalarColumns,
        relationFields,
      };
    }
  }

  return {
    ...empty,
    userScalarColumns,
    userRelationFields,
    extension,
    departmentSource,
  };
}

function baseUsersQuery(
  database: Knex,
  departmentSource: DepartmentSource | null,
) {
  const selectColumns: (string | Knex.Raw)[] = [
    "usr.id",
    "usr.email",
    "usr.status",
    "usr.superuser",
    "usr.created_at",
    "usr.first_name as firstName",
    "usr.last_name as lastName",
    "usr.display_name as displayName",
    "usr.description",
    "usr.avatar_id as avatarId",
    "usr.picture_url as pictureUrl",
    "usr.last_login_at as lastLoginAt",
    "usr.last_active_at as lastActiveAt",
    database.raw("credential.user_id IS NOT NULL AS ??", ["hasPassword"]),
    database.raw(
      "EXISTS (SELECT 1 FROM public.asmblyr_user_invitations WHERE user_id = usr.id AND consumed_at IS NULL) AS ??",
      ["invitationPending"],
    ),
    database.raw(
      "EXISTS (SELECT 1 FROM public.asmblyr_user_policy_delegations WHERE user_id = usr.id) AS ??",
      ["hasDelegation"],
    ),
  ];
  if (departmentSource?.location === "users") {
    selectColumns.push(`usr.${departmentSource.column} as _departmentRaw`);
  }
  return database("asmblyr_users as usr")
    .withSchema("public")
    .leftJoin(
      "asmblyr_password_credentials as credential",
      "credential.user_id",
      "usr.id",
    )
    .select(selectColumns);
}

function resolveDepartmentValue(
  rawValue: unknown,
  source: DepartmentSource | null,
): string | null {
  if (!source || rawValue === null || rawValue === undefined) {
    return null;
  }
  const asString = String(rawValue).trim();
  if (!asString) {
    return null;
  }
  if (source.labelsById) {
    return source.labelsById.get(asString) ?? null;
  }
  return asString;
}

async function loadExtensionDepartmentMap(
  database: Knex,
  source: DepartmentSource,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (!userIds.length) {
    return result;
  }
  const rows = await database(source.table)
    .withSchema("public")
    .whereIn(source.keyColumn, userIds)
    .select<Record<string, unknown>[]>([source.keyColumn, source.column]);
  for (const row of rows) {
    const userId = row[source.keyColumn];
    if (typeof userId === "string") {
      result.set(userId, resolveDepartmentValue(row[source.column], source));
    }
  }
  return result;
}

async function listDistinctDepartments(
  database: Knex,
  source: DepartmentSource | null,
): Promise<string[]> {
  if (!source) {
    return [];
  }
  try {
    const rows = await database(source.table)
      .withSchema("public")
      .whereNotNull(source.column)
      .distinct<Record<string, unknown>[]>(source.column);
    const labels: string[] = [];
    for (const row of rows) {
      const label = resolveDepartmentValue(row[source.column], source);
      if (label) {
        labels.push(label);
      }
    }
    return sortDepartmentLabels(labels);
  } catch {
    return [];
  }
}

async function attachPoliciesAndDepartments(
  database: Knex,
  rawRows: (Omit<UserDirectoryRow, "department" | "policyIds"> & {
    _departmentRaw?: unknown;
  })[],
  departmentSource: DepartmentSource | null,
): Promise<UserDirectoryRow[]> {
  if (!rawRows.length) {
    return [];
  }
  const userIds = rawRows.map((row) => row.id);
  const [assignments, extensionDepartments] = await Promise.all([
    database("asmblyr_user_policies")
      .withSchema("public")
      .whereIn("user_id", userIds)
      .select<{ user_id: string; policy_id: string }[]>("user_id", "policy_id"),
    departmentSource?.location === "extension"
      ? loadExtensionDepartmentMap(database, departmentSource, userIds)
      : Promise.resolve(new Map<string, string | null>()),
  ]);

  const policyMap = new Map<string, string[]>();
  for (const assignment of assignments) {
    const list = policyMap.get(assignment.user_id) ?? [];
    list.push(assignment.policy_id);
    policyMap.set(assignment.user_id, list);
  }

  return rawRows.map((row) => {
    const { _departmentRaw, ...rest } = row;
    const department =
      departmentSource?.location === "users"
        ? resolveDepartmentValue(_departmentRaw, departmentSource)
        : departmentSource?.location === "extension"
          ? (extensionDepartments.get(row.id) ?? null)
          : null;
    return {
      ...rest,
      department,
      policyIds: policyMap.get(row.id) ?? [],
    };
  });
}

function applyDirectoryFilters(
  queryBuilder: Knex.QueryBuilder,
  database: Knex,
  query: UsersListQuery,
  context: CustomProfileContext,
): void {
  if (query.status === "disabled") {
    queryBuilder.where("usr.status", "disabled");
  } else if (query.status === "invited") {
    queryBuilder
      .whereNot("usr.status", "disabled")
      .where("usr.superuser", false)
      .whereNull("credential.user_id")
      .whereRaw(
        "EXISTS (SELECT 1 FROM public.asmblyr_user_invitations WHERE user_id = usr.id AND consumed_at IS NULL)",
      );
  } else if (query.status === "active") {
    queryBuilder
      .whereNot("usr.status", "disabled")
      .whereRaw(
        "(usr.superuser = true OR credential.user_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM public.asmblyr_user_invitations WHERE user_id = usr.id AND consumed_at IS NULL))",
      );
  }

  if (query.policyId === "__none__") {
    queryBuilder.whereNotExists(function noPolicies() {
      this.select(database.raw("1"))
        .from("public.asmblyr_user_policies as up")
        .whereRaw("up.user_id = usr.id");
    });
  } else if (query.policyId) {
    const targetPolicyId = query.policyId;
    queryBuilder.whereExists(function hasPolicy() {
      this.select(database.raw("1"))
        .from("public.asmblyr_user_policies as up")
        .whereRaw("up.user_id = usr.id")
        .where("up.policy_id", targetPolicyId);
    });
  }

  if (query.department) {
    const source = context.departmentSource;
    if (!source) {
      queryBuilder.whereRaw("FALSE");
    } else if (source.location === "users") {
      if (source.labelsById) {
        const matchingIds = [...source.labelsById.entries()]
          .filter(([, label]) => label === query.department)
          .map(([id]) => id);
        if (matchingIds.length) {
          queryBuilder.whereIn(`usr.${source.column}`, matchingIds);
        } else {
          queryBuilder.whereRaw("FALSE");
        }
      } else {
        queryBuilder.whereRaw("btrim(coalesce(usr.??::text, '')) = ?", [
          source.column,
          query.department,
        ]);
      }
    } else {
      if (source.labelsById) {
        const matchingIds = [...source.labelsById.entries()]
          .filter(([, label]) => label === query.department)
          .map(([id]) => id);
        if (matchingIds.length) {
          queryBuilder.whereExists(function hasExtDept() {
            this.select(database.raw("1"))
              .from(`public.${source.table} as ext`)
              .whereRaw("ext.?? = usr.id", [source.keyColumn])
              .whereIn(`ext.${source.column}`, matchingIds);
          });
        } else {
          queryBuilder.whereRaw("FALSE");
        }
      } else {
        queryBuilder.whereExists(function hasExtDeptScalar() {
          this.select(database.raw("1"))
            .from(`public.${source.table} as ext`)
            .whereRaw("ext.?? = usr.id", [source.keyColumn])
            .whereRaw("btrim(coalesce(ext.??::text, '')) = ?", [
              source.column,
              query.department,
            ]);
        });
      }
    }
  }

  const normalizedQuery = normalizeSearchText(query.q);
  if (normalizedQuery) {
    const search = `%${escapeLikePattern(normalizedQuery)}%`;
    queryBuilder.where((builder) => {
      for (const column of [
        "usr.email",
        "usr.display_name",
        "usr.first_name",
        "usr.last_name",
        "usr.description",
      ]) {
        builder.orWhereRaw(
          `replace(lower(coalesce(??, '')), 'ё', 'е') like ? escape '\\'`,
          [column, search],
        );
      }
      builder.orWhereRaw(
        `replace(lower(concat_ws(' ', coalesce(usr.first_name, ''), coalesce(usr.last_name, ''))), 'ё', 'е') like ? escape '\\'`,
        [search],
      );
      builder.orWhereExists(function matchingPolicyName() {
        this.select(database.raw("1"))
          .from("public.asmblyr_user_policies as up")
          .join("public.asmblyr_policies as pol", "pol.id", "up.policy_id")
          .whereRaw("up.user_id = usr.id")
          .whereRaw(
            `replace(lower(coalesce(pol.name, '')), 'ё', 'е') like ? escape '\\'`,
            [search],
          );
      });
      for (const column of context.userScalarColumns) {
        builder.orWhereRaw(
          `replace(lower(coalesce(usr.??::text, '')), 'ё', 'е') like ? escape '\\'`,
          [column, search],
        );
      }
      for (const relation of context.userRelationFields) {
        const matchingIds = [...relation.labelsById.entries()]
          .filter(([, label]) =>
            normalizeSearchText(label).includes(normalizedQuery),
          )
          .map(([id]) => id);
        if (matchingIds.length) {
          builder.orWhereIn(`usr.${relation.column}`, matchingIds);
        }
      }
      if (
        context.extension &&
        (context.extension.scalarColumns.length ||
          context.extension.relationFields.length)
      ) {
        const ext = context.extension;
        const matchingExtRelations = ext.relationFields
          .map((relation) => ({
            column: relation.column,
            ids: [...relation.labelsById.entries()]
              .filter(([, label]) =>
                normalizeSearchText(label).includes(normalizedQuery),
              )
              .map(([id]) => id),
          }))
          .filter((entry) => entry.ids.length > 0);
        if (ext.scalarColumns.length || matchingExtRelations.length) {
          builder.orWhereExists(function matchingExtension() {
            this.select(database.raw("1"))
              .from(`public.${ext.table} as ext`)
              .whereRaw("ext.?? = usr.id", [ext.keyColumn])
              .where((extWhere) => {
                for (const column of ext.scalarColumns) {
                  extWhere.orWhereRaw(
                    `replace(lower(coalesce(ext.??::text, '')), 'ё', 'е') like ? escape '\\'`,
                    [column, search],
                  );
                }
                for (const relation of matchingExtRelations) {
                  extWhere.orWhereIn(`ext.${relation.column}`, relation.ids);
                }
              });
          });
        }
      }
    });
  }
}

export async function listAllUsers(
  database: Knex,
): Promise<UserDirectoryRow[]> {
  const context = await loadCustomProfileContext(database);
  const rawRows = (await baseUsersQuery(database, context.departmentSource)
    .orderByRaw(
      "replace(lower(coalesce(nullif(btrim(usr.display_name), ''), nullif(btrim(concat_ws(' ', usr.first_name, usr.last_name)), ''), usr.email)), 'ё', 'е') asc",
    )
    .orderBy("usr.email", "asc")) as (Omit<
    UserDirectoryRow,
    "department" | "policyIds"
  > & { _departmentRaw?: unknown })[];

  return attachPoliciesAndDepartments(
    database,
    rawRows,
    context.departmentSource,
  );
}

export async function listUsersDirectory(
  database: Knex,
  query: UsersListQuery,
): Promise<UsersDirectoryPage> {
  const context = await loadCustomProfileContext(database);

  const countBase = database("asmblyr_users as usr")
    .withSchema("public")
    .leftJoin(
      "asmblyr_password_credentials as credential",
      "credential.user_id",
      "usr.id",
    );

  const filteredBase = database("asmblyr_users as usr")
    .withSchema("public")
    .leftJoin(
      "asmblyr_password_credentials as credential",
      "credential.user_id",
      "usr.id",
    );
  applyDirectoryFilters(filteredBase, database, query, context);

  const pageQuery = baseUsersQuery(database, context.departmentSource);
  applyDirectoryFilters(pageQuery, database, query, context);

  const [statusRow, totalRow, rawRows, departments] = await Promise.all([
    countBase
      .select(
        database.raw("COUNT(*)::int AS ??", ["all"]),
        database.raw(
          "COUNT(*) FILTER (WHERE usr.status = 'disabled')::int AS ??",
          ["disabled"],
        ),
        database.raw(
          "COUNT(*) FILTER (WHERE usr.status <> 'disabled' AND NOT usr.superuser AND credential.user_id IS NULL AND EXISTS (SELECT 1 FROM public.asmblyr_user_invitations WHERE user_id = usr.id AND consumed_at IS NULL))::int AS ??",
          ["invited"],
        ),
      )
      .first<{ all: number; disabled: number; invited: number }>(),
    filteredBase.count<{ total: string }>("* as total").first(),
    pageQuery
      .orderByRaw(
        "replace(lower(coalesce(nullif(btrim(usr.display_name), ''), nullif(btrim(concat_ws(' ', usr.first_name, usr.last_name)), ''), usr.email)), 'ё', 'е') asc",
      )
      .orderBy("usr.email", "asc")
      .limit(query.limit)
      .offset((query.page - 1) * query.limit) as Promise<
      (Omit<UserDirectoryRow, "department" | "policyIds"> & {
        _departmentRaw?: unknown;
      })[]
    >,
    listDistinctDepartments(database, context.departmentSource),
  ]);

  const all = Number(statusRow?.all ?? 0);
  const disabled = Number(statusRow?.disabled ?? 0);
  const invited = Number(statusRow?.invited ?? 0);
  const active = Math.max(0, all - disabled - invited);
  const total = Number(totalRow?.total ?? 0);

  const data = await attachPoliciesAndDepartments(
    database,
    rawRows,
    context.departmentSource,
  );

  return {
    data,
    meta: {
      total,
      page: query.page,
      limit: query.limit,
      statusCounts: { all, active, disabled, invited },
      departments,
    },
  };
}
