import { Button, Chip, Input, ListBox, Select, Switch, toast } from "@heroui/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Network,
  Pencil,
  Plus,
  Route,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  classifyPreview,
  deleteAlias,
  deleteClassifyRule,
  fetchAliases,
  fetchClassifyRules,
  fetchCredentialDescriptors,
  reorderClassifyRules,
  upsertAlias,
  upsertClassifyRule,
} from "../api/mappings";
import LoadingState from "../components/LoadingState";
import { useT } from "../i18n";
import type {
  AliasMapping,
  AliasTarget,
  ClassifyPreviewResponse,
  ClassifyRule,
  CredentialDescriptor,
} from "../types";

const fieldClass =
  "min-h-10 w-full rounded-xl border border-[var(--field-border)] bg-[var(--field-background)] px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent-soft)] disabled:bg-[var(--surface-secondary)] disabled:text-[var(--muted)]";
const labelClass = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

function aliasTargetKey(target: AliasTarget): string {
  return `${target.provider}|${target.group ?? ""}|${target.target_model}`;
}

export default function Mapping() {
  const t = useT();
  const location = useLocation();
  const [tab, setTab] = useState<"alias" | "classify">(
    (location.state as { mappingTab?: "alias" | "classify" } | null)?.mappingTab ?? "alias",
  );
  return (
    <section className="grid gap-6">
      <header>
        <p className="m-0 text-[10px] font-bold tracking-[.14em] text-[var(--accent-soft-foreground)]">
          ROUTING CONTROL
        </p>
        <h1 className="mb-1 mt-0.5 text-3xl font-bold tracking-tight">{t("mapping.title")}</h1>
        <p className="m-0 text-sm text-[var(--muted)]">{t("app.mappingSubtitle")}</p>
      </header>
      <div className="inline-flex w-fit rounded-xl bg-[var(--surface-secondary)] p-1">
        <button
          className={`rounded-lg px-4 py-2 text-xs ${tab === "alias" ? "bg-[var(--surface)] font-semibold shadow-sm" : "text-[var(--muted)]"}`}
          onClick={() => setTab("alias")}
        >
          {t("mapping.aliasTab")}
        </button>
        <button
          className={`rounded-lg px-4 py-2 text-xs ${tab === "classify" ? "bg-[var(--surface)] font-semibold shadow-sm" : "text-[var(--muted)]"}`}
          onClick={() => setTab("classify")}
        >
          {t("mapping.classifyTab")}
        </button>
      </div>
      {tab === "alias" ? <AliasList /> : <RuleList />}
    </section>
  );
}

function AliasList() {
  const t = useT();
  const nav = useNavigate();
  const [items, setItems] = useState<AliasMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchAliases());
    } catch (caught) {
      setError(String(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const remove = async (name: string) => {
    try {
      await deleteAlias(name);
      toast.success(t("app.aliasDeleted"));
      await load();
    } catch (caught) {
      setError(String(caught));
    }
  };
  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <Button variant="primary" onPress={() => nav("/mapping/alias/new")}>
          <Plus size={16} />
          {t("mapping.newAlias")}
        </Button>
      </div>
      {error && (
        <div className="rounded-xl bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        {loading ? (
          <LoadingState label={t("keys.loading")} variant="list" rows={4} />
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--muted)]">{t("app.noAliases")}</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-[var(--surface-secondary)] text-[10px] uppercase text-[var(--muted)] [&>th]:px-4 [&>th]:py-3">
                  <th>{t("mapping.alias.name")}</th>
                  <th>{t("mapping.alias.targets")}</th>
                  <th>{t("mapping.alias.dispatch")}</th>
                  <th>{t("mapping.alias.billing")}</th>
                  <th className="text-right">{t("keys.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((alias) => (
                  <tr
                    key={alias.alias}
                    className="text-xs [&>td]:border-t [&>td]:border-[var(--separator)] [&>td]:px-4 [&>td]:py-3"
                  >
                    <td>
                      <code className="font-semibold">{alias.alias}</code>
                    </td>
                    <td>
                      <div className="flex max-w-lg flex-wrap gap-1.5">
                        {alias.targets.slice(0, 3).map((target) => (
                          <span
                            key={aliasTargetKey(target)}
                            className="rounded-lg bg-[var(--surface-secondary)] px-2 py-1 text-[10px] text-[var(--muted)]"
                          >
                            {target.provider} · {target.target_model}
                            {target.group ? ` · ${target.group}` : ""}
                          </span>
                        ))}
                        {alias.targets.length > 3 && (
                          <span className="rounded-lg bg-[var(--surface-secondary)] px-2 py-1 text-[10px] text-[var(--muted)]">
                            +{alias.targets.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color="accent">
                        {alias.dispatch === "priority"
                          ? t("mapping.alias.priority")
                          : t("mapping.alias.roundRobin")}
                      </Chip>
                    </td>
                    <td className="text-[var(--muted)]">
                      {alias.billing_mode === "per_call"
                        ? `${alias.per_call_usd ?? 0} / ${t("mapping.alias.perCallUnit")}`
                        : `${t("mapping.alias.input")} ${alias.input_price_per_million ?? 0} · ${t("mapping.alias.output")} ${alias.output_price_per_million ?? 0}`}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          onPress={() => nav(`/mapping/alias/${encodeURIComponent(alias.alias)}`)}
                          aria-label={t("mapping.edit")}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="danger-soft"
                          onPress={() => remove(alias.alias)}
                          aria-label={t("mapping.delete")}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RuleList() {
  const t = useT();
  const nav = useNavigate();
  const [rules, setRules] = useState<ClassifyRule[]>([]);
  const [preview, setPreview] = useState<ClassifyPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [items, descriptors] = await Promise.all([
        fetchClassifyRules(),
        fetchCredentialDescriptors().catch(() => [] as CredentialDescriptor[]),
      ]);
      setRules(items);
      setPreview(await classifyPreview(descriptors).catch(() => null));
    } catch (caught) {
      setError(String(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const applyOrder = async (ordered: ClassifyRule[]) => {
    setRules(ordered);
    try {
      await reorderClassifyRules(ordered.map((rule) => rule.name));
    } catch (caught) {
      setError(String(caught));
      await load();
    }
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    void applyOrder(next);
  };
  const remove = async (name: string) => {
    try {
      await deleteClassifyRule(name);
      toast.success(t("app.ruleDeleted"));
      await load();
    } catch (caught) {
      setError(String(caught));
    }
  };
  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <Button variant="primary" onPress={() => nav("/mapping/rule/new")}>
          <Plus size={16} />
          {t("mapping.newRule")}
        </Button>
      </div>
      {error && (
        <div className="rounded-xl bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}
      <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-cyan-500/10 text-cyan-500">
            <ShieldCheck size={16} />
          </span>
          <div>
            <h2 className="text-sm font-bold">{t("mapping.rule.builtin")}</h2>
            <p className="text-[10px] text-[var(--muted)]">{t("mapping.rule.builtinReadOnly")}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <code className="rounded-xl bg-[var(--surface-secondary)] p-3 text-xs">
            plan_type → &lt;detected&gt;
          </code>
          <code className="rounded-xl bg-[var(--surface-secondary)] p-3 text-xs">
            tier → &lt;detected&gt;
          </code>
        </div>
        <p className="mb-0 mt-3 text-[11px] text-[var(--muted)]">{t("mapping.rule.builtinDesc")}</p>
      </article>
      {loading ? (
        <LoadingState
          label={t("keys.loading")}
          variant="list"
          rows={3}
          className="rounded-2xl border border-[var(--border)] shadow-sm"
        />
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)]">
          {t("app.noRules")}
        </div>
      ) : (
        <div className="grid gap-2">
          {rules.map((rule, index) => (
            <RuleRow
              key={rule.name}
              rule={rule}
              index={index}
              total={rules.length}
              preview={preview}
              onMove={(direction) => move(index, direction)}
              onEdit={() => nav(`/mapping/rule/${encodeURIComponent(rule.name)}`)}
              onDelete={() => remove(rule.name)}
              draggable
              onDragStart={() => setDragged(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragged === null || dragged === index) return;
                const next = [...rules];
                const [item] = next.splice(dragged, 1);
                next.splice(index, 0, item);
                setDragged(null);
                void applyOrder(next);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  index,
  total,
  preview,
  onMove,
  onEdit,
  onDelete,
  ...dragProps
}: {
  rule: ClassifyRule;
  index: number;
  total: number;
  preview: ClassifyPreviewResponse | null;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
} & React.HTMLAttributes<HTMLElement>) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const matches = preview?.groups[rule.group.toLowerCase()] ?? [];
  return (
    <article
      {...dragProps}
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
    >
      <div className="flex items-center gap-2 p-3">
        <GripVertical size={17} className="cursor-grab text-[var(--muted)]" />
        <div className="flex gap-0.5">
          <button
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="grid size-7 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-secondary)] disabled:opacity-25"
          >
            <ArrowUp size={14} />
          </button>
          <button
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="grid size-7 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-secondary)] disabled:opacity-25"
          >
            <ArrowDown size={14} />
          </button>
        </div>
        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="grid min-w-0">
            <strong className="truncate text-xs">{rule.name}</strong>
            <code className="truncate text-[10px] text-[var(--muted)]">
              {rule.field}: {rule.pattern} → {rule.group}
            </code>
          </span>
        </button>
        <Chip size="sm" variant="soft" color={matches.length ? "success" : "default"}>
          {matches.length
            ? t("mapping.rule.matchCount", { n: matches.length })
            : t("mapping.rule.matchCountZero")}
        </Chip>
        <span
          className={`size-2 rounded-full ${rule.enabled ? "bg-emerald-500" : "bg-slate-400"}`}
        />
        <Button isIconOnly size="sm" variant="ghost" onPress={onEdit}>
          <Pencil size={14} />
        </Button>
        <Button isIconOnly size="sm" variant="danger-soft" onPress={onDelete}>
          <Trash2 size={14} />
        </Button>
      </div>
      {expanded && (
        <div className="border-t border-[var(--separator)] p-3">
          <div className="flex flex-wrap gap-1.5">
            {matches.length ? (
              matches.map((file) => (
                <code
                  key={file}
                  className="rounded-lg bg-[var(--surface-secondary)] px-2 py-1 text-[10px]"
                >
                  {file}
                </code>
              ))
            ) : (
              <span className="text-xs text-[var(--muted)]">{t("mapping.rule.noFiles")}</span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

const ALIAS_DRAFT_KEY = "cpa-key-policy:alias-form-draft";
function readDraft(): AliasMapping | null {
  try {
    const value = sessionStorage.getItem(ALIAS_DRAFT_KEY);
    return value ? (JSON.parse(value) as AliasMapping) : null;
  } catch {
    return null;
  }
}
function writeDraft(value: AliasMapping) {
  try {
    sessionStorage.setItem(ALIAS_DRAFT_KEY, JSON.stringify(value));
  } catch {
    /* optional session recovery */
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(ALIAS_DRAFT_KEY);
  } catch {
    /* optional session recovery */
  }
}

export function AliasEditForm() {
  const t = useT();
  const nav = useNavigate();
  const location = useLocation();
  const { aliasName } = useParams();
  const isNew = aliasName === "new" || !aliasName;
  const decodedAliasName = decodeURIComponent(aliasName ?? "");
  const returned = location.state as {
    draftAlias?: AliasMapping;
    pickedTargets?: AliasTarget[];
  } | null;
  const initialDraft = useRef(returned?.draftAlias ?? readDraft()).current;
  const shouldLoadExisting =
    !isNew && !returned?.draftAlias && initialDraft?.alias !== decodedAliasName;
  const [value, setValue] = useState<AliasMapping>(() => {
    return initialDraft
      ? { ...initialDraft, targets: returned?.pickedTargets ?? initialDraft.targets }
      : {
          alias: isNew ? "" : decodedAliasName,
          targets: [],
          dispatch: "round-robin",
          billing_mode: "tokens",
          input_price_per_million: 0,
          output_price_per_million: 0,
          cache_read_price_per_million: 0,
          per_call_usd: 0,
        };
  });
  const [ready, setReady] = useState(!shouldLoadExisting);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!ready) return;
    writeDraft(value);
  }, [ready, value]);
  useEffect(() => {
    if (!shouldLoadExisting) return;
    let alive = true;
    void fetchAliases()
      .then((items) => {
        if (!alive) return;
        const found = items.find((item) => item.alias === decodedAliasName);
        if (found) setValue(found);
      })
      .catch((caught) => {
        if (alive) setError(String(caught));
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [decodedAliasName, shouldLoadExisting]);
  useEffect(() => {
    const pickedTargets = returned?.pickedTargets;
    if (!pickedTargets) return;
    setValue((current) => ({
      ...(returned?.draftAlias ?? current),
      targets: pickedTargets,
    }));
  }, [returned?.pickedTargets, returned?.draftAlias]);
  const leave = () => {
    clearDraft();
    nav("/mapping", { state: { mappingTab: "alias" } });
  };
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await upsertAlias(value);
      clearDraft();
      toast.success(t("app.aliasSaved"));
      nav("/mapping", { state: { mappingTab: "alias" } });
    } catch (caught) {
      setError(String(caught));
    } finally {
      setSaving(false);
    }
  };
  const pick = () => {
    writeDraft(value);
    nav("/mapping/pick-target", {
      state: {
        returnTo: `/mapping/alias/${isNew ? "new" : encodeURIComponent(value.alias || aliasName || "new")}`,
        currentTargets: value.targets,
        draftAlias: value,
      },
    });
  };
  return (
    <EditorShell
      title={isNew ? t("mapping.alias.newTitle") : t("mapping.alias.editTitle")}
      onBack={leave}
    >
      <div>
        <label className={labelClass}>{t("mapping.alias.name")}</label>
        <Input
          value={value.alias}
          onChange={(event) => setValue({ ...value, alias: event.target.value })}
          disabled={!isNew}
          className="font-mono"
          fullWidth
        />
      </div>
      <div>
        <label className={labelClass}>{t("mapping.alias.dispatch")}</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["round-robin", "priority"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setValue({ ...value, dispatch: mode })}
              className={`rounded-xl border p-3 text-left ${value.dispatch === mode ? "border-indigo-500/30 bg-[var(--accent-soft)]" : "border-[var(--border)]"}`}
            >
              <strong className="block text-xs">
                {mode === "priority" ? t("mapping.alias.priority") : t("mapping.alias.roundRobin")}
              </strong>
              <span className="mt-1 block text-[10px] text-[var(--muted)]">
                {mode === "priority"
                  ? t("mapping.alias.priorityDesc")
                  : t("mapping.alias.roundRobinDesc")}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelClass}>{t("mapping.alias.targets")}</label>
        <div className="mb-2 grid gap-2">
          {value.targets.map((target, index) => (
            <div
              key={aliasTargetKey(target)}
              className="flex items-center justify-between rounded-xl bg-[var(--surface-secondary)] px-3 py-2"
            >
              <code className="text-[11px]">
                {target.provider} · {target.target_model}
                {target.group ? ` · ${target.group}` : ""}
              </code>
              <button
                onClick={() =>
                  setValue({
                    ...value,
                    targets: value.targets.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
                className="text-[var(--muted)] hover:text-[var(--danger)]"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <Button variant="secondary" onPress={pick}>
          <Plus size={15} />
          {t("mapping.alias.addTarget")}
        </Button>
      </div>
      <div>
        <label className={labelClass}>{t("mapping.alias.billing")}</label>
        <Switch
          isSelected={value.billing_mode === "per_call"}
          onChange={(selected) =>
            setValue({ ...value, billing_mode: selected ? "per_call" : "tokens" })
          }
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            {value.billing_mode === "per_call"
              ? t("mapping.alias.perCall")
              : t("mapping.alias.tokens")}
          </Switch.Content>
        </Switch>
      </div>
      {value.billing_mode === "tokens" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["input_price_per_million", t("mapping.alias.input")],
            ["output_price_per_million", t("mapping.alias.output")],
            ["cache_read_price_per_million", t("mapping.alias.cache")],
          ].map(([field, label]) => (
            <div key={field}>
              <label className={labelClass}>{label} ($/1M)</label>
              <input
                className={fieldClass}
                type="number"
                step="0.01"
                value={Number(value[field as keyof AliasMapping]) || 0}
                onChange={(event) =>
                  setValue({ ...value, [field]: Number.parseFloat(event.target.value) || 0 })
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <div>
          <label className={labelClass}>{t("mapping.alias.perCallUnit")}</label>
          <input
            className={fieldClass}
            type="number"
            step="0.0001"
            value={value.per_call_usd ?? 0}
            onChange={(event) =>
              setValue({ ...value, per_call_usd: Number.parseFloat(event.target.value) || 0 })
            }
          />
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="primary" onPress={save} isDisabled={saving}>
          {saving ? "…" : t("mapping.save")}
        </Button>
        <Button variant="ghost" onPress={leave}>
          {t("mapping.cancel")}
        </Button>
      </div>
    </EditorShell>
  );
}

export function RuleEditForm() {
  const t = useT();
  const nav = useNavigate();
  const { ruleName } = useParams();
  const isNew = ruleName === "new" || !ruleName;
  const [rule, setRule] = useState<ClassifyRule>({
    name: isNew ? "" : decodeURIComponent(ruleName),
    field: "plan_type",
    pattern: "",
    group: "",
    enabled: true,
  });
  const [customField, setCustomField] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isNew) return;
    void fetchClassifyRules()
      .then((items) => {
        const found = items.find((item) => item.name === decodeURIComponent(ruleName));
        if (found) {
          if (["filename", "provider", "plan_type", "tier"].includes(found.field)) setRule(found);
          else {
            setCustomField(found.field);
            setRule({ ...found, field: "custom" });
          }
        }
      })
      .catch((caught) => setError(String(caught)));
  }, [isNew, ruleName]);
  let regexError = "";
  let regexValid = false;
  try {
    if (rule.pattern) {
      new RegExp(rule.pattern);
      regexValid = true;
    }
  } catch (caught) {
    regexError = String(caught).replace(/^Error: /, "");
  }
  const back = () => nav("/mapping", { state: { mappingTab: "classify" } });
  const save = async () => {
    if (!regexValid) {
      setError(t("mapping.rule.regexInvalid", { err: regexError }));
      return;
    }
    setSaving(true);
    try {
      await upsertClassifyRule({
        ...rule,
        field: rule.field === "custom" ? customField : rule.field,
      });
      toast.success(t("app.ruleSaved"));
      back();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setSaving(false);
    }
  };
  return (
    <EditorShell
      title={isNew ? t("mapping.rule.newTitle") : t("mapping.rule.editTitle")}
      onBack={back}
    >
      <div>
        <label className={labelClass}>{t("mapping.rule.name")}</label>
        <Input
          value={rule.name}
          onChange={(event) => setRule({ ...rule, name: event.target.value })}
          disabled={!isNew}
          fullWidth
        />
      </div>
      <div>
        <label className={labelClass}>{t("mapping.rule.field")}</label>
        <Select
          aria-label={t("mapping.rule.field")}
          fullWidth
          value={rule.field}
          onChange={(key) => {
            if (key !== null) setRule({ ...rule, field: String(key) });
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="filename">{t("mapping.rule.fieldFilename")}</ListBox.Item>
              <ListBox.Item id="provider">{t("mapping.rule.fieldProvider")}</ListBox.Item>
              <ListBox.Item id="plan_type">{t("mapping.rule.fieldPlanType")}</ListBox.Item>
              <ListBox.Item id="tier">{t("mapping.rule.fieldTier")}</ListBox.Item>
              <ListBox.Item id="custom">{t("mapping.rule.fieldCustom")}</ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      {rule.field === "custom" && (
        <div>
          <label className={labelClass}>{t("mapping.rule.customField")}</label>
          <input
            className={`${fieldClass} font-mono`}
            value={customField}
            onChange={(event) => setCustomField(event.target.value)}
          />
        </div>
      )}
      <div>
        <label className={labelClass}>{t("mapping.rule.regex")}</label>
        <input
          className={`${fieldClass} font-mono`}
          value={rule.pattern}
          onChange={(event) => setRule({ ...rule, pattern: event.target.value })}
          placeholder="^team$"
        />
        {regexValid && (
          <p className="mt-1 text-[10px] text-emerald-500">✓ {t("mapping.rule.regexValid")}</p>
        )}
        {regexError && (
          <p className="mt-1 text-[10px] text-[var(--danger)]">
            {t("mapping.rule.regexInvalid", { err: regexError })}
          </p>
        )}
      </div>
      <div>
        <label className={labelClass}>{t("mapping.rule.group")}</label>
        <input
          className={`${fieldClass} font-mono`}
          value={rule.group}
          onChange={(event) => setRule({ ...rule, group: event.target.value })}
          placeholder="team"
        />
      </div>
      <Switch
        isSelected={rule.enabled}
        onChange={(selected) => setRule({ ...rule, enabled: selected })}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>

          {t("mapping.rule.enabled")}
        </Switch.Content>
      </Switch>
      {error && (
        <div className="rounded-xl bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="primary" onPress={save} isDisabled={saving || !regexValid}>
          {saving ? "…" : t("mapping.save")}
        </Button>
        <Button variant="ghost" onPress={back}>
          {t("mapping.cancel")}
        </Button>
      </div>
    </EditorShell>
  );
}

function EditorShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto grid max-w-3xl gap-5">
      <header className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="grid size-9 place-items-center rounded-xl border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-secondary)]"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="m-0 text-[10px] font-bold tracking-[.14em] text-[var(--accent-soft-foreground)]">
            MAPPING EDITOR
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{title}</h1>
        </div>
      </header>
      <div className="grid gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
        {children}
      </div>
      <div className="sr-only">
        <Network />
        <Route />
      </div>
    </section>
  );
}
