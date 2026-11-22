import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, DocumentData, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { describeError, FEATURES } from "../data";
import { fmtDateTime } from "../format";
import { Column, DataTable, ErrorNote, Loading, Page, Panel } from "../components/ui";

// Third Eye Premium. The list and the switch are read live from Firestore (admins only), so every
// change shows here at once. Every change goes through Cloud Functions (functions/billing.js), which
// check the admin, write admin_audit_logs and never trust this page for Google Play state.

interface PlayInfo {
  productId: string;
  plan: string;
  state: string;
  payment: string;
  autoRenew: boolean;
  trial: boolean;
  expiresAt: number;
  orderId: string;
  test: boolean;
  voided: boolean;
  startedAt: number;
  country: string;
  checkedAt: number;
}
interface AdminInfo {
  plan: string;
  days: number;
  startsAt: number;
  expiresAt: number;
  note: string;
  byEmail: string;
}
interface Row {
  uid: string;
  email: string | null;
  active: boolean;
  activeUntil: number;
  source: "play" | "admin" | "none";
  play: PlayInfo | null;
  admin: AdminInfo | null;
  updatedAt: number;
}
interface Config {
  required: boolean;
  freeFeatures: string[];
  updatedAt: number;
  updatedByEmail: string | null;
}
interface HistoryItem {
  kind: string;
  at: number;
  plan?: string;
  expiresAt?: number;
  byEmail?: string;
  note?: string;
  reason?: string;
  productId?: string;
  state?: string;
  orderId?: string;
}

const userHistory = httpsCallable<{ uid: string }, { history: HistoryItem[] }>(functions, "adminSubscriptions");
const addPremium = httpsCallable<{ email: string; plan?: string; days?: number; note: string }, { email: string; status: { activeUntil: number } }>(functions, "adminGrantSubscription");
const removePremium = httpsCallable<{ email: string; reason: string }, { email: string; status: { active: boolean; activeUntil: number } }>(functions, "adminRevokeSubscription");
const playAction = httpsCallable<{ uid: string; action: string; confirmOrderId?: string }, unknown>(functions, "adminPlayAction");
const saveConfig = httpsCallable<{ set: true; required: boolean; freeFeatures: string[] }, Config>(functions, "adminBillingConfig");

const PLANS = [
  { id: "1m", label: "1 month" },
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "1y", label: "1 year" },
  { id: "custom", label: "Number of days" },
];
const ENTITLED = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"]);
const DAY = 86_400_000;

const n = (v: unknown) => (typeof v === "number" ? v : 0);
const date = (ms?: number | null) => (ms ? fmtDateTime(new Date(ms)) : "—");
const daysLeft = (until: number) => Math.max(0, Math.ceil((until - Date.now()) / DAY));
const typeLabel = (r: Row) =>
  r.play && r.admin ? "Google Play + added by admin" : r.play ? "Google Play" : r.admin ? "Added by admin" : "—";

/** Same rule as the server (billing.js activeUntil): Premium is on until the later end date. */
function toRow(uid: string, d: DocumentData, now: number): Row {
  const p = d.play as DocumentData | undefined;
  const g = d.grant as DocumentData | undefined;
  const play: PlayInfo | null = p ? {
    productId: p.productId ?? "", plan: p.plan ?? "", state: p.state ?? "", payment: p.payment ?? "",
    autoRenew: !!p.autoRenew, trial: !!p.trial, expiresAt: n(p.expiresAt), orderId: p.orderId ?? "", test: !!p.test,
    voided: !!p.voided, startedAt: n(p.startedAt), country: p.country ?? "", checkedAt: n(p.checkedAt),
  } : null;
  const admin: AdminInfo | null = g ? {
    plan: g.plan ?? "", days: n(g.days), startsAt: n(g.startsAt), expiresAt: n(g.expiresAt), note: g.note ?? "", byEmail: g.byEmail ?? "",
  } : null;
  const playUntil = play && !play.voided && ENTITLED.has(play.state) && play.expiresAt > now ? play.expiresAt : 0;
  const adminUntil = admin && admin.expiresAt > now ? admin.expiresAt : 0;
  const until = Math.max(playUntil, adminUntil);
  return {
    uid, email: d.email ?? null, play, admin, updatedAt: n(d.updatedAt),
    active: until > now, activeUntil: until,
    source: playUntil && playUntil >= adminUntil ? "play" : adminUntil ? "admin" : "none",
  };
}

// ------------------------------------------------------------------ the dashboard's own dialog box

interface Ask {
  title: string;
  message: string;
  confirm: string;
  danger?: boolean;
  /** Shows a text box (for a reason); its text is returned. */
  input?: string;
}

/** Promise-based dialog box: resolves with the typed text ("" when there is no text box), or null for Cancel. */
function useDialog() {
  const [ask, setAsk] = useState<(Ask & { resolve: (v: string | null) => void }) | null>(null);
  const open = (a: Ask) => new Promise<string | null>((resolve) => setAsk({ ...a, resolve }));
  const close = (v: string | null) => {
    ask?.resolve(v);
    setAsk(null);
  };
  const element = ask ? <DialogBox ask={ask} onClose={close} /> : null;
  return { open, element };
}

function DialogBox({ ask, onClose }: { ask: Ask; onClose: (v: string | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const back = useRef<Element | null>(null);
  useEffect(() => {
    back.current = document.activeElement;
    ref.current?.showModal();
    return () => (back.current as HTMLElement | null)?.focus?.();
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onClose(text.trim());
  };
  return (
    <dialog ref={ref} className="box" aria-labelledby="dlg-title" aria-describedby="dlg-msg" onCancel={(e) => {
      e.preventDefault();
      onClose(null);
    }}>
      <form onSubmit={submit}>
        <h2 id="dlg-title">{ask.title}</h2>
        <p id="dlg-msg">{ask.message}</p>
        {ask.input !== undefined && (
          <div className="field">
            <label htmlFor="dlg-input">{ask.input}</label>
            <input id="dlg-input" className="text-input" type="text" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn secondary" onClick={() => onClose(null)}>Cancel</button>
          <button type="submit" className={`btn${ask.danger ? " danger" : ""}`} autoFocus={ask.input === undefined}>{ask.confirm}</button>
        </div>
      </form>
    </dialog>
  );
}

// ------------------------------------------------------------------ page

export default function Subscriptions() {
  const [raw, setRaw] = useState<{ uid: string; d: DocumentData }[] | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [prefill, setPrefill] = useState({ email: "", n: 0 });
  const [now, setNow] = useState(Date.now());
  const dialog = useDialog();

  useEffect(() => onSnapshot(collection(db, "subscriptions"),
    (snap) => {
      setRaw(snap.docs.map((x) => ({ uid: x.id, d: x.data() })));
      setError("");
    },
    (e) => setError(describeError(e))), []);
  useEffect(() => onSnapshot(doc(db, "billing_config", "main"), (snap) => {
    const d = snap.exists() ? snap.data() : {};
    setConfig({
      required: d.required !== false,
      freeFeatures: Array.isArray(d.freeFeatures) ? d.freeFeatures : [],
      updatedAt: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : 0,
      updatedByEmail: d.updatedByEmail ?? null,
    });
  }, (e) => setError(describeError(e))), []);
  // Premium that runs out while this page is open turns off here too.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo(() => (raw ?? []).map((x) => toRow(x.uid, x.d, now))
    .sort((a, b) => Number(b.active) - Number(a.active) || b.activeUntil - a.activeUntil || b.updatedAt - a.updatedAt), [raw, now]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => (r.email ?? "").includes(q) || r.uid.toLowerCase().includes(q) || (r.play?.orderId ?? "").toLowerCase().includes(q)) : rows;
  }, [rows, search]);
  const selected = rows.find((r) => r.uid === selectedUid) ?? null;
  const active = rows.filter((r) => r.active);

  const columns: Column<Row>[] = [
    { key: "email", label: "User", render: (r) => <Link to={`/users/${r.uid}`}>{r.email ?? r.uid}</Link> },
    { key: "status", label: "Premium", render: (r) => <span className={`badge ${r.active ? "ok" : "muted"}`}>{r.active ? "On" : "Off"}</span> },
    { key: "type", label: "Type", render: typeLabel },
    { key: "plan", label: "Plan", render: (r) => (r.source === "admin" ? r.admin?.plan : r.play?.plan ?? r.admin?.plan) || "—" },
    { key: "ends", label: "Ends", render: (r) => date(r.activeUntil || r.play?.expiresAt || r.admin?.expiresAt) },
    { key: "left", label: "Days left", num: true, render: (r) => (r.active ? daysLeft(r.activeUntil) : "—") },
    {
      key: "pay", label: "Google Play payment", render: (r) => r.play
        ? `${r.play.payment}${r.play.voided ? ", refunded" : ""}${r.play.test ? " (test)" : ""}`
        : "—",
    },
    {
      key: "act", label: "Actions", render: (r) => (
        <button type="button" className="btn secondary" onClick={() => setSelectedUid(r.uid)} aria-label={`Manage ${r.email ?? r.uid}`}>
          Manage
        </button>
      ),
    },
  ];

  return (
    <Page
      title="Subscriptions"
      intro="Third Eye Premium unlocks the online features. Everything here updates live, and every change reaches the user's phone at once. Every change is recorded with your email."
    >
      <ErrorNote error={error} />
      {config && <Switch config={config} ask={dialog.open} />}
      <AddForm prefill={prefill} ask={dialog.open} />
      {selected && (
        <Manage row={selected} ask={dialog.open} onClose={() => setSelectedUid(null)} onAddTime={(email) => {
          setPrefill((p) => ({ email, n: p.n + 1 }));
          document.getElementById("add-email")?.focus();
        }} />
      )}
      <Panel title="Subscribers" id="h-subs" sub={`${active.length} with Premium now, ${rows.length} in total`}>
        <div className="toolbar">
          <div className="field">
            <label htmlFor="sub-search">Find by email, user ID or order</label>
            <input id="sub-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {raw === null ? <Loading what="subscriptions" /> : (
          <DataTable caption="Third Eye Premium subscribers" rows={shown} columns={columns} empty="No subscriptions yet." />
        )}
      </Panel>
      {dialog.element}
    </Page>
  );
}

type AskFn = (a: Ask) => Promise<string | null>;

function Note({ msg }: { msg: { ok: boolean; text: string } | null }) {
  return <div role="status" aria-live="polite">{msg && <p className={`message${msg.ok ? "" : " error"}`}>{msg.text}</p>}</div>;
}

function Switch({ config, ask }: { config: Config; ask: AskFn }) {
  const [required, setRequired] = useState(config.required);
  const [free, setFree] = useState<string[]>(config.freeFeatures);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    setRequired(config.required);
    setFree(config.freeFeatures);
  }, [config]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (required !== config.required) {
      const ok = await ask(required
        ? { title: "Turn Premium on?", message: "People without Premium will no longer be able to use the online features (except any you mark free).", confirm: "Turn on" }
        : { title: "Turn Premium off?", message: "Every feature becomes free for everyone until you turn Premium on again.", confirm: "Turn off", danger: true });
      if (ok === null) return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await saveConfig({ set: true, required, freeFeatures: free });
      setMsg({ ok: true, text: "Saved. Users see it within a few seconds." });
    } catch (err) {
      setMsg({ ok: false, text: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Premium switch"
      id="h-switch"
      sub={<>
        {config.required ? "Premium is ON: online features need Premium." : "Premium is OFF: every feature is free for everyone."}
        {config.updatedByEmail ? ` Last changed ${date(config.updatedAt)} by ${config.updatedByEmail}.` : ""}
      </>}
    >
      <form onSubmit={save} className="stack" style={{ gap: "0.5rem" }}>
        <label className="check-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: 44 }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} style={{ width: 20, height: 20 }} />
          Require Premium for online features
        </label>
        <fieldset disabled={!required} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="muted">Free for everyone even when Premium is on:</legend>
          {FEATURES.map((f) => (
            <label key={f} style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: 44 }}>
              <input
                type="checkbox"
                checked={free.includes(f)}
                onChange={(e) => setFree((x) => (e.target.checked ? [...x, f] : x.filter((y) => y !== f)))}
                style={{ width: 20, height: 20 }}
              />
              {f}
            </label>
          ))}
        </fieldset>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
      <Note msg={msg} />
    </Panel>
  );
}

function AddForm({ prefill, ask }: { prefill: { email: string; n: number }; ask: AskFn }) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("1m");
  const [days, setDays] = useState("7");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (prefill.email) setEmail(prefill.email);
  }, [prefill]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) {
      setMsg({ ok: false, text: "Enter the user's full email address." });
      document.getElementById("add-email")?.focus();
      return;
    }
    const count = Number(days);
    if (plan === "custom" && (!Number.isInteger(count) || count < 1 || count > 3650)) {
      setMsg({ ok: false, text: "Days must be a whole number from 1 to 3650." });
      document.getElementById("add-days")?.focus();
      return;
    }
    const label = plan === "custom" ? `${count} days` : PLANS.find((p) => p.id === plan)?.label;
    const ok = await ask({
      title: "Add Premium?",
      message: `Add ${label} of Premium to ${address}. If they already have Premium from you, the time is added to its end. They see it in the app at once.`,
      confirm: "Add Premium",
    });
    if (ok === null) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = (await addPremium(plan === "custom" ? { email: address, days: count, note } : { email: address, plan, note })).data;
      setMsg({ ok: true, text: `Done. ${r.email} has Premium until ${date(r.status.activeUntil)}.` });
      setNote("");
    } catch (err) {
      setMsg({ ok: false, text: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Add Premium" id="h-add" sub="For any user who has signed in to the app once. Works at once; no payment.">
      <form onSubmit={submit} className="stack" style={{ gap: "0.75rem" }}>
        <div className="field">
          <label htmlFor="add-email">User's email</label>
          <input id="add-email" className="text-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="add-plan">How long</label>
          <select id="add-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {PLANS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        {plan === "custom" && (
          <div className="field">
            <label htmlFor="add-days">Days</label>
            <input id="add-days" className="text-input" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="add-note">Note (optional, only admins see it)</label>
          <input id="add-note" className="text-input" type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button type="submit" className="btn" disabled={busy}>{busy ? "Adding…" : "Add Premium"}</button>
        </div>
      </form>
      <Note msg={msg} />
    </Panel>
  );
}

function Manage({ row, ask, onClose, onAddTime }: { row: Row; ask: AskFn; onClose: () => void; onAddTime: (email: string) => void }) {
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const who = row.email ?? row.uid;
  const play = row.play;
  const order = play?.orderId ?? "";

  useEffect(() => {
    setHistory(null);
    userHistory({ uid: row.uid }).then((r) => setHistory(r.data.history)).catch(() => setHistory([]));
  }, [row.uid, row.updatedAt]);
  useEffect(() => setMsg(null), [row.uid]);

  const run = async (kind: string, a: Ask, work: (text: string) => Promise<string>) => {
    const text = await ask(a);
    if (text === null) return;
    setBusy(kind);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await work(text) });
    } catch (err) {
      setMsg({ ok: false, text: describeError(err) });
    } finally {
      setBusy("");
    }
  };
  const doPlay = (action: string, a: Ask, done: string) =>
    run(action, a, async () => {
      await playAction({ uid: row.uid, action, confirmOrderId: order });
      return done;
    });

  return (
    <Panel title={`Manage ${who}`} id="h-manage" sub={`Premium ${row.active ? `on until ${date(row.activeUntil)} (${daysLeft(row.activeUntil)} days left)` : "off"} · ${typeLabel(row)}`}>
      <dl className="grid two" style={{ margin: "0 0 1rem" }}>
        <div className="stat">
          <dt>Google Play subscription</dt>
          <dd style={{ fontSize: "1rem" }}>
            {play ? (
              <>
                {play.plan}, {play.payment}{play.voided ? ", refunded" : ""}{play.test ? " (test purchase)" : ""}
                <div className="muted">
                  Started {date(play.startedAt)} · ends {date(play.expiresAt)} · renews automatically: {play.autoRenew ? "yes" : "no"}
                  {play.country ? ` · ${play.country}` : ""}
                </div>
                <div className="muted">Order <span className="mono">{play.orderId || "—"}</span></div>
              </>
            ) : "None"}
          </dd>
        </div>
        <div className="stat">
          <dt>Premium added by admin</dt>
          <dd style={{ fontSize: "1rem" }}>
            {row.admin ? (
              <>
                {row.admin.plan}: {date(row.admin.startsAt)} to {date(row.admin.expiresAt)}
                <div className="muted">by {row.admin.byEmail}{row.admin.note ? ` · ${row.admin.note}` : ""}</div>
              </>
            ) : "None"}
          </dd>
        </div>
      </dl>

      <div className="toolbar">
        {row.email && (
          <button type="button" className="btn secondary" onClick={() => onAddTime(row.email!)} disabled={!!busy}>
            Add more time
          </button>
        )}
        {row.admin && row.email && (
          <button type="button" className="btn secondary" disabled={!!busy} onClick={() => run("remove", {
            title: "Remove Premium?",
            message: `Remove the Premium you added for ${who}. It ends now and their phone shows it at once.${play ? " Their Google Play subscription is not touched." : ""}`,
            confirm: "Remove Premium",
            danger: true,
            input: "Reason (optional)",
          }, async (reason) => {
            const r = (await removePremium({ email: row.email!, reason })).data;
            return r.status.active ? `Removed. Premium stays on until ${date(r.status.activeUntil)} because of their Google Play subscription.` : "Removed. Premium is off.";
          })}>
            {busy === "remove" ? "Removing…" : "Remove Premium"}
          </button>
        )}
        {play && (
          <>
            <button type="button" className="btn secondary" disabled={!!busy} onClick={async () => {
              setBusy("refresh");
              setMsg(null);
              try {
                await playAction({ uid: row.uid, action: "refresh" });
                setMsg({ ok: true, text: "Updated from Google Play." });
              } catch (err) {
                setMsg({ ok: false, text: describeError(err) });
              } finally {
                setBusy("");
              }
            }}>
              {busy === "refresh" ? "Checking…" : "Check Google Play again"}
            </button>
            <button type="button" className="btn secondary" disabled={!!busy || !play.autoRenew}
              onClick={() => doPlay("cancel", {
                title: "Stop renewing?",
                message: `${who} will not be charged again. Premium stays on until ${date(play.expiresAt)}.`,
                confirm: "Stop renewing",
              }, "Renewal stopped. Premium stays until the end date.")}>
              {busy === "cancel" ? "Stopping…" : "Stop renewing"}
            </button>
            <button type="button" className="btn secondary" disabled={!!busy}
              onClick={() => doPlay("refund", {
                title: "Refund the last payment?",
                message: `Order ${order} for ${who} is refunded. Premium stays on until the end date. This cannot be undone.`,
                confirm: "Refund",
                danger: true,
              }, "Refunded. Premium stays until the end date.")}>
              {busy === "refund" ? "Refunding…" : "Refund"}
            </button>
            <button type="button" className="btn secondary" disabled={!!busy}
              onClick={() => doPlay("refund_revoke", {
                title: "Refund and remove Premium?",
                message: `Order ${order} for ${who} is refunded and Premium from Google Play ends now. This cannot be undone.`,
                confirm: "Refund and remove",
                danger: true,
              }, "Refunded and Premium removed.")}>
              {busy === "refund_revoke" ? "Refunding…" : "Refund and remove Premium"}
            </button>
          </>
        )}
        <button type="button" className="btn secondary" onClick={onClose}>Close</button>
      </div>
      <Note msg={msg} />

      <h3>History</h3>
      {history === null ? <Loading what="history" /> : history.length === 0 ? <p className="empty">No history yet.</p> : (
        <ul>
          {history.map((h, i) => <li key={i}>{date(h.at)}: {historyText(h)}</li>)}
        </ul>
      )}
    </Panel>
  );
}

function historyText(h: HistoryItem): string {
  switch (h.kind) {
    case "gift": return `Premium added by ${h.byEmail} (${h.plan}), until ${date(h.expiresAt)}${h.note ? `: ${h.note}` : ""}`;
    case "gift.removed": return `Premium removed by ${h.byEmail}${h.reason ? `: ${h.reason}` : ""}`;
    case "play.voided": return `Google Play payment refunded, order ${h.orderId}`;
    default: return `Google Play: ${(h.state ?? "").replace("SUBSCRIPTION_STATE_", "").toLowerCase()}, ${h.productId}, order ${h.orderId}`;
  }
}
