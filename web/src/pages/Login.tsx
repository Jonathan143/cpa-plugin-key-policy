import { Button, Input } from "@heroui/react";
import { ChevronDown, KeyRound, LockKeyhole, Server, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useT } from "../i18n";
import { isEmbedded } from "../store/panelAuth";
import { setSession, verifyCredentials } from "../store/session";

export default function Login() {
  const t = useT();
  const [baseUrl, setBaseUrl] = useState(
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8317",
  );
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!secretKey.trim()) {
      setError(t("login.secretRequired"));
      return;
    }
    setBusy(true);
    try {
      const session = await verifyCredentials(baseUrl, secretKey, fetch);
      setSession(session.baseUrl, session.secretKey);
    } catch (err) {
      setError((err as Error).message || t("login.loginFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[#0b1020] p-6 text-slate-50 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:44px_44px] place-items-center">
      <div className="absolute -left-24 -top-64 size-[520px] rounded-full bg-indigo-600/25 blur-[90px]" />
      <div className="absolute -bottom-72 -right-40 size-[520px] rounded-full bg-cyan-500/20 blur-[90px]" />
      <motion.section
        className="relative z-10 w-full max-w-[470px] rounded-[22px] border border-white/10 bg-slate-900/80 p-7 shadow-2xl backdrop-blur-2xl sm:p-10"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="mb-8 flex items-center gap-4">
          <span className="relative grid size-[52px] shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 text-white shadow-xl shadow-indigo-500/25">
            <KeyRound size={26} />
            <ShieldCheck size={15} className="absolute bottom-1.5 right-1.5" />
          </span>
          <div>
            <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-[.14em] text-cyan-300">
              <Sparkles size={13} /> CPA POLICY CONTROL
            </div>
            <h1 className="mb-0.5 mt-1 text-xl font-bold tracking-tight">{t("header.title")}</h1>
            <p className="m-0 text-xs text-slate-400">{t("login.subTitle")}</p>
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-3">
          <label className="text-xs font-semibold text-slate-200" htmlFor="management-key">
            {t("login.managementKey")}
          </label>
          <div className="relative flex items-center">
            <LockKeyhole
              size={18}
              className="pointer-events-none absolute left-3 z-10 text-slate-500"
            />
            <Input
              id="management-key"
              type="password"
              value={secretKey}
              onChange={(event) => setSecretKey(event.target.value)}
              placeholder={t("login.managementKeyPlaceholder")}
              aria-invalid={Boolean(error)}
              autoFocus
              fullWidth
              className="pl-10"
            />
          </div>

          <button
            className="flex items-center justify-between px-0.5 py-1.5 text-xs text-slate-400"
            type="button"
            onClick={() => setAdvanced((value) => !value)}
            aria-expanded={advanced}
          >
            <span className="flex items-center gap-2">
              <Server size={15} /> {t("login.baseUrl")}
            </span>
            <ChevronDown
              size={16}
              className={`transition-transform ${advanced ? "rotate-180" : ""}`}
            />
          </button>
          {advanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="relative flex items-center"
            >
              <Server
                size={18}
                className="pointer-events-none absolute left-3 z-10 text-slate-500"
              />
              <Input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={t("login.baseUrlPlaceholder")}
                fullWidth
                className="pl-10"
              />
            </motion.div>
          )}

          {error && (
            <div
              className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-300"
              role="alert"
            >
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" size="lg" fullWidth isDisabled={busy}>
            {busy ? (
              <span className="flex items-center gap-2">
                <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t("login.verifying")}
              </span>
            ) : (
              t("login.submit")
            )}
          </Button>
        </form>

        <div className="mt-5 flex items-center gap-2 text-[12px] leading-relaxed text-slate-500">
          <ShieldCheck size={17} className="shrink-0 text-emerald-400" />
          <span>{t("login.memoryNote")}</span>
        </div>
        {isEmbedded() && (
          <p className="mt-3 text-[11px] text-slate-500">{t("login.embeddedFallback")}</p>
        )}
      </motion.section>
    </main>
  );
}
