import { Button, Chip, Input, Switch, Tooltip } from "@heroui/react";
import { Gauge, KeyRound, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAliases } from "../api/mappings";
import { formatTierLabel } from "../api/models";
import { useT } from "../i18n";
import { getPriceTable, lookupPrice, type PriceTable } from "../store/modelPrices";
import type { AliasMapping, KeyPublic, ModelRule } from "../types";
import ModelPicker from "./ModelPicker";

export interface KeyFormValues {
  id: string;
  name: string;
  enabled: boolean;
  rpm: number;
  models: ModelRule[];
  daily_limit_usd: number;
  weekly_limit_usd: number;
  allow_models_endpoint?: boolean;
}

interface Props {
  initial?: KeyPublic;
  idReadOnly?: boolean;
  submitLabel: string;
  onSubmit: (value: KeyFormValues) => Promise<void>;
  onCancel: () => void;
  error?: string;
  pickPath?: string;
  dangerLabel?: string;
  onDanger?: () => void;
  wizard?: boolean;
  wizardInitialStep?: number;
  draftKey?: string;
  preferInitialModels?: boolean;
}

interface PriceRow {
  input_price_per_million: number;
  output_price_per_million: number;
  cache_read_price_per_million: number;
  billing_mode: "tokens" | "per_call";
  per_call_usd: number;
}

function priceKey(model: { alias: string; group?: string }): string {
  const group = (model.group ?? "").toLowerCase();
  return (group ? `${group}|` : "") + model.alias.toLowerCase();
}

function parseNum(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const emptyPrice: PriceRow = {
  input_price_per_million: 0,
  output_price_per_million: 0,
  cache_read_price_per_million: 0,
  billing_mode: "tokens",
  per_call_usd: 0,
};

const numberClass =
  "min-h-10 w-full rounded-xl border border-[var(--field-border)] bg-[var(--field-background)] px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent-soft)]";
const labelClass = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const keyIdPattern = /^[A-Za-z][A-Za-z0-9-]*$/;
const keyIdCharacters = "abcdefghijklmnopqrstuvwxyz0123456789";
const reviewModelDisplayLimit = 4;
const wizardMaxStep = 2;
const wizardDraftVersion = 2;

function restoreWizardStep(step: number, version?: number): number {
  const restored = version === wizardDraftVersion ? step : step === 0 ? 0 : step - 1;
  return Math.max(0, Math.min(wizardMaxStep, restored));
}

function generateKeyId(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(
    randomBytes,
    (value) => keyIdCharacters[value % keyIdCharacters.length],
  ).join("");
  return `key-${suffix}`;
}

export default function KeyForm({
  initial,
  idReadOnly,
  submitLabel,
  onSubmit,
  onCancel,
  error,
  pickPath,
  dangerLabel,
  onDanger,
  wizard = false,
  wizardInitialStep = 0,
  draftKey,
  preferInitialModels = false,
}: Props) {
  const nav = useNavigate();
  const t = useT();
  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [rpm, setRpm] = useState(initial?.rpm ?? 0);
  const [dailyLimit, setDailyLimit] = useState(initial?.daily_limit_usd ?? 0);
  const [weeklyLimit, setWeeklyLimit] = useState(initial?.weekly_limit_usd ?? 0);
  const [allowModels, setAllowModels] = useState(initial?.allow_models_endpoint ?? false);
  const [models, setModels] = useState<ModelRule[]>(initial?.models ?? []);
  const [prices, setPrices] = useState<Record<string, PriceRow>>(() =>
    Object.fromEntries(
      (initial?.models ?? []).map((model) => [
        priceKey(model),
        {
          input_price_per_million: model.input_price_per_million ?? 0,
          output_price_per_million: model.output_price_per_million ?? 0,
          cache_read_price_per_million: model.cache_read_price_per_million ?? 0,
          billing_mode: model.billing_mode === "per_call" ? "per_call" : "tokens",
          per_call_usd: model.per_call_usd ?? 0,
        },
      ]),
    ),
  );
  const [globalAliases, setGlobalAliases] = useState<AliasMapping[]>([]);
  const [priceTable, setPriceTable] = useState<PriceTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [wizardStep, setWizardStep] = useState(
    Math.max(0, Math.min(wizardMaxStep, wizardInitialStep)),
  );
  const [draftReady, setDraftReady] = useState(!draftKey);

  useEffect(() => {
    let alive = true;
    void fetchAliases()
      .then((items) => {
        if (alive) setGlobalAliases(items);
      })
      .catch(() => {});
    void getPriceTable().then((table) => {
      if (alive) setPriceTable(table);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = sessionStorage.getItem(`cpa-key-policy:${draftKey}`);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<KeyFormValues> & {
          prices?: Record<string, PriceRow>;
          wizardStep?: number;
          wizardVersion?: number;
        };
        if (draft.id !== undefined) setId(draft.id);
        if (draft.name !== undefined) setName(draft.name);
        if (draft.enabled !== undefined) setEnabled(draft.enabled);
        if (draft.rpm !== undefined) setRpm(draft.rpm);
        if (draft.daily_limit_usd !== undefined) setDailyLimit(draft.daily_limit_usd);
        if (draft.weekly_limit_usd !== undefined) setWeeklyLimit(draft.weekly_limit_usd);
        if (draft.allow_models_endpoint !== undefined) setAllowModels(draft.allow_models_endpoint);
        if (draft.models && !preferInitialModels) setModels(draft.models);
        if (draft.prices && !preferInitialModels) setPrices(draft.prices);
        if (wizard && draft.wizardStep !== undefined) {
          setWizardStep(restoreWizardStep(draft.wizardStep, draft.wizardVersion));
        }
      }
    } catch {
      // Session draft recovery is best-effort.
    }
    setDraftReady(true);
  }, [draftKey, preferInitialModels, wizard]);

  useEffect(() => {
    if (!draftKey || !draftReady) return;
    try {
      sessionStorage.setItem(
        `cpa-key-policy:${draftKey}`,
        JSON.stringify({
          id,
          name,
          enabled,
          rpm,
          models,
          daily_limit_usd: dailyLimit,
          weekly_limit_usd: weeklyLimit,
          allow_models_endpoint: allowModels,
          prices,
          wizardStep,
          wizardVersion: wizardDraftVersion,
        }),
      );
    } catch {
      // The form remains usable when session storage is unavailable.
    }
  }, [
    allowModels,
    dailyLimit,
    draftKey,
    draftReady,
    enabled,
    id,
    models,
    name,
    prices,
    rpm,
    weeklyLimit,
    wizardStep,
  ]);

  const clearDraft = () => {
    if (!draftKey) return;
    try {
      sessionStorage.removeItem(`cpa-key-policy:${draftKey}`);
    } catch {
      /* optional recovery state */
    }
  };

  const handleModelsChange = useCallback((next: ModelRule[]) => {
    setModels(next);
    setPrices((previous) =>
      Object.fromEntries(
        next.map((model) => [priceKey(model), previous[priceKey(model)] ?? emptyPrice]),
      ),
    );
  }, []);

  const aliasSelected = useCallback(
    (alias: AliasMapping) =>
      alias.targets.every((target) =>
        models.some(
          (model) =>
            model.alias.toLowerCase() === alias.alias.toLowerCase() &&
            model.provider.toLowerCase() === target.provider.toLowerCase() &&
            model.target_model.toLowerCase() === target.target_model.toLowerCase() &&
            (model.group ?? "").toLowerCase() === (target.group ?? "").toLowerCase(),
        ),
      ),
    [models],
  );

  const toggleAlias = (alias: AliasMapping) => {
    if (aliasSelected(alias)) {
      handleModelsChange(
        models.filter((model) => model.alias.toLowerCase() !== alias.alias.toLowerCase()),
      );
      return;
    }
    const nextRules: ModelRule[] = alias.targets.map((target) => ({
      alias: alias.alias,
      provider: target.provider,
      target_model: target.target_model,
      group: target.group ?? "",
      billing_mode: alias.billing_mode,
      input_price_per_million: alias.input_price_per_million ?? 0,
      output_price_per_million: alias.output_price_per_million ?? 0,
      cache_read_price_per_million: alias.cache_read_price_per_million ?? 0,
      per_call_usd: alias.per_call_usd ?? 0,
    }));
    const retained = models.filter(
      (model) => model.alias.toLowerCase() !== alias.alias.toLowerCase(),
    );
    setModels([...retained, ...nextRules]);
    setPrices((previous) => {
      const next = { ...previous };
      for (const target of alias.targets)
        next[priceKey({ alias: alias.alias, group: target.group })] = {
          input_price_per_million: alias.input_price_per_million ?? 0,
          output_price_per_million: alias.output_price_per_million ?? 0,
          cache_read_price_per_million: alias.cache_read_price_per_million ?? 0,
          billing_mode: alias.billing_mode,
          per_call_usd: alias.per_call_usd ?? 0,
        };
      return next;
    });
  };

  const setPrice = (model: ModelRule, field: keyof PriceRow, value: string) => {
    const key = priceKey(model);
    setPrices((previous) => ({
      ...previous,
      [key]: {
        ...(previous[key] ?? emptyPrice),
        [field]:
          field === "billing_mode"
            ? value === "per_call"
              ? "per_call"
              : "tokens"
            : parseNum(value),
      },
    }));
  };

  const recommend = (model: ModelRule) => {
    const suggestion = lookupPrice(priceTable, model.target_model);
    if (!suggestion) return;
    const key = priceKey(model);
    setPrices((previous) => ({
      ...previous,
      [key]: {
        ...previous[key],
        input_price_per_million: suggestion.input_price_per_million,
        output_price_per_million: suggestion.output_price_per_million,
        cache_read_price_per_million: suggestion.cache_read_price_per_million,
      },
    }));
  };

  const uniqueModels = useMemo(
    () =>
      models.filter(
        (model, index, all) =>
          all.findIndex((candidate) => priceKey(candidate) === priceKey(model)) === index,
      ),
    [models],
  );
  const reviewModelNames = useMemo(
    () => [...new Set(models.map((model) => model.alias))],
    [models],
  );
  const visibleReviewModels = reviewModelNames.slice(0, reviewModelDisplayLimit);
  const hiddenReviewModelCount = reviewModelNames.length - visibleReviewModels.length;

  const openPicker = () => {
    if (!pickPath) return;
    nav(pickPath, {
      state: {
        models,
        draft: {
          id,
          name,
          enabled,
          rpm,
          daily_limit_usd: dailyLimit,
          weekly_limit_usd: weeklyLimit,
          allow_models_endpoint: allowModels,
          prices,
        },
      },
    });
  };

  const validateId = (): boolean => {
    if (idReadOnly) return true;
    if (!id.trim()) {
      setLocalError(t("keyForm.idRequired"));
      return false;
    }
    if (!keyIdPattern.test(id.trim())) {
      setLocalError(t("keyForm.idInvalid"));
      return false;
    }
    return true;
  };

  const submit = async () => {
    setLocalError("");
    if (!validateId()) return;
    setBusy(true);
    try {
      await onSubmit({
        id: id.trim(),
        name: name.trim(),
        enabled,
        rpm,
        daily_limit_usd: dailyLimit,
        weekly_limit_usd: weeklyLimit,
        allow_models_endpoint: allowModels,
        models: models.map((model) => ({ ...model, ...(prices[priceKey(model)] ?? emptyPrice) })),
      });
      clearDraft();
    } catch (caught) {
      const value = caught as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      };
      setLocalError(
        value.response?.data?.error?.message ?? value.message ?? t("keyForm.submitFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      noValidate
    >
      {wizard && (
        <ol className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          {[
            t("keyForm.mobile.sectionBasicLimits"),
            t("keyForm.mobile.sectionModels"),
            t("app.review"),
          ].map((label, index) => (
            <li
              key={label}
              className={`flex min-w-0 items-center gap-2 text-[10px] sm:text-xs ${index <= wizardStep ? "text-[var(--accent-soft-foreground)]" : "text-[var(--muted)]"}`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full ${index <= wizardStep ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-secondary)]"}`}
              >
                {index + 1}
              </span>
              <span className="truncate max-sm:hidden">{label}</span>
            </li>
          ))}
        </ol>
      )}
      <section
        id="overview"
        className={`${wizard && wizardStep !== 0 ? "hidden" : ""} rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6`}
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-indigo-500/10 text-indigo-500">
            <KeyRound size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold">{t("keyForm.mobile.sectionBasic")}</h2>
            <p className="text-xs text-[var(--muted)]">{t("app.basicHint")}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{t("keyForm.idLabel")}</label>
            <div className="flex items-center gap-2">
              <Input
                value={id}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (idReadOnly || nextId === "" || keyIdPattern.test(nextId)) {
                    setId(nextId);
                    if (
                      localError === t("keyForm.idRequired") ||
                      localError === t("keyForm.idInvalid")
                    ) {
                      setLocalError("");
                    }
                    return;
                  }
                  setLocalError(t("keyForm.idInvalid"));
                }}
                readOnly={idReadOnly}
                placeholder={t("keyForm.idPlaceholder")}
                pattern="[A-Za-z][A-Za-z0-9-]*"
                aria-describedby={!idReadOnly ? "key-id-hint" : undefined}
                autoFocus={!idReadOnly}
                fullWidth
                className={idReadOnly ? "font-mono" : "min-w-0 flex-1"}
              />
              {!idReadOnly && (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onPress={() => {
                    setId(generateKeyId());
                    if (
                      localError === t("keyForm.idRequired") ||
                      localError === t("keyForm.idInvalid")
                    ) {
                      setLocalError("");
                    }
                  }}
                >
                  <Sparkles size={14} />
                  {t("keyForm.generateId")}
                </Button>
              )}
            </div>
            {!idReadOnly && (
              <p id="key-id-hint" className="mb-0 mt-1.5 text-[10px] text-[var(--muted)]">
                {t("keyForm.idHint")}
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>{t("keyForm.nameLabel")}</label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("keyForm.namePlaceholder")}
              fullWidth
            />
          </div>
          <div>
            <label className={labelClass}>{t("keyForm.rpmLabel")}</label>
            <input
              className={numberClass}
              type="number"
              min={0}
              value={rpm}
              onChange={(event) => setRpm(Number.parseInt(event.target.value || "0", 10) || 0)}
            />
          </div>
          <div className="flex items-end">
            <Switch isSelected={enabled} onChange={setEnabled}>
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                {t("keyForm.enableKey")}
              </Switch.Content>
            </Switch>
          </div>
        </div>
      </section>

      <section
        id="policy"
        className={`${wizard && wizardStep !== 0 ? "hidden" : ""} rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6`}
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-cyan-500/10 text-cyan-500">
            <Gauge size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold">{t("keyForm.mobile.sectionLimits")}</h2>
            <p className="text-xs text-[var(--muted)]">{t("app.policyHint")}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{t("keyForm.dailyLimitLabel")}</label>
            <input
              className={numberClass}
              type="number"
              min={0}
              step="0.01"
              value={dailyLimit}
              onChange={(event) => setDailyLimit(parseNum(event.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>{t("keyForm.weeklyLimitLabel")}</label>
            <input
              className={numberClass}
              type="number"
              min={0}
              step="0.01"
              value={weeklyLimit}
              onChange={(event) => setWeeklyLimit(parseNum(event.target.value))}
            />
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
          <Switch isSelected={allowModels} onChange={setAllowModels}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              {t("keyForm.allowModelsLabel")}
            </Switch.Content>
          </Switch>
          <p className="mb-0 mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
            {t("keyForm.allowModelsHint")}
          </p>
        </div>
      </section>

      <section
        id="models"
        className={`${wizard && wizardStep !== 1 ? "hidden" : ""} rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6`}
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
            <ShieldCheck size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold">{t("keyForm.mobile.sectionModels")}</h2>
            <p className="text-xs text-[var(--muted)]">{t("app.modelsHint")}</p>
          </div>
        </div>
        {globalAliases.length > 0 && (
          <div className="mb-4">
            <label className={labelClass}>{t("keyForm.existingAliases")}</label>
            <div className="flex flex-wrap gap-2">
              {globalAliases.map((alias) => (
                <button
                  key={alias.alias}
                  type="button"
                  onClick={() => toggleAlias(alias)}
                  className={`rounded-xl border px-3 py-1.5 text-xs transition ${aliasSelected(alias) ? "border-indigo-500/25 bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)]" : "border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                >
                  {alias.alias}
                  {alias.targets.length > 1 ? ` (${alias.targets.length})` : ""}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className={labelClass}>{t("keyForm.modelsLabel")}</label>
        {pickPath ? (
          <div className="flex min-h-14 flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-2.5">
            {models.length === 0 && (
              <span className="text-xs text-[var(--muted)]">{t("keyForm.modelsEmpty")}</span>
            )}
            {models.map((model) => (
              <span
                key={`${model.provider}-${model.target_model}-${model.group ?? ""}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[10px]"
              >
                {model.alias}
                {model.group ? ` · ${formatTierLabel(t, model.group)}` : ""}
                <button
                  type="button"
                  className="text-[var(--muted)] hover:text-[var(--danger)]"
                  onClick={() =>
                    handleModelsChange(models.filter((candidate) => candidate !== model))
                  }
                  aria-label={t("keyForm.removeModel")}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-indigo-500/40 px-2.5 py-1.5 text-[10px] text-[var(--accent-soft-foreground)]"
              onClick={openPicker}
            >
              <Plus size={13} />
              {t("keyForm.addModel")}
            </button>
          </div>
        ) : (
          <ModelPicker initial={initial?.models} onChange={handleModelsChange} />
        )}

        {uniqueModels.length > 0 && (
          <div className="mt-5 grid gap-3">
            <label className={labelClass}>{t("keyForm.priceLabel")}</label>
            {uniqueModels.map((model) => {
              const key = priceKey(model);
              const row = prices[key] ?? emptyPrice;
              const perCall = row.billing_mode === "per_call";
              const matching = models.filter((candidate) => priceKey(candidate) === key);
              const hint = matching.length === 1 && lookupPrice(priceTable, model.target_model);
              return (
                <article
                  key={key}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <strong className="text-sm">
                        {model.alias}
                        {matching.length > 1 ? ` (${matching.length})` : ""}
                      </strong>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        {[...new Set(matching.map((item) => item.provider))].join(", ")}
                        {model.group ? ` · ${formatTierLabel(t, model.group)}` : ""}
                      </p>
                    </div>
                    <div className="flex rounded-lg bg-[var(--surface-tertiary)] p-1">
                      <button
                        type="button"
                        onClick={() => setPrice(model, "billing_mode", "tokens")}
                        className={`rounded-md px-2.5 py-1 text-[10px] ${!perCall ? "bg-[var(--surface)] font-semibold shadow-sm" : "text-[var(--muted)]"}`}
                      >
                        {t("keyForm.billingTokens")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrice(model, "billing_mode", "per_call")}
                        className={`rounded-md px-2.5 py-1 text-[10px] ${perCall ? "bg-[var(--surface)] font-semibold shadow-sm" : "text-[var(--muted)]"}`}
                      >
                        {t("keyForm.billingPerCall")}
                      </button>
                    </div>
                  </div>
                  {perCall ? (
                    <div className="mt-3 max-w-xs">
                      <label className={labelClass}>{t("keyForm.colPerCall")}</label>
                      <input
                        className={numberClass}
                        type="number"
                        min={0}
                        step="0.0001"
                        value={row.per_call_usd}
                        onChange={(event) => setPrice(model, "per_call_usd", event.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className={labelClass}>{t("keyForm.colInput")}</label>
                        <input
                          className={numberClass}
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.input_price_per_million}
                          onChange={(event) =>
                            setPrice(model, "input_price_per_million", event.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass}>{t("keyForm.colOutput")}</label>
                        <input
                          className={numberClass}
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.output_price_per_million}
                          onChange={(event) =>
                            setPrice(model, "output_price_per_million", event.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass}>{t("keyForm.colCacheRead")}</label>
                        <input
                          className={numberClass}
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.cache_read_price_per_million}
                          onChange={(event) =>
                            setPrice(model, "cache_read_price_per_million", event.target.value)
                          }
                        />
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex items-start justify-between gap-3">
                    {perCall ? (
                      <p className="m-0 max-w-3xl text-[10px] leading-relaxed text-amber-600">
                        ⚠ {row.per_call_usd === 0 ? `${t("keyForm.perCallZeroWarn")} ` : ""}
                        {t("keyForm.perCallImageWarn")}
                      </p>
                    ) : (
                      <span />
                    )}
                    {hint && !perCall && (
                      <Button size="sm" variant="ghost" onPress={() => recommend(model)}>
                        <Sparkles size={14} />
                        {t("keyForm.recommend")}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {wizard && wizardStep === wizardMaxStep && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold">{t("app.review")}</h2>
              <p className="text-xs text-[var(--muted)]">{t("app.reviewHint")}</p>
            </div>
          </div>
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-xl bg-[var(--surface-secondary)] p-3">
              <dt className="text-[var(--muted)]">{t("keyForm.idLabel")}</dt>
              <dd className="mt-1 font-mono font-semibold">{id || "—"}</dd>
            </div>
            <div className="rounded-xl bg-[var(--surface-secondary)] p-3">
              <dt className="text-[var(--muted)]">{t("keyForm.nameLabel")}</dt>
              <dd className="mt-1 font-semibold">{name.trim() || id || "—"}</dd>
            </div>
            <div className="rounded-xl bg-[var(--surface-secondary)] p-3">
              <dt className="text-[var(--muted)]">{t("keyForm.statusLabel")}</dt>
              <dd className="mt-1 font-semibold">
                {enabled ? t("keys.enabled") : t("keys.disabled")}
              </dd>
            </div>
            <div className="rounded-xl bg-[var(--surface-secondary)] p-3">
              <dt className="text-[var(--muted)]">{t("keys.colRpm")}</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {rpm === 0 ? t("keys.mobile.noLimit") : rpm}
              </dd>
            </div>
            <div className="rounded-xl bg-[var(--surface-secondary)] p-3">
              <dt className="text-[var(--muted)]">{t("keyForm.dailyLimitLabel")}</dt>
              <dd className="mt-1 font-semibold tabular-nums">${dailyLimit.toFixed(2)}</dd>
            </div>
            <div className="rounded-xl bg-[var(--surface-secondary)] p-3">
              <dt className="text-[var(--muted)]">{t("keyForm.weeklyLimitLabel")}</dt>
              <dd className="mt-1 font-semibold tabular-nums">${weeklyLimit.toFixed(2)}</dd>
            </div>
            <div className="rounded-xl bg-[var(--surface-secondary)] p-3">
              <dt className="text-[var(--muted)]">{t("keyForm.allowModelsLabel")}</dt>
              <dd className="mt-1">
                <Chip size="sm" variant="soft" color={allowModels ? "success" : "danger"}>
                  {allowModels ? t("keys.enabled") : t("keys.disabled")}
                </Chip>
              </dd>
            </div>
            <div className="rounded-xl bg-[var(--surface-secondary)] p-3">
              <dt className="text-[var(--muted)]">{t("keyForm.modelsLabel")}</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-1.5">
                {reviewModelNames.length === 0 ? (
                  <span className="text-[var(--muted)]">{t("keyForm.modelsEmpty")}</span>
                ) : (
                  <>
                    {visibleReviewModels.map((modelName) => (
                      <Chip key={modelName} size="sm" variant="soft" color="accent">
                        {modelName}
                      </Chip>
                    ))}
                    {hiddenReviewModelCount > 0 && (
                      <Tooltip delay={100} closeDelay={100}>
                        <Tooltip.Trigger
                          className="inline-flex outline-none"
                          aria-label={t("keyForm.reviewAllModels")}
                        >
                          <Chip size="sm" variant="soft" color="default">
                            +{hiddenReviewModelCount}
                          </Chip>
                        </Tooltip.Trigger>
                        <Tooltip.Content placement="top" showArrow className="w-64">
                          <div>
                            <strong className="mb-2 block text-xs font-semibold">
                              {t("keyForm.reviewAllModels")}
                            </strong>
                            <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                              {reviewModelNames.map((modelName) => (
                                <Chip key={modelName} size="sm" variant="soft" color="accent">
                                  {modelName}
                                </Chip>
                              ))}
                            </div>
                          </div>
                        </Tooltip.Content>
                      </Tooltip>
                    )}
                  </>
                )}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {(localError || error) && (
        <div
          className="rounded-xl border border-red-500/20 bg-[var(--danger-soft)] px-3 py-2.5 text-xs text-[var(--danger)]"
          role="alert"
        >
          {localError || error}
        </div>
      )}
      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] p-3 shadow-lg backdrop-blur-xl lg:bottom-4">
        {wizard && wizardStep > 0 && (
          <Button
            type="button"
            variant="ghost"
            onPress={() => setWizardStep((step) => Math.max(0, step - 1))}
          >
            {t("app.previous")}
          </Button>
        )}
        {!wizard || wizardStep === wizardMaxStep ? (
          <Button
            key="submit"
            type="button"
            variant="primary"
            isDisabled={busy}
            onPress={() => void submit()}
          >
            {busy ? t("keyForm.submitting") : submitLabel}
          </Button>
        ) : (
          <Button
            key="next"
            type="button"
            variant="primary"
            onPress={() => {
              if (wizardStep === 0 && !validateId()) return;
              setLocalError("");
              setWizardStep((step) => Math.min(wizardMaxStep, step + 1));
            }}
          >
            {t("app.next")}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onPress={() => {
            clearDraft();
            onCancel();
          }}
        >
          {t("keyForm.cancel")}
        </Button>
        {dangerLabel && onDanger && (
          <Button className="ml-auto" type="button" variant="danger-soft" onPress={onDanger}>
            <Trash2 size={16} />
            {dangerLabel}
          </Button>
        )}
      </div>
    </form>
  );
}
