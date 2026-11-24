"use client";

import { useMemo, useState } from "react";
import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { useUiCopy } from "@/lib/ui-copy";
import { userDisplayName } from "@/lib/user-profile";
import {
  accessText,
  compareUsersByName,
  matchesAccessSearch,
  normalizeAccessSearch,
  userStatusCategory,
} from "./access-helpers";
import type { AccessUser } from "./types";

type PickerFilter = "all" | "selected" | "active";
const ALL_DEPARTMENTS = "__all__";

export function PolicyUsersPicker({
  users,
  selected,
  disabled,
  protectedUserId,
  onChange,
}: {
  users: AccessUser[];
  selected: string[];
  disabled: boolean;
  protectedUserId?: string;
  onChange: (userId: string, checked: boolean) => void;
}) {
  const copy = useUiCopy();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PickerFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS);

  const assignable = useMemo(
    () => users.filter((user) => !user.superuser).sort(compareUsersByName),
    [users],
  );
  const departments = useMemo(() => {
    const unique = new Set<string>();
    for (const user of assignable) {
      const label = user.department?.trim();
      if (label) {
        unique.add(label);
      }
    }
    return [...unique].sort((left, right) =>
      normalizeAccessSearch(left).localeCompare(
        normalizeAccessSearch(right),
        "ru",
        { sensitivity: "base" },
      ),
    );
  }, [assignable]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedCount = useMemo(
    () => assignable.filter((user) => selectedSet.has(user.id)).length,
    [assignable, selectedSet],
  );
  const activeCount = useMemo(
    () =>
      assignable.filter((user) => userStatusCategory(user) === "active").length,
    [assignable],
  );

  const shown = useMemo(
    () =>
      assignable.filter((user) => {
        if (filter === "selected" && !selectedSet.has(user.id)) {
          return false;
        }
        if (filter === "active" && userStatusCategory(user) !== "active") {
          return false;
        }
        if (
          departmentFilter !== ALL_DEPARTMENTS &&
          (user.department?.trim() || "") !== departmentFilter
        ) {
          return false;
        }
        return matchesAccessSearch(
          [
            userDisplayName(user),
            user.firstName,
            user.lastName,
            user.displayName,
            user.email,
            user.description,
            user.department,
          ],
          query,
        );
      }),
    [assignable, filter, departmentFilter, selectedSet, query],
  );

  const selectableShown = useMemo(
    () => shown.filter((user) => user.id !== protectedUserId),
    [shown, protectedUserId],
  );
  const canSelectAllInFilter =
    !disabled && selectableShown.some((user) => !selectedSet.has(user.id));
  const canClearInFilter =
    !disabled && selectableShown.some((user) => selectedSet.has(user.id));

  function selectAllInFilter() {
    if (disabled) {
      return;
    }
    for (const user of selectableShown) {
      if (!selectedSet.has(user.id)) {
        onChange(user.id, true);
      }
    }
  }

  function clearSelectionInFilter() {
    if (disabled) {
      return;
    }
    for (const user of selectableShown) {
      if (selectedSet.has(user.id)) {
        onChange(user.id, false);
      }
    }
  }

  const filterChips: { value: PickerFilter; label: string; count: number }[] = [
    { value: "all", label: copy("Все"), count: assignable.length },
    {
      value: "selected",
      label: accessText(copy.locale, "Выбранные", "Selected"),
      count: selectedCount,
    },
    {
      value: "active",
      label: accessText(copy.locale, "Активные", "Active"),
      count: activeCount,
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{copy("Пользователи")}</h3>
          <p className="text-xs text-muted-foreground">
            {copy("Назначьте политику одному или нескольким пользователям.")}
            {protectedUserId &&
              ` ${copy("Собственное назначение меняет администратор.")}`}
          </p>
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {accessText(
            copy.locale,
            `Выбрано: ${selectedCount} из ${assignable.length}`,
            `Selected: ${selectedCount} of ${assignable.length}`,
          )}
        </span>
      </div>
      {assignable.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-48 flex-1">
              <Input
                aria-label={accessText(
                  copy.locale,
                  "Поиск пользователя для назначения",
                  "Search users to assign",
                )}
                placeholder={copy("Поиск по имени или почте…")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {departments.length > 0 && (
              <Select
                value={departmentFilter}
                onValueChange={setDepartmentFilter}
              >
                <SelectTrigger
                  aria-label={copy("Фильтр по отделу")}
                  className="w-48"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DEPARTMENTS}>
                    {copy("Все отделы")}
                  </SelectItem>
                  {departments.map((department) => (
                    <SelectItem
                      key={department}
                      value={department}
                    >
                      {department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div
              role="group"
              aria-label={accessText(
                copy.locale,
                "Фильтр пользователей политики",
                "Filter policy users",
              )}
              className="flex flex-wrap items-center gap-1"
            >
              {filterChips.map((chip) => (
                <Button
                  key={chip.value}
                  type="button"
                  size="sm"
                  variant={filter === chip.value ? "default" : "outline"}
                  className="h-8 rounded-full px-2.5 text-xs"
                  aria-pressed={filter === chip.value}
                  onClick={() => setFilter(chip.value)}
                >
                  {chip.label} ({chip.count})
                </Button>
              ))}
            </div>
          </div>
          {!disabled && shown.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                disabled={!canSelectAllInFilter}
                onClick={selectAllInFilter}
              >
                {copy("Выбрать всех в фильтре")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-xs"
                disabled={!canClearInFilter}
                onClick={clearSelectionInFilter}
              >
                {copy("Снять выбор в фильтре")}
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="max-h-80 divide-y overflow-y-auto rounded-lg border">
        {shown.map((user) => {
          const displayName = userDisplayName(user);
          const category = userStatusCategory(user);
          return (
            <label
              key={user.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/40"
            >
              <span className="flex min-w-0 items-center gap-3">
                <Checkbox
                  checked={selectedSet.has(user.id)}
                  disabled={disabled || user.id === protectedUserId}
                  onCheckedChange={(checked) =>
                    onChange(user.id, checked === true)
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {displayName}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {displayName !== user.email && (
                      <span className="truncate">{user.email}</span>
                    )}
                    {user.department && (
                      <span className="truncate">{user.department}</span>
                    )}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {category === "disabled" && (
                  <Badge
                    variant="destructive"
                    className="shrink-0 text-[11px]"
                  >
                    {copy("Отключён")}
                  </Badge>
                )}
                {category === "invited" && (
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[11px]"
                  >
                    {copy("Приглашён")}
                  </Badge>
                )}
              </span>
            </label>
          );
        })}
        {!shown.length && (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {assignable.length === 0
              ? copy("Пока нет пользователей для назначения.")
              : accessText(
                  copy.locale,
                  "По выбранным фильтрам пользователи не найдены.",
                  "No users match the selected filters.",
                )}
          </p>
        )}
      </div>
    </section>
  );
}
