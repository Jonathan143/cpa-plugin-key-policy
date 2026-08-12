import { Button, Toast, Tooltip } from "@heroui/react";
import {
  ChevronsLeft,
  ChevronsRight,
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

function Brand({ compact = false }: { compact?: boolean }) {
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
      {!compact && (
        <span className="grid min-w-0 gap-0.5">
          <strong className="max-w-44 truncate text-[13px] font-bold">{t("header.title")}</strong>
          <small
            className="max-w-44 truncate text-[10px] text-[var(--muted)]"
            title={session?.baseUrl}
          >
            {session?.baseUrl}
          </small>
        </span>
      )}
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const collapsed = preferences.sidebarCollapsed;
  const keysActive = location.pathname.startsWith("/keys");
  const mappingActive = location.pathname.startsWith("/mapping");
  const navItems = [
    { to: "/keys", label: t("header.keyList"), icon: LayoutDashboard, active: keysActive },
    { to: "/mapping", label: t("header.mapping"), icon: Network, active: mappingActive },
  ];
  const navClass =
    "relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]";

  return (
    <div
      className={`min-h-screen lg:grid ${collapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[250px_minmax(0,1fr)]"}`}
    >
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] p-3.5 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label={t("app.primaryNav")}
      >
        <div className="flex min-h-14 items-center border-b border-[var(--separator)] px-1.5 pb-4">
          <Brand compact={collapsed} />
        </div>
        <nav className="grid gap-1.5 py-4">
          {navItems.map(({ to, label, icon: Icon, active }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileNavOpen(false)}
              className={`${navClass} ${collapsed ? "lg:justify-center lg:px-0" : ""} ${active ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-soft-foreground)] before:absolute before:left-0 before:h-5 before:w-0.5 before:rounded-full before:bg-[var(--accent)]" : ""}`}
            >
              <Icon size={19} />
              {!collapsed && <span>{label}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-[var(--separator)] pt-3">
          <button
            type="button"
            className={`${navClass} ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
            onClick={() => preferences.setSidebarCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronsRight size={19} /> : <ChevronsLeft size={19} />}
            {!collapsed && <span>{t("app.collapse")}</span>}
          </button>
        </div>
      </aside>
      {mobileNavOpen && (
        <button
          className="fixed inset-0 z-30 bg-slate-950/55 lg:hidden"
          aria-label={t("app.closeNav")}
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-4 backdrop-blur-xl sm:px-7">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1">
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
        </header>
        <main
          className={`mx-auto w-full max-w-[1600px] px-4 pb-24 pt-6 sm:px-7 sm:pt-8 lg:pb-10 ${preferences.density === "compact" ? "lg:py-6" : "lg:p-10"}`}
        >
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-30 grid h-16 grid-cols-3 items-center rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] p-1 shadow-2xl backdrop-blur-xl lg:hidden"
        aria-label={t("app.primaryNav")}
      >
        <Link
          to="/keys"
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
