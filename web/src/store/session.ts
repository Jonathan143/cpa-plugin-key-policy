// In-memory session only. Never persisted to localStorage.
// Rationale: the secret-key is CPA's total management credential; we don't want
// it lying around in storage. Refreshing/closing the tab resets to the login page.

import type { StatusResponse } from "../types";
import { readPanelAuth } from "./panelAuth";

export interface Session {
  baseUrl: string;
  secretKey: string;
}

let current: Session | null = null;

const listeners = new Set<() => void>();

function normalizeBase(url: string): string {
  let u = url.trim();
  if (u === "") return "";
  u = u.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

export function setSession(baseUrl: string, secretKey: string): Session {
  const session: Session = {
    baseUrl: normalizeBase(baseUrl),
    secretKey: secretKey.trim(),
  };
  current = session;
  emit();
  return session;
}

async function probeSession(session: Session, fetchImpl: typeof fetch): Promise<void> {
  const res = await fetchImpl(`${session.baseUrl}/v0/management/plugins/cpa-key-policy/status`, {
    headers: { Authorization: `Bearer ${session.secretKey}` },
  });
  if (!res.ok) {
    throw new Error(`management key rejected (${res.status})`);
  }
  (await res.json()) as StatusResponse;
}

export async function verifyCredentials(
  baseUrl: string,
  secretKey: string,
  fetchImpl: typeof fetch,
): Promise<Session> {
  const candidate: Session = {
    baseUrl: normalizeBase(baseUrl),
    secretKey: secretKey.trim(),
  };
  if (!candidate.baseUrl || !candidate.secretKey) throw new Error("invalid session");
  await probeSession(candidate, fetchImpl);
  return candidate;
}

export function clearSession(): void {
  current = null;
  emit();
}

export function getSession(): Session | null {
  return current;
}

export function isAuthed(): boolean {
  return current !== null && current.secretKey !== "" && current.baseUrl !== "";
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) fn();
}

// Attempt to restore a session from the official panel's saved management key
// (only available when this UI is loaded as a same-origin iframe inside the
// panel AND the user checked "remember password" there). On success the
// session is set and true is returned; on any failure the session is cleared
// and false is returned so the caller falls back to the login page.
export async function bootstrapFromPanel(): Promise<boolean> {
  const auth = readPanelAuth();
  if (!auth) return false;
  try {
    const session = await verifyCredentials(auth.apiBase, auth.managementKey, fetch);
    setSession(session.baseUrl, session.secretKey);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

// During local Vite development, authenticate with CPA_SECRET_KEY loaded from
// the repository-root .env. Vite replaces this value only for `vite serve`;
// production builds receive an empty string and cannot use this path.
export async function bootstrapFromDevEnv(): Promise<boolean> {
  const secretKey = import.meta.env.CPA_SECRET_KEY ?? "";
  if (!import.meta.env.DEV || !secretKey.trim()) return false;
  try {
    const session = await verifyCredentials(window.location.origin, secretKey, fetch);
    setSession(session.baseUrl, session.secretKey);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

export async function bootstrapSession(): Promise<boolean> {
  if (await bootstrapFromDevEnv()) return true;
  return bootstrapFromPanel();
}

// Probe helper: confirm the key works by hitting the plugin status route.
// Returns the session on success; throws on non-2xx.
export async function verifySession(fetchImpl: typeof fetch): Promise<Session> {
  const s = current;
  if (!s) throw new Error("no session");
  await probeSession(s, fetchImpl);
  return s;
}
