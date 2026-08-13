import { Button, Toast, Tooltip } from "@heroui/react";
import {
  CirclePlus,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Network,
  Rows3,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useT } from "./i18n";
import KeyEdit from "./pages/KeyEdit";
import KeyList from "./pages/KeyList";
import KeyNew from "./pages/KeyNew";
import KeyUsage from "./pages/KeyUsage";
import Login from "./pages/Login";
import Mapping, { AliasEditForm, RuleEditForm } from "./pages/Mapping";
import ModelPick from "./pages/ModelPick";
import { bootstrapSession, clearSession, getSession, isAuthed, subscribe } from "./store/session";
import {
  getThemePreference,
  isThemeControlledByHost,
  setThemePreference,
  type ThemePreference,
} from "./store/themeSync";
import { useUiPreferences } from "./store/uiPreferences";

function useAuthTick() {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((tick) => tick + 1)), []);
  return isAuthed();
}

function Brand() {
  const t = useT();
  const session = getSession();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/20"
        aria-hidden="true"
      >
        <KeyRound size={20} />
        <ShieldCheck
          size={12}
          className="absolute bottom-1 right-1 rounded-full bg-indigo-700 p-0.5 text-cyan-100"
        />
      </span>
      <span className="hidden min-w-0 gap-0.5 sm:grid">
        <strong className="max-w-44 truncate text-[13px] font-bold">{t("header.title")}</strong>
        <small
          className="max-w-44 truncate text-[10px] text-[var(--muted)]"
          title={session?.baseUrl}
        >
          {session?.baseUrl}
        </small>
      </span>
    </div>
  );
}

function ThemeButton() {
  const t = useT();
  const [, render] = useState(0);
  const controlled = isThemeControlledByHost();
  const theme = getThemePreference();
  useEffect(() => {
    const handler = () => render((n) => n + 1);
    window.addEventListener("cpa-key-policy-theme", handler);
    return () => window.removeEventListener("cpa-key-policy-theme", handler);
  }, []);
  const next: Record<ThemePreference, ThemePreference> = {
    system: "light",
    light: "dark",
    dark: "system",
  };
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          isDisabled={controlled}
          aria-label={controlled ? t("app.themeHost") : t("app.theme")}
          onPress={() => setThemePreference(next[theme])}
        >
          {theme === "system" ? (
            <Monitor size={17} />
          ) : theme === "dark" ? (
            <Moon size={17} />
          ) : (
            <Sun size={17} />
          )}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{controlled ? t("app.themeHost") : t("app.theme")}</Tooltip.Content>
    </Tooltip>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const preferences = useUiPreferences();
  const keysActive = location.pathname.startsWith("/keys");
  const mappingActive = location.pathname.startsWith("/mapping");
  const navItems = [
    { to: "/keys", label: t("header.keyList"), icon: LayoutDashboard, active: keysActive },
    { to: "/mapping", label: t("header.mapping"), icon: Network, active: mappingActive },
  ];
  const navClass =
    "relative flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-4 px-4 sm:px-7 lg:px-10">
          <div className="shrink-0">
            <Brand />
          </div>
          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex"
            aria-label={t("app.primaryNav")}
          >
            {navItems.map(({ to, label, icon: Icon, active }) => (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`${navClass} ${active ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-soft-foreground)] after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-[var(--accent)]" : ""}`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Tooltip>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t("app.density")}
                  onPress={() =>
                    preferences.setDensity(
                      preferences.density === "comfortable" ? "compact" : "comfortable",
                    )
                  }
                >
                  <Rows3 size={17} />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>{t("app.density")}</Tooltip.Content>
            </Tooltip>
            <ThemeButton />
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("header.logout")}
              onPress={() => {
                clearSession();
                navigate("/login");
              }}
            >
              <LogOut size={17} />
              <span className="hidden sm:inline">{t("header.logout")}</span>
            </Button>
          </div>
        </div>
      </header>
      <main
        className={`mx-auto w-full max-w-[1600px] px-4 pb-24 pt-6 sm:px-7 sm:pt-8 lg:pb-10 ${preferences.density === "compact" ? "lg:py-6" : "lg:p-10"}`}
      >
        {children}
      </main>

      <nav
        className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-30 grid h-16 grid-cols-3 items-center rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] p-1 shadow-2xl backdrop-blur-xl lg:hidden"
        aria-label={t("app.primaryNav")}
      >
        <Link
          to="/keys"
          aria-current={keysActive ? "page" : undefined}
          className={`grid place-content-center justify-items-center gap-0.5 text-[9px] ${keysActive ? "text-[var(--accent-soft-foreground)]" : "text-[var(--muted)]"}`}
        >
          <LayoutDashboard size={20} />
          <span>{t("keys.mobile.tabKeys")}</span>
        </Link>
        <Link
          to="/keys/new"
          className="grid -translate-y-3 place-content-center justify-items-center gap-0.5 text-[9px] text-[var(--muted)]"
        >
          <span className="grid size-12 place-items-center rounded-2xl border-[5px] border-[var(--background)] bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25">
            <CirclePlus size={27} />
          </span>
          <span>{t("keys.mobile.tabNew")}</span>
        </Link>
        <Link
          to="/mapping"
          aria-current={mappingActive ? "page" : undefined}
          className={`grid place-content-center justify-items-center gap-0.5 text-[9px] ${mappingActive ? "text-[var(--accent-soft-foreground)]" : "text-[var(--muted)]"}`}
        >
          <Network size={20} />
          <span>{t("header.mapping")}</span>
        </Link>
      </nav>
    </div>
  );
}

function Shell() {
  const authed = useAuthTick();
  const [bootstrapped, setBootstrapped] = useState(false);
  const t = useT();
  const location = useLocation();
  useEffect(() => {
    if (authed || bootstrapped) return;
    let alive = true;
    void bootstrapSession().finally(() => {
      if (alive) setBootstrapped(true);
    });
    return () => {
      alive = false;
    };
  }, [authed, bootstrapped]);
  if (!authed) {
    if (!bootstrapped)
      return (
        <div className="grid min-h-screen place-content-center justify-items-center gap-3 text-[var(--muted)]">
          <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white">
            <KeyRound size={22} />
          </span>
          <p>{t("session.restoring")}</p>
        </div>
      );
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <AppShell>
      <div key={location.pathname}>
        <Routes location={location}>
          <Route path="/keys" element={<KeyList />} />
          <Route path="/keys/new" element={<KeyNew />} />
          <Route path="/keys/new/models" element={<ModelPick />} />
          <Route path="/keys/:id/edit" element={<KeyEdit />} />
          <Route path="/keys/:id/edit/models" element={<ModelPick />} />
          <Route path="/mapping/pick-target" element={<ModelPick />} />
          <Route path="/keys/:id/usage" element={<KeyUsage />} />
          <Route path="/mapping" element={<Mapping />} />
          <Route path="/mapping/alias/:aliasName" element={<AliasEditForm />} />
          <Route path="/mapping/rule/:ruleName" element={<RuleEditForm />} />
          <Route path="*" element={<Navigate to="/keys" replace />} />
        </Routes>
      </div>
    </AppShell>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/*" element={<Shell />} />
      </Routes>
      <Toast.Provider placement="top end" />
    </>
  );
}
