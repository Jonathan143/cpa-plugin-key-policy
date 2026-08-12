import { Button, Chip } from "@heroui/react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Coins,
  Database,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchKeyUsage } from "../api/keys";
import LoadingState from "../components/LoadingState";
import { useT } from "../i18n";
import type { AliasUsageEntry, KeyUsageResponse, UsageWindow } from "../types";

type WindowName = "daily" | "weekly";

interface UsageSummary {
  spend: number;
  calls: number;
  input: number;
  output: number;
  cached: number;
  totalTokens: number;
}

function usd(value: number): string {
  return `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
}

function integer(value: number): string {
  return value > 0 ? Math.round(value).toLocaleString("en-US") : "0";
}

function compactTokens(value: number): string {
  const safeValue = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(safeValue);
}

function cacheRate(window: UsageWindow): string {
  const cached = window.cache_read_tokens ?? 0;
  const input = window.input_tokens ?? 0;
  const totalInput = cached + input;
  return totalInput > 0 ? `${Math.round((cached / totalInput) * 100)}%` : "—";
}

function summarize(aliases: AliasUsageEntry[], windowName: WindowName): UsageSummary {
  const windows = aliases.map((alias) => alias[windowName]);
  const input = windows.reduce((sum, item) => sum + (item.input_tokens ?? 0), 0);
  const output = windows.reduce((sum, item) => sum + (item.output_tokens ?? 0), 0);
  const cached = windows.reduce((sum, item) => sum + (item.cache_read_tokens ?? 0), 0);

  return {
    spend: windows.reduce((sum, item) => sum + (item.total_usd ?? 0), 0),
    calls: windows.reduce((sum, item) => sum + (item.call_count ?? 0), 0),
    input,
    output,
    cached,
    totalTokens: input + output + cached,
  };
}

export default function KeyUsage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const [data, setData] = useState<KeyUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [windowName, setWindowName] = useState<WindowName>("daily");

  useEffect(() => {
    let alive = true;
    const keyId = decodeURIComponent(id ?? "");
    if (!keyId) {
      setError(t("keyUsage.notFound"));
      setLoading(false);
      return;
    }
    void fetchKeyUsage(keyId)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((caught) => {
        if (alive) setError((caught as Error).message ?? t("keyUsage.loadFailed"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, t]);

  const summaries = useMemo(() => {
    const aliases = data?.aliases ?? [];
    return {
      daily: summarize(aliases, "daily"),
      weekly: summarize(aliases, "weekly"),
    };
  }, [data]);

  const refresh = async () => {
    const keyId = decodeURIComponent(id ?? "");
    if (!keyId) return;

    setRefreshing(true);
    setError("");
    try {
      setData(await fetchKeyUsage(keyId));
    } catch (caught) {
      setError((caught as Error).message ?? t("keyUsage.loadFailed"));
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <LoadingState label={t("keyUsage.loading")} />;
  if (!data)
    return (
      <div className="rounded-xl border border-red-500/20 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
        {error || t("keyUsage.notFound")}
      </div>
    );

  const aliases = data.aliases ?? [];
  const currentWindow = (alias: AliasUsageEntry): UsageWindow => alias[windowName];

  const spendCards = [
    {
      name: "daily" as const,
      label: t("keyUsage.mobile.todaySpend"),
      limit: data.daily_limit_usd,
      summary: summaries.daily,
      tone: "bg-indigo-500",
      chipTone: "bg-indigo-500/10 text-indigo-500",
    },
    {
      name: "weekly" as const,
      label: t("keyUsage.mobile.weekSpend"),
      limit: data.weekly_limit_usd,
      summary: summaries.weekly,
      tone: "bg-emerald-500",
      chipTone: "bg-emerald-500/10 text-emerald-600",
    },
  ];

  const metricCards: Array<{
    label: string;
    daily: string;
    weekly: string;
    icon: LucideIcon;
    tone: string;
  }> = [
    {
      label: t("keyUsage.colCalls"),
      daily: integer(summaries.daily.calls),
      weekly: integer(summaries.weekly.calls),
      icon: Activity,
      tone: "bg-indigo-500/10 text-indigo-500",
    },
    {
      label: t("keyUsage.colTotalTokens"),
      daily: compactTokens(summaries.daily.totalTokens),
      weekly: compactTokens(summaries.weekly.totalTokens),
      icon: Coins,
      tone: "bg-violet-500/10 text-violet-500",
    },
    {
      label: t("keyUsage.colInput"),
      daily: compactTokens(summaries.daily.input),
      weekly: compactTokens(summaries.weekly.input),
      icon: ArrowDownToLine,
      tone: "bg-blue-500/10 text-blue-500",
    },
    {
      label: t("keyUsage.colOutput"),
      daily: compactTokens(summaries.daily.output),
      weekly: compactTokens(summaries.weekly.output),
      icon: ArrowUpFromLine,
      tone: "bg-orange-500/10 text-orange-500",
    },
    {
      label: t("keyUsage.colCache"),
      daily: compactTokens(summaries.daily.cached),
      weekly: compactTokens(summaries.weekly.cached),
      icon: Database,
      tone: "bg-emerald-500/10 text-emerald-600",
    },
  ];

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            to="/keys"
            className="mt-1 grid size-9 place-items-center rounded-xl border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-secondary)]"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="m-0 text-[10px] font-bold tracking-[.14em] text-[var(--accent-soft-foreground)]">
              USAGE INSIGHTS
            </p>
            <h1 className="mb-1 mt-0.5 text-3xl font-bold tracking-tight">{t("keyUsage.title")}</h1>
            <p className="m-0 font-mono text-xs text-[var(--muted)]">
              {data.key_id} · {data.key_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onPress={refresh} isDisabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} size={16} />
            {refreshing ? t("keyUsage.refreshing") : t("keyUsage.refresh")}
          </Button>
          <Link to={`/keys/${encodeURIComponent(data.key_id)}/edit`}>
            <Button variant="secondary">
              <Pencil size={16} />
              {t("keys.edit")}
            </Button>
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {spendCards.map((card) => {
          const ratio = card.limit > 0 ? card.summary.spend / card.limit : 0;
          const percentage = Math.round(ratio * 100);
          return (
            <div
              key={card.name}
              className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="m-0 text-sm font-semibold text-[var(--muted)]">{card.label}</p>
                  <strong className="mt-1 block text-3xl font-bold tabular-nums">
                    {usd(card.summary.spend)}
                  </strong>
                </div>
                <span className={`rounded-xl px-3 py-2 text-xs font-semibold ${card.chipTone}`}>
                  {t("keyUsage.mobile.limit")}{" "}
                  {card.limit > 0 ? usd(card.limit) : t("keyUsage.mobile.noLimit")}
                </span>
              </div>
              <div className="mt-7 h-2 overflow-hidden rounded-full bg-[var(--surface-tertiary)]">
                <span
                  className={`block h-full rounded-full ${ratio >= 1 ? "bg-[var(--danger)]" : card.tone}`}
                  style={{ width: `${card.limit > 0 ? Math.min(100, ratio * 100) : 0}%` }}
                />
              </div>
              <div className="mt-3 flex justify-between text-xs text-[var(--muted)]">
                <span>
                  {t("keyUsage.used")} {card.limit > 0 ? `${percentage}%` : "—"}
                </span>
                <span>
                  {t("keyUsage.mobile.remaining")}{" "}
                  {card.limit > 0
                    ? usd(Math.max(0, card.limit - card.summary.spend))
                    : t("keyUsage.mobile.noLimit")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {metricCards.map(({ label, daily, weekly, icon: Icon, tone }) => (
          <div
            key={label}
            className="flex min-h-28 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
          >
            <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tone}`}>
              <Icon size={22} />
            </span>
            <div className="min-w-0">
              <small className="block truncate text-xs font-semibold text-[var(--muted)]">
                {label}
              </small>
              <strong className="block text-2xl font-bold tabular-nums">{daily}</strong>
              <small className="block truncate text-[11px] text-[var(--muted)]">
                {t("keyUsage.tabWeekly")} {weekly}
              </small>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--separator)] px-5 py-4">
          <div>
            <h2 className="m-0 text-base font-bold">{t("keyUsage.modelUsageDetails")}</h2>
            <p className="mb-0 mt-1 text-xs text-[var(--muted)]">
              {aliases.length} {t("keyUsage.mobile.models")}
            </p>
          </div>
          <div
            className="flex rounded-xl bg-[var(--surface-secondary)] p-1"
            role="tablist"
            aria-label={t("keyUsage.windowToggle")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={windowName === "daily"}
              className={`rounded-lg px-4 py-2 text-xs ${windowName === "daily" ? "bg-[var(--surface)] font-semibold shadow-sm" : "text-[var(--muted)]"}`}
              onClick={() => setWindowName("daily")}
            >
              {t("keyUsage.tabDaily")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={windowName === "weekly"}
              className={`rounded-lg px-4 py-2 text-xs ${windowName === "weekly" ? "bg-[var(--surface)] font-semibold shadow-sm" : "text-[var(--muted)]"}`}
              onClick={() => setWindowName("weekly")}
            >
              {t("keyUsage.tabWeekly")}
            </button>
          </div>
        </div>
        {aliases.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--muted)]">
            {t("keyUsage.noAlias")}
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-[var(--surface-secondary)] text-[10px] uppercase text-[var(--muted)] [&>th]:px-5 [&>th]:py-3">
                  <th>{t("keyUsage.colAlias")}</th>
                  <th className="text-right">{t("keyUsage.colCalls")}</th>
                  <th className="text-right">{t("keyUsage.colInput")}</th>
                  <th className="text-right">{t("keyUsage.colOutput")}</th>
                  <th className="text-right">{t("keyUsage.colCache")}</th>
                  <th className="text-right">{t("keyUsage.colHitRate")}</th>
                  <th className="text-right">{t("keyUsage.colUsd")}</th>
                </tr>
              </thead>
              <tbody>
                {aliases.map((alias) => {
                  const value = currentWindow(alias);
                  return (
                    <tr
                      key={alias.alias}
                      className={`text-xs [&>td]:border-t [&>td]:border-[var(--separator)] [&>td]:px-5 [&>td]:py-4 ${alias.in_config ? "" : "opacity-60"}`}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-500/10 font-bold text-indigo-500">
                            {alias.alias.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <code className="font-semibold">{alias.alias}</code>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted)]">
                              <span>{alias.provider}</span>
                              <Chip
                                size="sm"
                                variant="soft"
                                color={alias.billing_mode === "per_call" ? "accent" : "success"}
                              >
                                {alias.billing_mode === "per_call"
                                  ? t("keyUsage.billingPerCall")
                                  : t("keyUsage.billingTokens")}
                              </Chip>
                              {!alias.in_config && (
                                <span className="text-amber-500">{t("keyUsage.notInConfig")}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right font-mono">{integer(value.call_count ?? 0)}</td>
                      <td className="text-right font-mono">
                        {compactTokens(value.input_tokens ?? 0)}
                      </td>
                      <td className="text-right font-mono">
                        {compactTokens(value.output_tokens ?? 0)}
                      </td>
                      <td className="text-right font-mono">
                        {compactTokens(value.cache_read_tokens ?? 0)}
                      </td>
                      <td className="text-right font-mono">{cacheRate(value)}</td>
                      <td className="text-right font-bold tabular-nums">
                        {usd(value.total_usd ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
