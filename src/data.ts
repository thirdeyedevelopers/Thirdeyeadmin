import { useEffect, useState } from "react";
import {
  collection,
  doc,
  documentId,
  limit,
  onSnapshot,
  orderBy,
  query,
  Query,
  DocumentData,
  Timestamp,
  where,
  DocumentReference,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

/** Feature names written by the Cloud Functions. Cash Reader runs offline and is never logged. */
export const FEATURES = ["Translator", "Image Describe", "Image OCR", "Assistant", "Navigator"] as const;
export const COMING_SOON = new Set(["Navigator"]);
export const OFFLINE_FEATURES = ["Cash Reader"];

export const FEATURE_FUNCTIONS: Record<string, string[]> = {
  Translator: ["translate", "translatorLanguages"],
  "Image Describe": ["describeImage", "askImage"],
  "Image OCR": ["extractText", "translateLines"],
  Assistant: ["assistantChat"],
  Navigator: ["navigator"],
};

export interface Daily {
  id: string;
  calls: number;
  errors: number;
  activeUsers: number;
  msTotal: number;
  f: Record<string, number>;
  h: Record<string, number>;
}

export interface AppUser {
  id: string;
  name?: string;
  email?: string;
  provider?: string;
  firstSeen?: Date;
  lastSeen?: Date;
  lastFeature?: string;
  calls: number;
  errors: number;
  features: Record<string, number>;
}

export interface Usage {
  id: string;
  uid: string;
  feature: string;
  fn: string;
  action: string | null;
  ok: boolean;
  ms: number;
  errCode: string | null;
  at?: Date;
}

export interface Admin {
  id: string;
  role?: string;
}

const toDate = (v: unknown) => (v instanceof Timestamp ? v.toDate() : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const numMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) out[k] = num(x);
  return out;
};

const mapDaily = (id: string, d: DocumentData): Daily => ({
  id,
  calls: num(d.calls),
  errors: num(d.errors),
  activeUsers: num(d.activeUsers),
  msTotal: num(d.msTotal),
  f: numMap(d.f),
  h: numMap(d.h),
});

const mapUser = (id: string, d: DocumentData): AppUser => ({
  id,
  name: typeof d.name === "string" ? d.name : undefined,
  email: typeof d.email === "string" ? d.email : undefined,
  provider: typeof d.provider === "string" ? d.provider : undefined,
  firstSeen: toDate(d.firstSeen),
  lastSeen: toDate(d.lastSeen),
  lastFeature: d.lastFeature,
  calls: num(d.calls),
  errors: num(d.errors),
  features: numMap(d.features),
});

const mapUsage = (id: string, d: DocumentData): Usage => ({
  id,
  uid: d.uid ?? "",
  feature: d.feature ?? "Unknown",
  fn: d.fn ?? "",
  action: d.action ?? null,
  ok: d.ok !== false,
  ms: num(d.ms),
  errCode: d.errCode ?? null,
  at: toDate(d.at),
});

export interface Live<T> {
  data: T;
  loading: boolean;
  error?: string;
}

function useLiveQuery<T>(make: () => Query | null, map: (id: string, d: DocumentData) => T, deps: unknown[]): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: true });
  useEffect(() => {
    const q = make();
    if (!q) {
      setState({ data: [], loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((x) => map(x.id, x.data())), loading: false }),
      (err) => setState({ data: [], loading: false, error: describeError(err) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function useLiveDoc<T>(make: () => DocumentReference | null, map: (id: string, d: DocumentData) => T, deps: unknown[]): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: true });
  useEffect(() => {
    const ref = make();
    if (!ref) return;
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? map(snap.id, snap.data()) : null, loading: false }),
      (err) => setState({ data: null, loading: false, error: describeError(err) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function describeError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code.includes("permission-denied")) return "This account cannot read this data.";
  if (code.includes("failed-precondition")) return "Firestore needs an index for this view. Deploy firestore.indexes.json.";
  if (code.includes("unavailable")) return "Firestore is unreachable. Check your connection.";
  return (err as Error)?.message ?? "Something went wrong loading data.";
}

export const useDaily = (fromKey: string) =>
  useLiveQuery(
    () => query(collection(db, "daily"), where(documentId(), ">=", fromKey), orderBy(documentId())),
    mapDaily,
    [fromKey],
  );

export const useUsers = (max = 1000) =>
  useLiveQuery(() => query(collection(db, "users"), orderBy("lastSeen", "desc"), limit(max)), mapUser, [max]);

export const useUser = (uid: string) => useLiveDoc(() => doc(db, "users", uid), mapUser, [uid]);

export const useRecentUsage = (max = 100) =>
  useLiveQuery(() => query(collection(db, "usage"), orderBy("at", "desc"), limit(max)), mapUsage, [max]);

export const useUserUsage = (uid: string, max = 50) =>
  useLiveQuery(
    () => query(collection(db, "usage"), where("uid", "==", uid), orderBy("at", "desc"), limit(max)),
    mapUsage,
    [uid, max],
  );

export const useFailures = (max = 50) =>
  useLiveQuery(
    () => query(collection(db, "usage"), where("ok", "==", false), orderBy("at", "desc"), limit(max)),
    mapUsage,
    [max],
  );

export const useAdmins = () =>
  useLiveQuery(() => collection(db, "admins"), (id, d) => ({ id, role: d.role }) as Admin, []);

/** Re-renders every `ms` so "minutes ago" text and the live window stay current. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const LIVE_WINDOW_MS = 5 * 60_000;

export function liveUsers(usage: Usage[], now: number) {
  const since = now - LIVE_WINDOW_MS;
  const byUser = new Map<string, Usage>();
  for (const u of usage) {
    if (!u.at || u.at.getTime() < since) continue;
    if (!byUser.has(u.uid)) byUser.set(u.uid, u);
  }
  return [...byUser.values()];
}

export interface Summary {
  totalUsers: number;
  anonymousUsers: number;
  googleUsers?: number;
  emailUsers?: number;
}

const PROVIDERS: Record<string, string> = { "google.com": "Google", password: "Email", anonymous: "Guest" };
export const providerLabel = (p?: string) => (p ? PROVIDERS[p] ?? p : "Guest");

/** What to call a user everywhere: name, else email, else a short guest ID. */
export function displayName(u: Pick<AppUser, "id" | "name" | "email"> | undefined, uid: string) {
  return u?.name || u?.email || `Guest ${uid.slice(0, 8)}`;
}

/** Live lookup of every user's name, for pages that list requests. */
export function useUserNames() {
  const users = useUsers(5000);
  const byId = new Map(users.data.map((u) => [u.id, u]));
  return (uid: string) => displayName(byId.get(uid), uid);
}

export function useSummary() {
  const [state, setState] = useState<Live<Summary | null>>({ data: null, loading: true });
  useEffect(() => {
    httpsCallable<void, Summary>(functions, "adminSummary")()
      .then((r) => setState({ data: r.data, loading: false }))
      .catch((e) => setState({ data: null, loading: false, error: describeError(e) }));
  }, []);
  return state;
}

export function sumDaily(days: Daily[]) {
  const t = { calls: 0, errors: 0, msTotal: 0, f: {} as Record<string, number>, h: {} as Record<string, number> };
  for (const d of days) {
    t.calls += d.calls;
    t.errors += d.errors;
    t.msTotal += d.msTotal;
    for (const [k, v] of Object.entries(d.f)) t.f[k] = (t.f[k] ?? 0) + v;
    for (const [k, v] of Object.entries(d.h)) t.h[k] = (t.h[k] ?? 0) + v;
  }
  return t;
}

export function topFeature(features: Record<string, number>) {
  let best = "";
  let max = 0;
  for (const [k, v] of Object.entries(features)) if (v > max) [best, max] = [k, v];
  return best || "None";
}
