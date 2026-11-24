"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Link2,
  MoreHorizontal,
  UserCheck,
  UserCog,
  UserX,
  Users,
} from "lucide-react";
import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@asmblyr-collaborative/kit/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { showToast } from "@/components/ui/toast";
import { accessRequest } from "@/lib/access-request";
import { useUiCopy } from "@/lib/ui-copy";
import { userDisplayName } from "@/lib/user-profile";
import { AccessConfirmDialog } from "./access-confirm-dialog";
import {
  accessText,
  compareUsersByName,
  localizeAccessError,
  normalizeAccessSearch,
  parseInviteEmailList,
  userStatusCategory,
  type UserStatusCategory,
} from "./access-helpers";
import type { AccessUser, Policy, UsersDirectoryMeta } from "./types";
import { UserAccessDialog } from "./user-access-dialog";
import { UserProfileDialog } from "./user-profile-dialog";
import {
  BulkInvitationsBanner,
  UsersInvitationBanner,
  type BulkIssuedInvitations,
  type IssuedInvitation,
} from "./users-invitation-banner";

const PAGE_SIZE = 25;
const NO_STARTER_POLICY = "__none__";
const ALL_FILTER = "__all__";
const NO_POLICY_FILTER = "__none__";
type StatusFilter = "all" | UserStatusCategory;

export function UsersPanel({
  readOnly = false,
  canManageDelegation = false,
  canManageSystemFields = false,
  delegatablePolicyIds = [],
  currentUserId,
  users,
  policies,
  onChange,
  onError,
}: {
  readOnly?: boolean;
  canManageDelegation?: boolean;
  canManageSystemFields?: boolean;
  delegatablePolicyIds?: string[];
  currentUserId?: string;
  users: AccessUser[];
  policies: Policy[];
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const copy = useUiCopy();

  const [emailInput, setEmailInput] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [starterPolicyId, setStarterPolicyId] = useState(NO_STARTER_POLICY);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [policyFilter, setPolicyFilter] = useState(ALL_FILTER);
  const [departmentFilter, setDepartmentFilter] = useState(ALL_FILTER);
  const [page, setPage] = useState(1);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [directoryState, setDirectoryState] = useState<{
    requestKey: string;
    data: AccessUser[];
    meta: UsersDirectoryMeta;
  } | null>(null);
  const [invite, setInvite] = useState<IssuedInvitation | null>(null);
  const [bulkInvite, setBulkInvite] = useState<BulkIssuedInvitations | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AccessUser | null>(null);
  const [profileUser, setProfileUser] = useState<AccessUser | null>(null);
  const [statusTarget, setStatusTarget] = useState<AccessUser | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const requestKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    if (debouncedQuery) {
      params.set("q", debouncedQuery);
    }
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (policyFilter !== ALL_FILTER) {
      params.set("policyId", policyFilter);
    }
    if (departmentFilter !== ALL_FILTER) {
      params.set("department", departmentFilter);
    }
    return `${params.toString()}#${refreshNonce}`;
  }, [
    page,
    debouncedQuery,
    statusFilter,
    policyFilter,
    departmentFilter,
    refreshNonce,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const queryString = requestKey.split("#")[0] ?? "";
    accessRequest<{ data: AccessUser[]; meta: UsersDirectoryMeta }>(
      `/users?${queryString}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setDirectoryState({
            requestKey,
            data: result.data,
            meta: result.meta,
          });
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          onError(localizeAccessError((cause as Error).message));
        }
      });
    return () => controller.abort();
  }, [requestKey, onError]);

  const loadingDirectory =
    directoryState !== null && directoryState.requestKey !== requestKey;

  const policyNameMap = useMemo(
    () => new Map(policies.map((policy) => [policy.id, policy.name])),
    [policies],
  );
  const assignableStarterPolicies = useMemo(
    () =>
      canManageDelegation
        ? policies
        : policies.filter((policy) => delegatablePolicyIds.includes(policy.id)),
    [canManageDelegation, policies, delegatablePolicyIds],
  );

  const fallbackSortedUsers = useMemo(
    () => [...users].sort(compareUsersByName),
    [users],
  );
  const fallbackStatusCounts = useMemo(() => {
    const counts = { all: users.length, active: 0, disabled: 0, invited: 0 };
    for (const user of users) {
      counts[userStatusCategory(user)]++;
    }
    return counts;
  }, [users]);
  const fallbackDepartments = useMemo(() => {
    const unique = new Set<string>();
    for (const user of users) {
      const dept = user.department?.trim();
      if (dept) {
        unique.add(dept);
      }
    }
    return [...unique].sort((left, right) =>
      normalizeAccessSearch(left).localeCompare(
        normalizeAccessSearch(right),
        "ru",
        { sensitivity: "base" },
      ),
    );
  }, [users]);

  const activeSuperuserCount = useMemo(
    () =>
      users.filter((user) => user.superuser && user.status === "active").length,
    [users],
  );

  const visibleUsers =
    directoryState?.data ?? fallbackSortedUsers.slice(0, PAGE_SIZE);
  const totalFiltered = directoryState?.meta.total ?? users.length;
  const statusCounts =
    directoryState?.meta.statusCounts ?? fallbackStatusCounts;
  const departments = directoryState?.meta.departments ?? fallbackDepartments;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;

  const hasActiveFilters =
    Boolean(query.trim()) ||
    statusFilter !== "all" ||
    policyFilter !== ALL_FILTER ||
    departmentFilter !== ALL_FILTER;

  async function refreshAll() {
    setRefreshNonce((n) => n + 1);
    await onChange();
  }

  function canManageUserInScope(user: AccessUser): boolean {
    if (canManageDelegation) {
      return true;
    }
    return (
      !user.superuser &&
      user.id !== currentUserId &&
      !user.hasDelegation &&
      user.policyIds.every((id) => delegatablePolicyIds.includes(id))
    );
  }

  function canRenew(user: AccessUser): boolean {
    if (
      readOnly ||
      user.superuser ||
      user.hasPassword ||
      !user.invitationPending ||
      user.status !== "active"
    ) {
      return false;
    }
    return canManageUserInScope(user);
  }

  function canRecover(user: AccessUser): boolean {
    return (
      canManageDelegation &&
      !readOnly &&
      !user.superuser &&
      user.status === "active" &&
      !user.invitationPending
    );
  }

  function canToggleStatus(user: AccessUser): boolean {
    if (readOnly || user.id === currentUserId) {
      return false;
    }
    if (user.superuser) {
      if (!canManageDelegation) {
        return false;
      }
      if (user.status === "active" && activeSuperuserCount <= 1) {
        return false;
      }
      return true;
    }
    return canManageUserInScope(user);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || busy) {
      return;
    }
    const emails = parseInviteEmailList(emailInput);
    if (!emails.length) {
      onError(copy("Укажите хотя бы одну электронную почту."));
      return;
    }
    const chosenPolicyId =
      starterPolicyId === NO_STARTER_POLICY ? null : starterPolicyId;
    const chosenPolicyName = chosenPolicyId
      ? (policyNameMap.get(chosenPolicyId) ?? null)
      : null;

    setBusy(true);
    onError("");
    try {
      if (emails.length === 1 && !bulkMode) {
        const result = await accessRequest<{
          data: {
            user: { email: string };
            invitationToken: string;
            expiresAt: string;
          };
        }>("/users", "POST", {
          email: emails[0],
          ...(chosenPolicyId ? { policyId: chosenPolicyId } : {}),
        });
        setBulkInvite(null);
        setInvite({
          email: result.data.user.email,
          token: result.data.invitationToken,
          expiresAt: result.data.expiresAt,
          policyName: chosenPolicyName,
        });
      } else {
        const result = await accessRequest<{
          data: {
            created: BulkIssuedInvitations["created"];
            skipped: BulkIssuedInvitations["skipped"];
          };
        }>("/invitations/bulk", "POST", {
          emails,
          ...(chosenPolicyId ? { policyId: chosenPolicyId } : {}),
        });
        setInvite(null);
        setBulkInvite({
          created: result.data.created,
          skipped: result.data.skipped,
          policyName: chosenPolicyName,
        });
      }
      setEmailInput("");
      await refreshAll();
    } catch (error) {
      onError(localizeAccessError((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function renew(user: AccessUser) {
    if (readOnly || busy) {
      return;
    }
    setBusy(true);
    onError("");
    try {
      const result = await accessRequest<{
        data: { invitationToken: string; expiresAt: string };
      }>(`/users/${user.id}/invitation`, "POST", {});
      setBulkInvite(null);
      setInvite({
        email: user.email,
        token: result.data.invitationToken,
        expiresAt: result.data.expiresAt,
      });
    } catch (error) {
      onError(localizeAccessError((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function recover(user: AccessUser) {
    if (readOnly || busy) {
      return;
    }
    setBusy(true);
    onError("");
    try {
      const result = await accessRequest<{
        data: { invitationToken: string; expiresAt: string };
      }>(`/users/${user.id}/recovery`, "POST", {});
      setBulkInvite(null);
      setInvite({
        email: user.email,
        token: result.data.invitationToken,
        expiresAt: result.data.expiresAt,
      });
    } catch (failure) {
      onError(localizeAccessError((failure as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function confirmToggleStatus() {
    if (!statusTarget || busy) {
      return;
    }
    const nextStatus =
      statusTarget.status === "disabled" ? "active" : "disabled";
    setBusy(true);
    onError("");
    try {
      await accessRequest(`/users/${statusTarget.id}/status`, "PATCH", {
        status: nextStatus,
      });
      setStatusTarget(null);
      showToast(
        nextStatus === "disabled"
          ? accessText(
              copy.locale,
              "Учётная запись отключена",
              "Account disabled",
            )
          : accessText(
              copy.locale,
              "Учётная запись включена",
              "Account enabled",
            ),
        "success",
      );
      await refreshAll();
    } catch (failure) {
      setStatusTarget(null);
      onError(localizeAccessError((failure as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const filterChips: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: copy("Все"), count: statusCounts.all },
    {
      value: "active",
      label: accessText(copy.locale, "Активные", "Active"),
      count: statusCounts.active,
    },
    {
      value: "disabled",
      label: accessText(copy.locale, "Отключённые", "Disabled"),
      count: statusCounts.disabled,
    },
    {
      value: "invited",
      label: accessText(copy.locale, "Приглашённые", "Invited"),
      count: statusCounts.invited,
    },
  ];

  const pendingEmailCount = parseInviteEmailList(emailInput).length;

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-xl font-semibold">{copy("Пользователи")}</h2>
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? copy("Участники команды и назначенные им права.")
            : copy(
                "Добавьте почту и передайте пользователю одноразовую ссылку для входа. Отправка письма не нужна.",
              )}
        </p>
      </div>
      {!readOnly && (
        <form
          onSubmit={create}
          className="space-y-3"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="access-email">
                  {bulkMode
                    ? copy("Адреса электронной почты")
                    : copy("Электронная почта")}
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                  disabled={busy}
                  onClick={() => setBulkMode((current) => !current)}
                >
                  <Users className="size-3.5" />
                  {bulkMode ? copy("Один адрес") : copy("Массовое приглашение")}
                </Button>
              </div>
              {bulkMode ? (
                <Textarea
                  id="access-email"
                  rows={3}
                  required
                  value={emailInput}
                  disabled={busy}
                  placeholder={copy(
                    "Укажите адреса через запятую или с новой строки…",
                  )}
                  onChange={(event) => setEmailInput(event.target.value)}
                />
              ) : (
                <Input
                  id="access-email"
                  type="text"
                  inputMode="email"
                  required
                  value={emailInput}
                  disabled={busy}
                  placeholder={copy(
                    "name@company.ru (или несколько через запятую)",
                  )}
                  onChange={(event) => setEmailInput(event.target.value)}
                />
              )}
            </div>
            {assignableStarterPolicies.length > 0 && (
              <div className="w-full space-y-2 sm:w-56">
                <Label htmlFor="access-starter-policy">
                  {copy("Начальная политика")}
                </Label>
                <Select
                  value={starterPolicyId}
                  disabled={busy}
                  onValueChange={setStarterPolicyId}
                >
                  <SelectTrigger id="access-starter-policy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_STARTER_POLICY}>
                      {copy("Без политики")}
                    </SelectItem>
                    {assignableStarterPolicies.map((policy) => (
                      <SelectItem
                        key={policy.id}
                        value={policy.id}
                      >
                        {policy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              type="submit"
              disabled={busy}
            >
              {pendingEmailCount > 1
                ? copy("Пригласить ({{value0}})", {
                    value0: pendingEmailCount,
                  })
                : copy("Пригласить")}
            </Button>
          </div>
        </form>
      )}
      {invite && <UsersInvitationBanner invite={invite} />}
      {bulkInvite && (
        <BulkInvitationsBanner
          result={bulkInvite}
          onDismiss={() => setBulkInvite(null)}
        />
      )}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64">
              <Input
                aria-label={copy("Поиск пользователя")}
                placeholder={copy(
                  "Поиск по имени, почте, отделу или должности…",
                )}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            {policies.length > 0 && (
              <Select
                value={policyFilter}
                onValueChange={(value) => {
                  setPolicyFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  aria-label={copy("Фильтр по политике")}
                  className="w-48"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>
                    {copy("Все политики")}
                  </SelectItem>
                  <SelectItem value={NO_POLICY_FILTER}>
                    {copy("Без политики")}
                  </SelectItem>
                  {policies.map((policy) => (
                    <SelectItem
                      key={policy.id}
                      value={policy.id}
                    >
                      {policy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {departments.length > 0 && (
              <Select
                value={departmentFilter}
                onValueChange={(value) => {
                  setDepartmentFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  aria-label={copy("Фильтр по отделу")}
                  className="w-48"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>
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
            {hasActiveFilters && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2.5 text-xs"
                onClick={() => {
                  setQuery("");
                  setDebouncedQuery("");
                  setStatusFilter("all");
                  setPolicyFilter(ALL_FILTER);
                  setDepartmentFilter(ALL_FILTER);
                  setPage(1);
                }}
              >
                {copy("Сбросить")}
              </Button>
            )}
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {loadingDirectory
              ? copy("Обновляем список…")
              : accessText(
                  copy.locale,
                  `Показано ${totalFiltered} из ${statusCounts.all}`,
                  `Showing ${totalFiltered} of ${statusCounts.all}`,
                )}
          </span>
        </div>
        <div
          role="group"
          aria-label={accessText(
            copy.locale,
            "Фильтр по статусу",
            "Filter by status",
          )}
          className="flex flex-wrap items-center gap-1.5"
        >
          {filterChips.map((chip) => (
            <Button
              key={chip.value}
              type="button"
              size="sm"
              variant={statusFilter === chip.value ? "default" : "outline"}
              className="h-8 rounded-full px-3 text-xs"
              aria-pressed={statusFilter === chip.value}
              onClick={() => {
                setStatusFilter(chip.value);
                setPage(1);
              }}
            >
              {chip.label} ({chip.count})
            </Button>
          ))}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{copy("Пользователь")}</TableHead>
            <TableHead>{copy("Состояние")}</TableHead>
            <TableHead>{copy("Политики")}</TableHead>
            <TableHead className="text-right">{copy("Действия")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleUsers.map((user) => {
            const category = userStatusCategory(user);
            const displayName = userDisplayName(user);
            const allowRenew = canRenew(user);
            const allowRecover = canRecover(user);
            const allowStatusToggle = canToggleStatus(user);
            return (
              <TableRow key={user.id}>
                <TableCell>
                  <button
                    type="button"
                    className="text-left font-medium hover:underline"
                    onClick={() => setProfileUser(user)}
                  >
                    {displayName}
                  </button>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {displayName !== user.email && <span>{user.email}</span>}
                    {user.department && (
                      <span>
                        {displayName !== user.email ? "· " : ""}
                        {user.department}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      category === "disabled"
                        ? "destructive"
                        : user.superuser
                          ? "default"
                          : category === "invited"
                            ? "outline"
                            : "secondary"
                    }
                  >
                    {category === "disabled"
                      ? copy("Отключён")
                      : user.superuser
                        ? copy("Суперпользователь")
                        : category === "invited"
                          ? copy("Приглашён")
                          : copy("Активен")}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {user.policyIds
                    .map((id) => policyNameMap.get(id))
                    .filter(Boolean)
                    .join(", ") || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedUser(user)}
                    >
                      {copy("Доступ")}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={busy}
                          aria-label={accessText(
                            copy.locale,
                            `Дополнительные действия: ${displayName}`,
                            `More actions: ${displayName}`,
                          )}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setProfileUser(user)}>
                          <UserCog className="size-4" />
                          {copy("Профиль")}
                        </DropdownMenuItem>
                        {allowRenew && (
                          <DropdownMenuItem onSelect={() => void renew(user)}>
                            <Link2 className="size-4" />
                            {accessText(
                              copy.locale,
                              "Новая ссылка приглашения",
                              "New invitation link",
                            )}
                          </DropdownMenuItem>
                        )}
                        {allowRecover && (
                          <DropdownMenuItem onSelect={() => void recover(user)}>
                            <KeyRound className="size-4" />
                            {copy("Восстановить вход")}
                          </DropdownMenuItem>
                        )}
                        {allowStatusToggle && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className={
                                user.status === "disabled"
                                  ? undefined
                                  : "text-destructive focus:text-destructive"
                              }
                              onSelect={() => setStatusTarget(user)}
                            >
                              {user.status === "disabled" ? (
                                <>
                                  <UserCheck className="size-4" />
                                  {copy("Включить")}
                                </>
                              ) : (
                                <>
                                  <UserX className="size-4" />
                                  {copy("Отключить")}
                                </>
                              )}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {visibleUsers.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                {copy("Пользователи не найдены.")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {totalFiltered > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <span className="text-xs tabular-nums text-muted-foreground">
            {accessText(
              copy.locale,
              `Строки ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, totalFiltered)} из ${totalFiltered}`,
              `Rows ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, totalFiltered)} of ${totalFiltered}`,
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={currentPage <= 1 || loadingDirectory}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
              {copy("Назад")}
            </Button>
            <span className="px-2 text-xs tabular-nums text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={currentPage >= totalPages || loadingDirectory}
              onClick={() => setPage(currentPage + 1)}
            >
              {accessText(copy.locale, "Вперёд", "Next")}
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
      {selectedUser && (
        <UserAccessDialog
          key={selectedUser.id}
          userId={selectedUser.id}
          email={selectedUser.email}
          displayName={userDisplayName(selectedUser)}
          policies={policies}
          canManageDelegation={canManageDelegation}
          delegatablePolicyIds={delegatablePolicyIds}
          currentUserId={currentUserId}
          canToggleStatus={canToggleStatus(selectedUser)}
          onDelegationSaved={refreshAll}
          onStatusChanged={refreshAll}
          onClose={() => setSelectedUser(null)}
        />
      )}
      {profileUser && (
        <UserProfileDialog
          userId={profileUser.id}
          email={profileUser.email}
          readOnly={readOnly}
          canChooseAvatar={canManageDelegation}
          canManageSystemFields={canManageSystemFields}
          onClose={() => setProfileUser(null)}
          onSaved={refreshAll}
        />
      )}
      <AccessConfirmDialog
        open={statusTarget !== null}
        title={
          statusTarget?.status === "disabled"
            ? accessText(
                copy.locale,
                "Включить учётную запись?",
                "Enable account?",
              )
            : accessText(
                copy.locale,
                "Отключить учётную запись?",
                "Disable account?",
              )
        }
        description={
          statusTarget
            ? statusTarget.status === "disabled"
              ? accessText(
                  copy.locale,
                  `Пользователь ${userDisplayName(statusTarget) !== statusTarget.email ? `${userDisplayName(statusTarget)} (${statusTarget.email})` : statusTarget.email} снова сможет войти в систему с сохранёнными политиками.`,
                  `${userDisplayName(statusTarget) !== statusTarget.email ? `${userDisplayName(statusTarget)} (${statusTarget.email})` : statusTarget.email} will be able to sign in again with their assigned policies.`,
                )
              : accessText(
                  copy.locale,
                  `Все активные сессии пользователя ${userDisplayName(statusTarget) !== statusTarget.email ? `${userDisplayName(statusTarget)} (${statusTarget.email})` : statusTarget.email} будут немедленно завершены, вход в систему станет недоступен.`,
                  `All active sessions for ${userDisplayName(statusTarget) !== statusTarget.email ? `${userDisplayName(statusTarget)} (${statusTarget.email})` : statusTarget.email} will be revoked immediately and sign-in will be blocked.`,
                )
            : ""
        }
        confirmLabel={
          busy
            ? copy("Сохранение…")
            : statusTarget?.status === "disabled"
              ? copy("Включить")
              : copy("Отключить")
        }
        destructive={statusTarget?.status !== "disabled"}
        busy={busy}
        onConfirm={confirmToggleStatus}
        onCancel={() => setStatusTarget(null)}
      />
    </section>
  );
}
