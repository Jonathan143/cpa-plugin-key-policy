import { ChevronLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createKey } from "../api/keys";
import KeyForm, { type KeyFormValues } from "../components/KeyForm";
import PlainKeyModal from "../components/PlainKeyModal";
import { useT } from "../i18n";
import type { KeyPublic, ModelRule } from "../types";

type PickerState = { pickedModels?: ModelRule[]; draft?: Partial<KeyFormValues> } | null;

export default function KeyNew() {
  const nav = useNavigate();
  const location = useLocation();
  const t = useT();
  const [plain, setPlain] = useState<string | null>(null);
  const pickerState = location.state as PickerState;
  const initial = useMemo<KeyPublic | undefined>(() => {
    if (!pickerState?.pickedModels && !pickerState?.draft) return undefined;
    const draft = pickerState.draft ?? {};
    return {
      id: draft.id ?? "",
      name: draft.name ?? "",
      enabled: draft.enabled ?? true,
      rpm: draft.rpm ?? 0,
      models: pickerState.pickedModels ?? draft.models ?? [],
      daily_limit_usd: draft.daily_limit_usd ?? 0,
      weekly_limit_usd: draft.weekly_limit_usd ?? 0,
      allow_models_endpoint: draft.allow_models_endpoint ?? false,
      key_preview: "",
      usage: {
        daily_usd: 0,
        weekly_usd: 0,
        daily_limit_usd: draft.daily_limit_usd ?? 0,
        weekly_limit_usd: draft.weekly_limit_usd ?? 0,
      },
    };
  }, [pickerState]);

  return (
    <section className="mx-auto grid max-w-5xl gap-6">
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => nav("/keys")}
          className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft size={19} />
        </button>
        <div>
          <p className="m-0 text-[10px] font-bold tracking-[.14em] text-[var(--accent-soft-foreground)]">
            KEY CREATION
          </p>
          <h1 className="mb-1 mt-0.5 text-3xl font-bold tracking-tight">{t("new.title")}</h1>
          <p className="m-0 text-sm text-[var(--muted)]">{t("app.newKeySubtitle")}</p>
        </div>
      </header>
      <KeyForm
        initial={initial}
        wizard
        wizardInitialStep={pickerState?.pickedModels ? 1 : 0}
        draftKey="key-form-new"
        preferInitialModels={Boolean(pickerState?.pickedModels)}
        pickPath="/keys/new/models"
        submitLabel={t("new.create")}
        onCancel={() => nav("/keys")}
        onSubmit={async (value) => {
          const result = await createKey({
            id: value.id,
            name: value.name || undefined,
            enabled: value.enabled,
            rpm: value.rpm,
            models: value.models,
            daily_limit_usd: value.daily_limit_usd,
            weekly_limit_usd: value.weekly_limit_usd,
            allow_models_endpoint: value.allow_models_endpoint,
          });
          setPlain(result.plain_key);
        }}
      />
      {plain && (
        <PlainKeyModal
          plainKey={plain}
          title={t("plainModal.created")}
          onClose={() => {
            setPlain(null);
            nav("/keys");
          }}
        />
      )}
    </section>
  );
}
