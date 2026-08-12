import { Button, Input } from "@heroui/react";
import { Check, ChevronLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { CatalogGroup } from "../api/models";
import { fetchCatalog, formatTierLabel, groupByCatalog } from "../api/models";
import LoadingState from "../components/LoadingState";
import { useT } from "../i18n";
import type { AliasTarget, ModelRule } from "../types";

function selectionKey(provider: string, group: string | undefined, model: string): string {
  return `${provider.toLowerCase()}|${(group ?? "").toLowerCase()}|${model.toLowerCase()}`;
}

function keyOf(group: CatalogGroup, model: string): string {
  return selectionKey(group.provider, group.group, model);
}

function reconcileSelected(groups: CatalogGroup[], selected: Set<string>): Set<string> {
  const catalogKeys = new Set<string>();
  const candidatesByProviderModel = new Map<string, string[]>();

  for (const group of groups)
    for (const model of group.models) {
      const key = keyOf(group, model);
      const providerModel = `${group.provider.toLowerCase()}|${model.toLowerCase()}`;
      catalogKeys.add(key);
      candidatesByProviderModel.set(providerModel, [
        ...(candidatesByProviderModel.get(providerModel) ?? []),
        key,
      ]);
    }

  const reconciled = new Set<string>();
  for (const key of selected) {
    if (catalogKeys.has(key)) {
      reconciled.add(key);
      continue;
    }
    const [provider, , ...modelParts] = key.split("|");
    const candidates = candidatesByProviderModel.get(`${provider}|${modelParts.join("|")}`) ?? [];
    reconciled.add(candidates.length === 1 ? candidates[0] : key);
  }
  return reconciled;
}

function rulePriceKey(rule: { alias: string; group?: string }): string {
  return `${rule.group ? `${rule.group.toLowerCase()}|` : ""}${rule.alias.toLowerCase()}`;
}

export default function ModelPick() {
  const { id } = useParams<{ id?: string }>();
  const nav = useNavigate();
  const location = useLocation();
  const t = useT();
  const state = location.state as {
    models?: ModelRule[];
    currentTargets?: AliasTarget[];
    returnTo?: string;
    draftAlias?: unknown;
    draft?: { prices?: Record<string, Partial<ModelRule>> };
  } | null;
  const aliasMode = Boolean(state?.returnTo);
  const initialModels = useMemo(() => state?.models ?? [], [state?.models]);
  const initialTargets = useMemo(() => state?.currentTargets ?? [], [state?.currentTargets]);
  const backTo = state?.returnTo ?? (id ? `/keys/${encodeURIComponent(id)}/edit` : "/keys/new");
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set([
        ...initialModels.map(
          (rule) => selectionKey(rule.provider, rule.group, rule.target_model),
        ),
        ...initialTargets.map(
          (target) => selectionKey(target.provider, target.group, target.target_model),
        ),
      ]),
  );

  useEffect(() => {
    let alive = true;
    const providers = new Set([
      ...initialModels.map((rule) => rule.provider.toLowerCase()),
      ...initialTargets.map((target) => target.provider.toLowerCase()),
    ]);
    void fetchCatalog(providers)
      .then((catalog) => {
        if (!alive) return;
        const nextGroups = groupByCatalog(catalog);
        setSelected((current) => reconcileSelected(nextGroups, current));
        setGroups(nextGroups);
      })
      .catch((caught) => {
        if (alive) setError((caught as Error).message || t("picker.loadFailed"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [initialModels, initialTargets, t]);

  const rules = useMemo(() => {
    const covered = new Set<string>();
    const result: ModelRule[] = [];
    for (const group of groups)
      for (const model of group.models) {
        const key = keyOf(group, model);
        covered.add(key);
        if (selected.has(key))
          result.push({
            alias: model,
            provider: group.provider,
            target_model: model,
            ...(group.group ? { group: group.group } : {}),
          });
      }
    for (const key of selected)
      if (!covered.has(key)) {
        const [provider, group, ...rest] = key.split("|");
        const model = rest.join("|");
        if (provider && model)
          result.push({ alias: model, provider, target_model: model, ...(group ? { group } : {}) });
      }
    return result;
  }, [groups, selected]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return groups;
    return groups
      .map((group) => ({
        ...group,
        models: group.models.filter(
          (model) =>
            model.toLowerCase().includes(value) ||
            group.provider.includes(value) ||
            (group.group ?? "").includes(value),
        ),
      }))
      .filter((group) => group.models.length);
  }, [groups, query]);

  const finish = () => {
    if (aliasMode)
      nav(backTo, {
        state: {
          pickedTargets: rules.map((rule) => ({
            provider: rule.provider,
            target_model: rule.target_model,
            ...(rule.group ? { group: rule.group } : {}),
          })),
          draftAlias: state?.draftAlias,
        },
      });
    else
      nav(backTo, {
        state: {
          pickedModels: rules.map((rule) => ({
            ...rule,
            ...(state?.draft?.prices?.[rulePriceKey(rule)] ?? {}),
          })),
          draft: state?.draft,
        },
      });
  };
  const goBack = () => {
    if (aliasMode)
      nav(backTo, { state: { draftAlias: state?.draftAlias, pickedTargets: initialTargets } });
    else nav(backTo, { state: { draft: state?.draft, pickedModels: initialModels } });
  };

  return (
    <section className="mx-auto grid max-w-5xl gap-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="grid size-9 place-items-center rounded-xl border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-secondary)]"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("picker.title")}</h1>
            <p className="text-xs text-[var(--muted)]">
              {t("picker.selected", { count: selected.size })}
            </p>
          </div>
        </div>
        <Button variant="primary" onPress={finish} isDisabled={loading}>
          <Check size={16} />
          {t("picker.done", { count: selected.size })}
        </Button>
      </header>
      <div className="relative flex items-center">
        <Search
          size={17}
          className="pointer-events-none absolute left-3 z-10 text-[var(--muted)]"
        />
        <Input
          className="pl-9"
          placeholder={t("picker.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          fullWidth
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        {loading ? (
          <LoadingState label={t("picker.loading")} variant="list" rows={5} />
        ) : error ? (
          <div className="m-4 rounded-xl bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted)]">
            {groups.length ? t("picker.noMatch") : t("picker.empty")}
          </div>
        ) : (
          filtered.map((group) => {
            const heading = `${group.provider}${group.group ? ` · ${formatTierLabel(t, group.group)}` : ""}`;
            const allSelected = group.models.every((model) => selected.has(keyOf(group, model)));
            return (
              <div key={heading} className="border-b border-[var(--separator)] last:border-0">
                <div className="flex items-center justify-between bg-[var(--surface-secondary)] px-4 py-3">
                  <strong className="text-xs">{heading}</strong>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-[10px] text-[var(--accent-soft-foreground)] hover:bg-[var(--accent-soft)]"
                    onClick={() =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        for (const model of group.models)
                          if (allSelected) next.delete(keyOf(group, model));
                          else next.add(keyOf(group, model));
                        return next;
                      })
                    }
                  >
                    {allSelected ? t("picker.clearAll") : t("picker.selectAll")}
                  </button>
                </div>
                <div className="grid gap-1 p-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.models.map((model) => {
                    const key = keyOf(group, model);
                    const active = selected.has(key);
                    return (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-xs transition ${active ? "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)]" : "hover:bg-[var(--surface-secondary)]"}`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() =>
                            setSelected((previous) => {
                              const next = new Set(previous);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        />
                        {model}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="sticky bottom-20 flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] p-3 shadow-lg backdrop-blur-xl lg:bottom-4">
        <span className="text-xs text-[var(--muted)]">
          {t("picker.selected", { count: selected.size })}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onPress={goBack}>
            {t("keyForm.cancel")}
          </Button>
          <Button variant="primary" onPress={finish} isDisabled={loading}>
            {t("picker.done", { count: selected.size })}
          </Button>
        </div>
      </div>
    </section>
  );
}
