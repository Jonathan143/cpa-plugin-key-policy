import { AlertDialog, Button, toast } from "@heroui/react";
import { ChevronLeft, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { deleteKey, listKeys, patchKey, resetRPM, rotateKey } from "../api/keys";
import KeyForm, { type KeyFormValues } from "../components/KeyForm";
import LoadingState from "../components/LoadingState";
import PlainKeyModal from "../components/PlainKeyModal";
import { useT } from "../i18n";
import type { KeyPublic, ModelRule } from "../types";

type PickerState = { pickedModels?: ModelRule[]; draft?: Partial<KeyFormValues> } | null;

export default function KeyEdit() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const location = useLocation();
  const t = useT();
  const [key, setKey] = useState<KeyPublic | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [plain, setPlain] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typedId, setTypedId] = useState("");
  const pickerState = location.state as PickerState;

  useEffect(() => {
    void listKeys()
      .then((items) => {
        const found = items.find((item) => item.id === decodeURIComponent(id ?? ""));
        if (found) setKey(found);
        else setError(t("keys.notFound"));
      })
      .catch((caught) => setError((caught as Error).message ?? t("keys.loadFailed")))
      .finally(() => setLoading(false));
  }, [id, t]);

  const initial = useMemo(() => {
    if (!key) return null;
    const draft = pickerState?.draft;
    return {
      ...key,
      ...(draft ?? {}),
      models: pickerState?.pickedModels ?? draft?.models ?? key.models,
    };
  }, [key, pickerState]);

  if (loading) return <LoadingState label={t("keys.loading")} />;
  if (error || !initial)
    return (
      <div className="rounded-xl border border-red-500/20 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
        {error || t("edit.notFound")}
      </div>
    );

  const rotate = async () => {
    const result = await rotateKey(initial.id);
    setPlain(result.plain_key);
    toast.success(t("keys.rotateOk"));
  };
  const reset = async () => {
    await resetRPM(initial.id);
    toast.success(t("app.rpmReset"));
  };
  const remove = async () => {
    await deleteKey(initial.id);
    toast.success(t("app.keyDeleted"));
    nav("/keys");
  };

  return (
    <section className="mx-auto grid max-w-5xl gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => nav("/keys")}
            className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
          >
            <ChevronLeft size={19} />
          </button>
          <div>
            <p className="m-0 text-[10px] font-bold tracking-[.14em] text-[var(--accent-soft-foreground)]">
              KEY POLICY
            </p>
            <h1 className="mb-1 mt-0.5 text-3xl font-bold tracking-tight">{t("edit.hTitle")}</h1>
            <p className="m-0 font-mono text-xs text-[var(--muted)]">
              {initial.id} · {initial.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onPress={reset}>
            <RefreshCw size={16} />
            {t("keys.resetRpm")}
          </Button>
          <Button variant="secondary" onPress={rotate}>
            <RotateCw size={16} />
            {t("keys.rotate")}
          </Button>
        </div>
      </header>
      <KeyForm
        initial={initial}
        idReadOnly
        draftKey={`key-form-edit-${initial.id}`}
        preferInitialModels={Boolean(pickerState?.pickedModels)}
        pickPath={`/keys/${encodeURIComponent(initial.id)}/edit/models`}
        submitLabel={t("edit.save")}
        onCancel={() => nav("/keys")}
        dangerLabel={t("keys.delete")}
        onDanger={() => setConfirmDelete(true)}
        onSubmit={async (value) => {
          await patchKey({
            id: value.id,
            name: value.name || undefined,
            enabled: value.enabled,
            rpm: value.rpm,
            models: value.models,
            daily_limit_usd: value.daily_limit_usd,
            weekly_limit_usd: value.weekly_limit_usd,
            total_limit_usd: value.total_limit_usd,
            expires_at: value.expires_at,
            allow_models_endpoint: value.allow_models_endpoint,
          });
          toast.success(t("app.changesSaved"));
          nav("/keys");
        }}
      />
      {plain && (
        <PlainKeyModal plainKey={plain} title={t("keys.rotated")} onClose={() => setPlain(null)} />
      )}
      {confirmDelete && (
        <AlertDialog.Backdrop
          isOpen
          onOpenChange={setConfirmDelete}
          className="bg-slate-950/65 p-4 backdrop-blur-md"
        >
          <AlertDialog.Container placement="center" size="sm">
            <AlertDialog.Dialog className="rounded-2xl border border-[var(--border)] bg-[var(--overlay)] p-1 shadow-2xl">
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger">
                  <Trash2 size={20} />
                </AlertDialog.Icon>
                <AlertDialog.Heading>{t("app.deleteKey")}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="mb-4 text-xs text-[var(--muted)]">
                  {t("keys.deleteConfirm", { id: initial.id })}
                </p>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold">
                    {t("app.typeId", { id: initial.id })}
                  </label>
                  <input
                    className="min-h-10 w-full rounded-xl border border-[var(--field-border)] bg-[var(--field-background)] px-3 font-mono text-sm outline-none focus:border-[var(--accent)]"
                    value={typedId}
                    onChange={(event) => setTypedId(event.target.value)}
                  />
                </div>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="tertiary" onPress={() => setConfirmDelete(false)}>
                  {t("keyForm.cancel")}
                </Button>
                <Button variant="danger" isDisabled={typedId !== initial.id} onPress={remove}>
                  {t("keys.delete")}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      )}
    </section>
  );
}
