import { useEffect, useState } from "react";

export type Density = "comfortable" | "compact";
export type KeyView = "table" | "cards";

const DENSITY_KEY = "cpa-key-policy-density";
const SIDEBAR_KEY = "cpa-key-policy-sidebar-collapsed";
const VIEW_KEY = "cpa-key-policy-key-view";

const listeners = new Set<() => void>();

function read<T extends string>(key: string, fallback: T, allowed: T[]): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences are optional in private/locked-down browsing contexts.
  }
  for (const listener of listeners) listener();
}

export function getDensity(): Density {
  return read(DENSITY_KEY, "comfortable", ["comfortable", "compact"]);
}

export function setDensity(value: Density): void {
  write(DENSITY_KEY, value);
  document.documentElement.dataset.density = value;
}

export function getSidebarCollapsed(): boolean {
  return read(SIDEBAR_KEY, "false", ["true", "false"]) === "true";
}

export function setSidebarCollapsed(value: boolean): void {
  write(SIDEBAR_KEY, String(value));
}

export function getKeyView(): KeyView {
  return read(VIEW_KEY, "table", ["table", "cards"]);
}

export function setKeyView(value: KeyView): void {
  write(VIEW_KEY, value);
}

export function initUiPreferences(): void {
  document.documentElement.dataset.density = getDensity();
}

export function useUiPreferences() {
  const [, render] = useState(0);
  useEffect(() => {
    const listener = () => render((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    density: getDensity(),
    sidebarCollapsed: getSidebarCollapsed(),
    keyView: getKeyView(),
    setDensity,
    setSidebarCollapsed,
    setKeyView,
  };
}
