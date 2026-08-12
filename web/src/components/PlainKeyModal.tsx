import { Button, Modal, toast } from "@heroui/react";
import { Check, Clipboard, Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useT } from "../i18n";

interface Props {
  plainKey: string;
  title?: string;
  onClose: () => void;
}

export default function PlainKeyModal({ plainKey, title, onClose }: Props) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainKey);
      setCopied(true);
      toast.success(t("app.copied"));
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setRevealed(true);
      toast.warning(t("app.copyFailed"));
    }
  };

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop className="bg-slate-950/65 p-4 backdrop-blur-md">
        <Modal.Container placement="center" size="md">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Icon>
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--warning-soft)] text-amber-600">
                  <KeyRound size={22} />
                </span>
              </Modal.Icon>
              <div className="min-w-0">
                <Modal.Heading>{title ?? t("plainModal.defaultTitle")}</Modal.Heading>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  {t("plainModal.warning")}
                </p>
              </div>
            </Modal.Header>
            <Modal.Body>
              <div className="flex items-start gap-2 rounded-xl bg-[var(--warning-soft)] px-3 py-2.5 text-[11px] leading-relaxed text-amber-700">
                <ShieldAlert size={18} className="shrink-0" />
                <span>{t("app.keySecurity")}</span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3 mt-3">
                <code className="overflow-auto whitespace-nowrap text-xs">
                  {revealed ? plainKey : "•".repeat(Math.min(44, plainKey.length || 32))}
                </code>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => setRevealed((value) => !value)}
                  aria-label={revealed ? t("app.hide") : t("app.reveal")}
                >
                  {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
                </Button>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={copy}>
                {copied ? <Check size={17} /> : <Clipboard size={17} />}
                {t("plainModal.copy")}
              </Button>
              <Button variant="primary" onPress={onClose}>
                {t("plainModal.saved")}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
