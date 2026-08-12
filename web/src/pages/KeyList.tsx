import { AlertDialog, Button, Chip, Input, ListBox, Select, Tooltip, toast } from "@heroui/react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CheckCircle2,
  CircleDollarSign,
  CirclePlus,
  Ellipsis,
  Grid2X2,
  KeyRound,
  List,
  Pencil,
  RefreshCw,
  RotateCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { deleteKey, listKeys, patchKey, resetRPM, rotateKey } from "../api/keys";
import PlainKeyModal from "../components/PlainKeyModal";
import { useT } from "../i18n";
import { useUiPreferences } from "../store/uiPreferences";
import type { KeyPublic } from "../types";

type ConfirmAction = { kind: "delete" | "rotate"; key: KeyPublic } | null;
const LOADING_ROW_KEYS = [
  "loading-row-1",
  "loading-row-2",
  "loading-row-3",
  "loading-row-4",
  "loading-row-5",
];

function usd(value: number): string {
  return `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
}

function aliasesOf(key: KeyPublic): string[] {
  return [...new Set((key.models ?? []).map((model) => model.alias).filter(Boolean))];
}

function ModelAliases({ aliases, visibleCount }: { aliases: string[]; visibleCount: number }) {
  const t = useT();
  const hiddenCount = aliases.length - visibleCount;

  return (
    <div className="flex max-w-56 flex-wrap gap-1">
      {aliases.slice(0, visibleCount).map((alias) => (
        <span
          className="max-w-28 truncate rounded-lg bg-[var(--surface-secondary)] px-2 py-1 text-[9px] text-[var(--muted)]"
          key={alias}
        >
          {alias}
        </span>
      ))}
      {hiddenCount > 0 && (
        <Tooltip delay={100} closeDelay={100}>
          <Tooltip.Trigger
            className="rounded-lg bg-[var(--surface-secondary)] px-2 py-1 text-[9px] text-[var(--muted)] transition hover:bg-[var(--surface-tertiary)] hover:text-[var(--foreground)]"
            aria-label={`${t("keyForm.reviewAllModels")} (${aliases.length})`}
            onClick={(event) => event.stopPropagation()}
          >
            +{hiddenCount}
          </Tooltip.Trigger>
          <Tooltip.Content placement="top" showArrow className="w-64">
            <div>
              <strong className="mb-2 block text-xs font-semibold">
                {t("keyForm.reviewAllModels")}
              </strong>
              <div className="flex flex-wrap gap-1.5">
                {aliases.map((alias) => (
                  <span
                    className="max-w-full truncate rounded-lg bg-[var(--surface-secondary)] px-2 py-1 text-[10px] text-[var(--muted)]"
                    key={alias}
                  >
                    {alias}
                  </span>
                ))}
              </div>
            </div>
          </Tooltip.Content>
        </Tooltip>
      )}
    </div>
  );
}

function budgetRatio(key: KeyPublic): number {
  const daily = key.usage.daily_limit_usd > 0 ? key.usage.daily_usd / key.usage.daily_limit_usd : 0;
  const weekly =
    key.usage.weekly_limit_usd > 0 ? key.usage.weekly_usd / key.usage.weekly_limit_usd : 0;
  return Math.max(daily, weekly);
}

function StatusChip({ item }: { item: KeyPublic }) {
  const t = useT();
  const ratio = budgetRatio(item);
  if (!item.enabled)
    return (
      <Chip size="sm" variant="soft" color="default">
        {t("keys.disabled")}
      </Chip>
    );
  if (ratio >= 1)
    return (
      <Chip size="sm" variant="soft" color="danger">
        {t("app.overLimit")}
      </Chip>
    );
  if (ratio >= 0.8)
    return (
      <Chip size="sm" variant="soft" color="warning">
        {t("app.nearLimit")}
      </Chip>
    );
  return (
    <Chip size="sm" variant="soft" color="success">
      {t("keys.enabled")}
    </Chip>
  );
}

function UsageBar({ item }: { item: KeyPublic }) {
  const t = useT();
  const limit = item.usage.daily_limit_usd;
  const ratio = limit > 0 ? item.usage.daily_usd / limit : 0;
  return (
    <div className="grid min-w-36 gap-1">
      <div className="flex items-baseline gap-0.5 text-[11px]">
        <strong className="text-xs tabular-nums">{usd(item.usage.daily_usd)}</strong>
        <span className="text-[10px] text-[var(--muted)]">
          {limit > 0 ? ` / ${usd(limit)}` : ` · ${t("usage.unlimited")}`}
        </span>
      </div>
      {limit > 0 && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-tertiary)]">
          <span
            className={`block h-full rounded-full ${ratio >= 1 ? "bg-[var(--danger)]" : ratio >= 0.8 ? "bg-[var(--warning)]" : "bg-gradient-to-r from-indigo-500 to-cyan-500"}`}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      )}
      <small className="text-[10px] text-[var(--muted)]">
        {t("usage.thisWeek")} {usd(item.usage.weekly_usd)}
      </small>
    </div>
  );
}

function ConfirmDialog({
  action,
  onClose,
  onConfirm,
  busy,
}: {
  action: ConfirmAction;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const t = useT();
  const [typedId, setTypedId] = useState("");
  if (!action) return null;
  const deleting = action.kind === "delete";
  const allowed = !deleting || typedId === action.key.id;
  return (
    <AlertDialog.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      className="bg-slate-950/65 p-4 backdrop-blur-md"
    >
      <AlertDialog.Container placement="center" size="sm">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status={deleting ? "danger" : "warning"}>
              {deleting ? <Trash2 size={21} /> : <RotateCw size={21} />}
            </AlertDialog.Icon>
            <AlertDialog.Heading>
              {deleting ? t("app.deleteKey") : t("keys.rotate")}
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p
              className={deleting ? "mb-4 text-xs leading-relaxed text-[var(--muted)]" : undefined}
            >
              {deleting
                ? t("keys.deleteConfirm", { id: action.key.id })
                : t("keys.rotateConfirm", { id: action.key.id })}
            </p>
            {deleting && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold" htmlFor="delete-key-id">
                  {t("app.typeId", { id: action.key.id })}
                </label>
                <Input
                  id="delete-key-id"
                  value={typedId}
                  onChange={(event) => setTypedId(event.target.value)}
                  autoFocus
                  fullWidth
                />
              </div>
            )}
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" onPress={onClose} isDisabled={busy}>
              {t("keyForm.cancel")}
            </Button>
            <Button
              variant={deleting ? "danger" : "primary"}
              onPress={onConfirm}
              isDisabled={!allowed || busy}
            >
              {deleting ? t("keys.delete") : t("keys.rotate")}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

function KeyActions({
  item,
  onReset,
  onConfirm,
}: {
  item: KeyPublic;
  onReset: (key: KeyPublic) => void;
  onConfirm: (action: ConfirmAction) => void;
}) {
  const t = useT();
  return (
    <div className="flex justify-end gap-0.5">
      <Tooltip>
        <Tooltip.Trigger>
          <Link
            className="grid size-8 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
            to={`/keys/${encodeURIComponent(item.id)}/usage`}
            aria-label={t("keys.detail")}
          >
            <Activity size={17} />
          </Link>
        </Tooltip.Trigger>
        <Tooltip.Content>{t("keys.detail")}</Tooltip.Content>
      </Tooltip>
      <Tooltip>
        <Tooltip.Trigger>
          <Link
            className="grid size-8 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
            to={`/keys/${encodeURIComponent(item.id)}/edit`}
            aria-label={t("keys.edit")}
          >
            <Pencil size={17} />
          </Link>
        </Tooltip.Trigger>
        <Tooltip.Content>{t("keys.edit")}</Tooltip.Content>
      </Tooltip>
      <Tooltip>
        <Tooltip.Trigger>
          <button
            className="grid cursor-pointer size-8 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
            type="button"
            onClick={() => onReset(item)}
            aria-label={t("keys.resetRpm")}
          >
            <RefreshCw size={17} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content>{t("keys.resetRpm")}</Tooltip.Content>
      </Tooltip>
      <Tooltip>
        <Tooltip.Trigger>
          <button
            className="grid cursor-pointer size-8 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
            type="button"
            onClick={() => onConfirm({ kind: "rotate", key: item })}
            aria-label={t("keys.rotate")}
          >
            <RotateCw size={17} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content>{t("keys.rotate")}</Tooltip.Content>
      </Tooltip>
      <Tooltip>
        <Tooltip.Trigger>
          <button
            className="grid cursor-pointer size-8 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
            type="button"
            onClick={() => onConfirm({ kind: "delete", key: item })}
            aria-label={t("keys.delete")}
          >
            <Trash2 size={17} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content>{t("keys.delete")}</Tooltip.Content>
      </Tooltip>
    </div>
  );
}

function KeyCard({
  item,
  onReset,
  onConfirm,
}: {
  item: KeyPublic;
  onReset: (key: KeyPublic) => void;
  onConfirm: (action: ConfirmAction) => void;
}) {
  const navigate = useNavigate();
  const aliases = aliasesOf(item);
  const ratio = budgetRatio(item);
  return (
    <article
      className={`relative min-w-0 overflow-hidden rounded-2xl border bg-[var(--surface)] ${ratio >= 1 ? "border-[color-mix(in_srgb,var(--danger)_36%,var(--border))]" : "border-[var(--border)]"}`}
    >
      <div
        className={`relative z-10 flex h-full flex-col gap-3 bg-[var(--surface)] p-4 ${!item.enabled ? "opacity-70" : ""}`}
        onClick={() => navigate(`/keys/${encodeURIComponent(item.id)}/usage`)}
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)]">
              <KeyRound size={18} />
            </span>
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-[13px]">{item.name || item.id}</strong>
              <code className="text-[10px] text-[var(--muted)]">{item.id}</code>
            </div>
          </div>
          <StatusChip item={item} />
        </div>
        <div className="flex items-center justify-between gap-2.5 rounded-xl bg-[var(--surface-secondary)] px-2.5 py-2 text-[10px] text-[var(--muted)]">
          <code>{item.key_preview}</code>
        </div>
        <UsageBar item={item} />
        <ModelAliases aliases={aliases} visibleCount={3} />
        <div
          className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--separator)] pt-2.5 text-[10px] text-[var(--muted)]"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="tabular-nums">{item.rpm || "∞"} RPM</span>
          <KeyActions item={item} onReset={onReset} onConfirm={onConfirm} />
        </div>
      </div>
    </article>
  );
}

export default function KeyList() {
  const t = useT();
  const preferences = useUiPreferences();
  const [params, setParams] = useSearchParams();
  const [keys, setKeys] = useState<KeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plain, setPlain] = useState<{ value: string; title: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const loadInFlight = useRef(false);
  // const wasHidden = useRef(false);

  const load = useCallback(
    async (silent = false) => {
      if (loadInFlight.current) return;
      loadInFlight.current = true;
      if (!silent) setLoading(true);
      setError("");
      try {
        setKeys(await listKeys());
      } catch (err) {
        const value = err as {
          response?: { data?: { error?: { message?: string } } };
          message?: string;
        };
        setError(value.response?.data?.error?.message ?? value.message ?? t("keys.loadFailed"));
      } finally {
        loadInFlight.current = false;
        if (!silent) setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load();
  }, [load]);
  // useEffect(() => {
  //   const refresh = () => {
  //     if (document.visibilityState === "hidden") {
  //       wasHidden.current = true;
  //     } else if (wasHidden.current) {
  //       wasHidden.current = false;
  //       void load(true);
  //     }
  //   };
  //   document.addEventListener("visibilitychange", refresh);
  //   return () => document.removeEventListener("visibilitychange", refresh);
  // }, [load]);

  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const query = (params.get("q") ?? "").trim().toLowerCase();
    const status = params.get("status") ?? "all";
    const budget = params.get("budget") ?? "all";
    const model = (params.get("model") ?? "").toLowerCase();
    const sort = params.get("sort") ?? "risk";
    const result = keys.filter((item) => {
      const aliases = aliasesOf(item);
      if (
        query &&
        ![item.id, item.name, item.key_preview, ...aliases].some((value) =>
          value?.toLowerCase().includes(query),
        )
      )
        return false;
      if (status === "enabled" && !item.enabled) return false;
      if (status === "disabled" && item.enabled) return false;
      const ratio = budgetRatio(item);
      if (budget === "near" && !(ratio >= 0.8 && ratio < 1)) return false;
      if (budget === "over" && ratio < 1) return false;
      if (model && !aliases.some((alias) => alias.toLowerCase().includes(model))) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sort === "name") return (a.name || a.id).localeCompare(b.name || b.id);
      if (sort === "spend") return b.usage.daily_usd - a.usage.daily_usd;
      return budgetRatio(b) - budgetRatio(a) || (a.name || a.id).localeCompare(b.name || b.id);
    });
    return result;
  }, [keys, params]);

  const metrics = useMemo(
    () => ({
      total: keys.length,
      enabled: keys.filter((item) => item.enabled).length,
      spend: keys.reduce((sum, item) => sum + item.usage.daily_usd, 0),
      alerts: keys.filter((item) => budgetRatio(item) >= 0.8).length,
    }),
    [keys],
  );

  const onReset = async (item: KeyPublic) => {
    try {
      await resetRPM(item.id);
      toast.success(t("app.rpmReset"));
      await load(true);
    } catch (err) {
      toast.danger((err as Error).message ?? t("keys.resetFailed"));
    }
  };

  const runConfirmed = async () => {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction.kind === "delete") {
        await deleteKey(confirmAction.key.id);
        toast.success(t("app.keyDeleted"));
      } else {
        const result = await rotateKey(confirmAction.key.id);
        setPlain({ value: result.plain_key, title: t("keys.rotated") });
        toast.success(t("keys.rotateOk"));
      }
      setConfirmAction(null);
      await load(true);
    } catch (err) {
      toast.danger((err as Error).message ?? t("app.operationFailed"));
    } finally {
      setBusy(false);
    }
  };

  const bulkSetEnabled = async (enabled: boolean) => {
    const items = keys.filter((item) => selected.has(item.id));
    if (!items.length) return;
    setBusy(true);
    try {
      await Promise.all(items.map((item) => patchKey({ id: item.id, enabled })));
      toast.success(
        t(enabled ? "app.bulkEnabled" : "app.bulkDisabled", {
          count: items.length,
        }),
      );
      setSelected(new Set());
      await load(true);
    } catch (err) {
      toast.danger((err as Error).message ?? t("app.operationFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-6">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="m-0 text-[10px] font-bold tracking-[.14em] text-[var(--accent-soft-foreground)]">
            CONTROL CENTER
          </p>
          <h1 className="mb-1 mt-0.5 text-3xl font-bold tracking-tight">{t("header.keyList")}</h1>
          <p className="m-0 hidden text-sm text-[var(--muted)] sm:block">{t("app.keysSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onPress={() => load()} isDisabled={loading}>
            <RefreshCw size={17} />
            {t("keys.refresh")}
          </Button>

          <Link to="/keys/new">
            <Button>
              <CirclePlus size={18} />
              {t("keys.newKey")}
            </Button>
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        {(
          [
            [t("app.totalKeys"), metrics.total, KeyRound, "indigo"],
            [t("app.enabledKeys"), metrics.enabled, CheckCircle2, "emerald"],
            [t("app.todaySpend"), usd(metrics.spend), CircleDollarSign, "cyan"],
            [
              t("app.budgetAlerts"),
              metrics.alerts,
              ShieldAlert,
              metrics.alerts ? "amber" : "slate",
            ],
          ] as Array<[string, string | number, LucideIcon, string]>
        ).map(([label, value, Icon, tone]) => (
          <div
            key={String(label)}
            className="flex min-h-20 items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm sm:min-h-24 sm:gap-3 sm:p-4"
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone === "indigo" ? "bg-indigo-500/10 text-indigo-500" : tone === "emerald" ? "bg-emerald-500/10 text-emerald-500" : tone === "cyan" ? "bg-cyan-500/10 text-cyan-500" : tone === "amber" ? "bg-amber-500/10 text-amber-500" : "bg-[var(--surface-secondary)] text-[var(--muted)]"}`}
            >
              <Icon size={19} />
            </span>
            <div>
              <small className="mb-1 block text-[10px] text-[var(--muted)] sm:text-[11px]">
                {label}
              </small>
              <strong className="text-lg font-bold tabular-nums sm:text-2xl">{value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none">
        <div className="flex flex-col gap-3 border-b border-[var(--separator)] p-3 xl:flex-row xl:items-center max-sm:border-0 max-sm:p-0 max-sm:pb-3">
          <div className="relative flex w-full items-center xl:max-w-md">
            <Search
              size={17}
              className="pointer-events-none absolute left-3 z-10 text-[var(--muted)]"
            />
            <Input
              className="pl-9"
              value={params.get("q") ?? ""}
              onChange={(event) => setParam("q", event.target.value)}
              placeholder={t("app.searchKeys")}
              aria-label={t("app.searchKeys")}
              fullWidth
            />
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 xl:ml-auto xl:w-auto">
            <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
              <Select
                aria-label={t("keys.colStatus")}
                fullWidth
                value={params.get("status") ?? "all"}
                onChange={(key) => {
                  if (key !== null) setParam("status", String(key));
                }}
              >
                <Select.Trigger className="flex items-center gap-1">
                  <SlidersHorizontal size={16} className="text-[var(--muted)]" />
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="all">{t("app.allStatus")}</ListBox.Item>
                    <ListBox.Item id="enabled">{t("keys.enabled")}</ListBox.Item>
                    <ListBox.Item id="disabled">{t("keys.disabled")}</ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <div className="hidden w-40 shrink-0 sm:block">
              <Select
                aria-label={t("app.budgetState")}
                fullWidth
                value={params.get("budget") ?? "all"}
                onChange={(key) => {
                  if (key !== null) setParam("budget", String(key));
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="all">{t("app.allBudgets")}</ListBox.Item>
                    <ListBox.Item id="near">{t("app.nearLimit")}</ListBox.Item>
                    <ListBox.Item id="over">{t("app.overLimit")}</ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <div className="hidden w-40 shrink-0 sm:block">
              <Select
                aria-label={t("app.sortBy")}
                fullWidth
                value={params.get("sort") ?? "risk"}
                onChange={(key) => {
                  if (key !== null) setParam("sort", String(key));
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="risk">{t("app.sortRisk")}</ListBox.Item>
                    <ListBox.Item id="name">{t("app.sortName")}</ListBox.Item>
                    <ListBox.Item id="spend">{t("app.sortSpend")}</ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <div
              className="hidden shrink-0 items-center rounded-xl bg-[var(--surface-secondary)] p-1 sm:flex"
              role="group"
              aria-label={t("app.viewMode")}
            >
              <button
                className={`grid size-8 place-items-center rounded-lg ${preferences.keyView === "table" ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}
                onClick={() => preferences.setKeyView("table")}
                aria-label={t("app.tableView")}
              >
                <List size={17} />
              </button>
              <button
                className={`grid size-8 place-items-center rounded-lg ${preferences.keyView === "cards" ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}
                onClick={() => preferences.setKeyView("cards")}
                aria-label={t("app.cardView")}
              >
                <Grid2X2 size={17} />
              </button>
            </div>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 border-b border-indigo-500/15 bg-[var(--accent-soft)] px-3.5 py-2 max-sm:mb-2 max-sm:rounded-xl max-sm:border">
            <strong className="mr-auto text-xs text-[var(--accent-soft-foreground)]">
              {t("app.selectedCount", { count: selected.size })}
            </strong>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => bulkSetEnabled(true)}
              isDisabled={busy}
            >
              {t("app.enableSelected")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => bulkSetEnabled(false)}
              isDisabled={busy}
            >
              {t("app.disableSelected")}
            </Button>
            <Button size="sm" variant="ghost" onPress={() => setSelected(new Set())}>
              {t("app.clearSelection")}
            </Button>
          </div>
        )}

        {error ? (
          <div className="grid min-h-64 place-content-center justify-items-center gap-2 p-7 text-center text-[var(--muted)]">
            <ShieldAlert size={24} className="text-[var(--danger)]" />
            <strong className="text-sm text-[var(--foreground)]">{t("keys.loadFailed")}</strong>
            <p className="m-0 max-w-lg text-xs">{error}</p>
            <Button size="sm" variant="secondary" onPress={() => load()}>
              {t("keys.refresh")}
            </Button>
          </div>
        ) : loading ? (
          <div className="grid gap-px bg-[var(--separator)]">
            {LOADING_ROW_KEYS.map((key) => (
              <div className="h-[70px] animate-pulse bg-[var(--surface-secondary)]" key={key} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid min-h-64 place-content-center justify-items-center gap-2 p-7 text-center text-[var(--muted)]">
            <KeyRound size={28} className="text-[var(--accent)]" />
            <strong className="text-sm text-[var(--foreground)]">
              {keys.length ? t("app.noFilteredKeys") : t("keys.empty")}
            </strong>
            {!keys.length && (
              <Link className="font-semibold text-[var(--accent-soft-foreground)]" to="/keys/new">
                {t("keys.newKey")}
              </Link>
            )}
          </div>
        ) : preferences.keyView === "table" ? (
          <div className="hidden w-full overflow-x-auto sm:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-[color-mix(in_srgb,var(--surface-secondary)_55%,var(--surface))] text-[10px] font-bold uppercase tracking-wide text-[var(--muted)] [&>th]:border-b [&>th]:border-[var(--separator)] [&>th]:px-3.5 [&>th]:py-3">
                  <th>
                    <input
                      type="checkbox"
                      aria-label={t("app.selectAll")}
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? new Set(filtered.map((item) => item.id))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th>{t("keys.colIdName")}</th>
                  <th>{t("keys.colStatus")}</th>
                  <th>{t("keys.colUsage")}</th>
                  <th>{t("keys.colRpm")}</th>
                  <th>{t("keys.colModels")}</th>
                  <th className="text-right">
                    <Ellipsis size={18} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    className="text-xs transition hover:bg-[color-mix(in_srgb,var(--accent-soft)_45%,transparent)] [&>td]:border-b [&>td]:border-[var(--separator)] [&>td]:px-3.5 [&>td]:py-3 last:[&>td]:border-b-0"
                    key={item.id}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          })
                        }
                        aria-label={item.name || item.id}
                      />
                    </td>
                    <td>
                      <Link
                        to={`/keys/${encodeURIComponent(item.id)}/usage`}
                        className="flex min-w-48 items-center gap-2.5"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)]">
                          <KeyRound size={17} />
                        </span>
                        <span className="grid min-w-0 gap-0.5">
                          <strong className="text-[13px]">{item.name || item.id}</strong>
                          <code className="max-w-56 truncate text-[10px] text-[var(--muted)]">
                            {item.id} · {item.key_preview}
                          </code>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <StatusChip item={item} />
                    </td>
                    <td>
                      <UsageBar item={item} />
                    </td>
                    <td>
                      <strong className="tabular-nums">{item.rpm || "∞"}</strong>
                    </td>
                    <td>
                      <ModelAliases aliases={aliasesOf(item)} visibleCount={2} />
                    </td>
                    <td>
                      <KeyActions item={item} onReset={onReset} onConfirm={setConfirmAction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!error && !loading && filtered.length > 0 && (
          <div
            className={`${preferences.keyView === "cards" ? "grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3 p-3" : "grid gap-2.5 sm:hidden"}`}
          >
            {filtered.map((item) => (
              <KeyCard key={item.id} item={item} onReset={onReset} onConfirm={setConfirmAction} />
            ))}
          </div>
        )}
        {!error && !loading && (
          <div className="flex min-h-11 items-center justify-end border-t border-[var(--separator)] px-3.5 text-[10px] text-[var(--muted)] max-sm:hidden">
            <span>
              {t("app.showingKeys", {
                count: filtered.length,
                total: keys.length,
              })}
            </span>
          </div>
        )}
      </div>

      <ConfirmDialog
        key={confirmAction ? `${confirmAction.kind}-${confirmAction.key.id}` : "closed"}
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={runConfirmed}
        busy={busy}
      />
      {plain && (
        <PlainKeyModal plainKey={plain.value} title={plain.title} onClose={() => setPlain(null)} />
      )}
    </section>
  );
}

// Kept as compatibility exports while create/edit pages are migrated to the
// global responsive shell. They deliberately render nothing now.
export function MobileFormHeader(_props: { title: string; backTo: string }) {
  return null;
}
export function MobileTabBar(_props: {
  active: "keys" | "usage" | "new";
  showUsage?: boolean;
  usagePath?: string;
}) {
  return null;
}
