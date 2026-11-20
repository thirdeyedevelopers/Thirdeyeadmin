const IST = "Asia/Kolkata";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const time = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", second: "2-digit" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short" });
const number = new Intl.NumberFormat("en-IN");

export const fmtNumber = (n: number) => number.format(Math.round(n));
export const fmtDateTime = (d?: Date) => (d ? dateTime.format(d) : "Never");
export const fmtTime = (d?: Date) => (d ? time.format(d) : "");
export const fmtPercent = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.01 ? 2 : 1)}%`;
export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/** Firestore daily documents are keyed by the India date, YYYY-MM-DD. */
export const istDayKey = (d: Date) => dayKey.format(d);
export const dayKeyLabel = (key: string) => dayLabel.format(new Date(`${key}T12:00:00+05:30`));

export function lastDayKeys(days: number): string[] {
  const keys: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) keys.push(istDayKey(new Date(now - i * 86_400_000)));
  return keys;
}

export function relative(d?: Date, now = Date.now()) {
  if (!d) return "Never";
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const shortId = (uid: string) => uid.slice(0, 8);
