"use client";

import { useState } from "react";
import type { PolicyCollection } from "./types";
import { Button } from "@asmblyr/kit/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PolicyEditorDialog } from "./policy-editor-dialog";
import type { AccessUser, Permission, Policy } from "./types";

export function PoliciesPanel({
  readOnly = false,
  canManagePolicies = false,
  delegatablePolicyIds = [],
  currentUserId,
  policies,
  permissions,
  collections,
  users,
  onChange,
}: {
  readOnly?: boolean;
  canManagePolicies?: boolean;
  delegatablePolicyIds?: string[];
  currentUserId?: string;
  policies: Policy[];
  permissions: Permission[];
  collections: PolicyCollection[];
  users: AccessUser[];
  onChange: () => Promise<void>;
}) {
  const [selection, setSelection] = useState<string | "new" | null>(null);
  const selected = policies.find((policy) => policy.id === selection);

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Политики</h2>
          <p className="text-sm text-muted-foreground">
            {canManagePolicies
              ? "Настройте права и назначьте пользователей."
              : "Посмотрите права. Разрешённые готовые политики можно назначать другим пользователям."}
          </p>
        </div>
        {!readOnly && canManagePolicies && (
          <Button
            type="button"
            onClick={() => setSelection("new")}
          >
            Создать политику
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Коллекции</TableHead>
            <TableHead>Разделы настроек</TableHead>
            <TableHead>Пользователи</TableHead>
            <TableHead className="text-right">Управление</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((policy) => (
            <TableRow key={policy.id}>
              <TableCell className="font-medium">{policy.name}</TableCell>
              <TableCell>
                {
                  new Set(
                    permissions
                      .filter(
                        (permission) =>
                          "collection" in permission &&
                          permission.policyIds.includes(policy.id),
                      )
                      .flatMap((permission) =>
                        "collection" in permission
                          ? [permission.collection]
                          : [],
                      ),
                  ).size
                }
              </TableCell>
              <TableCell>
                {
                  new Set(
                    permissions.flatMap((permission) =>
                      "section" in permission &&
                      permission.policyIds.includes(policy.id)
                        ? [permission.section]
                        : [],
                    ),
                  ).size
                }
              </TableCell>
              <TableCell>
                {
                  users.filter((user) => user.policyIds.includes(policy.id))
                    .length
                }
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelection(policy.id)}
                >
                  {readOnly
                    ? "Посмотреть"
                    : canManagePolicies
                      ? "Настроить"
                      : delegatablePolicyIds.includes(policy.id)
                        ? "Назначить"
                        : "Посмотреть"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {policies.length === 0 && (
        <p className="text-sm text-muted-foreground">Пока нет политик.</p>
      )}
      <PolicyEditorDialog
        readOnly={
          readOnly ||
          (!canManagePolicies &&
            (!selected || !delegatablePolicyIds.includes(selected.id)))
        }
        assignmentOnly={!canManagePolicies}
        currentUserId={currentUserId}
        key={selection ?? "closed"}
        open={selection !== null}
        policy={selected}
        collections={collections}
        permissions={permissions}
        users={users}
        onClose={() => setSelection(null)}
        onChange={onChange}
      />
    </section>
  );
}
