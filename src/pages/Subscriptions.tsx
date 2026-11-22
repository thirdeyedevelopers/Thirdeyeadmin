import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, DocumentData, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { describeError, FEATURES } from "../data";
import { fmtDateTime } from "../format";
import { ErrorNote, Loading, Page } from "../components/ui";

// Third Eye Premium. The list and the switch are read live from Firestore (admins only), so every
// change shows here at once. Every change goes through Cloud Functions (functions/billing.js), which
// check the admin, write admin_audit_logs and never trust this page for Google Play state.

interface PlayInfo {
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
  startedAt: number;
  plan: string;
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
  { id: "custom", label: "Number of days…" },
];
const ENTITLED = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"]);
const DAY = 86_400_000;

const n = (v: unknown) => (typeof v === "number" ? v : 0);
const date = (ms?: number | null) => (ms ? fmtDateTime(new Date(ms)) : "—");
const daysLeft = (until: number) => Math.max(0, Math.ceil((until - Date.now()) / DAY));

/** Same rule as the server (billing.js activeUntil): Premium is on until the later end date. */
function toRow(uid: string, d: DocumentData, now: number): Row {
  const p = d.play as DocumentData | undefined;
  const g = d.grant as DocumentData | undefined;
  const play: PlayInfo | null = p ? {
    plan: p.plan ?? "", state: p.state ?? "", payment: p.payment ?? "", autoRenew: !!p.autoRenew, trial: !!p.trial,
    expiresAt: n(p.expiresAt), orderId: p.orderId ?? "", test: !!p.test, voided: !!p.voided, startedAt: n(p.startedAt), country: p.country ?? "",
  } : null;
  const admin: AdminInfo | null = g ? {
    plan: g.plan ?? "", days: n(g.days), startsAt: n(g.startsAt), expiresAt: n(g.expiresAt), note: g.note ?? "", byEmail: g.byEmail ?? "",
  } : null;
  const playUntil = play && !play.voided && ENTITLED.has(play.state) && play.expiresAt > now ? play.expiresAt : 0;
  const adminUntil = admin && admin.expiresAt > now ? admin.expiresAt : 0;
  const until = Math.max(playUntil, adminUntil);
  const source = playUntil && playUntil >= adminUntil ? "play" : adminUntil ? "admin" : "none";
  return {
    uid, email: d.email ?? null, play, admin, updatedAt: n(d.updatedAt), active: until > now, activeUntil: until, source,
    plan: source === "play" ? play!.plan : source === "admin" ? admin!.plan : (play?.plan || admin?.plan || ""),
    startedAt: source === "play" ? play!.startedAt : source === "admin" ? admin!.startsAt : 0,
  };
}

// ------------------------------------------------------------------ the dashboard's own dialog boxes

/** A modal in the dashboard's own style: native <dialog> (focus stays inside, Esc closes), never the browser's alert. */
function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => back?.focus?.();
  }, []);
  return (
    <dialog ref={ref} className={`box${wide ? " wide" : ""}`} aria-labelledby="modal-title" onCancel={(e) => {
      e.preventDefault();
      onClose();
    }}>
      <div className="modal-body">
        <button type="button" className="x" aria-label="Close" onClick={onClose}>×</button>
        <h2 id="modal-title" style={{ paddingRight: "2.5rem" }}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

interface Ask {
  title: string;
  message: string;
  confirm: string;
  danger?: boolean;
  /** Shows a text box (for a reason); its text is returned. */
  input?: string;
}

/** Confirm box: resolves with the typed text ("" when there is no text box), or null for Cancel. */
function useConfirm() {
  const [ask, setAsk] = useState<(Ask & { resolve: (v: string | null) => void }) | null>(null);
  const open = (a: Ask) => new Promise<string | null>((resolve) => setAsk({ ...a, resolve }));
  const close = (v: string | null) => {
    ask?.resolve(v);
    setAsk(null);
  };
  const element = ask ? <ConfirmBox ask={ask} onClose={close} /> : null;
  return { open, element };
}

function ConfirmBox({ ask, onClose }: { ask: Ask; onClose: (v: string | null) => void }) {
  const [text, setText] = useState("");
  return (
    <Modal title={ask.title} onClose={() => onClose(null)}>
      <form className="stack" style={{ gap: "0.9rem" }} onSubmit={(e) => {
        e.preventDefault();
        onClose(text.trim());
      }}>
        <p>{ask.message}</p>
        {ask.input !== undefined && (
          <div className="field">
            <label htmlFor="ask-input">{ask.input}</label>
            <input id="ask-input" className="text-input" type="text" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn secondary" onClick={() => onClose(null)}>Cancel</button>
          <button type="submit" className={`btn${ask.danger ? " danger" : ""}`} autoFocus={ask.input === undefined}>{ask.confirm}</button>
        </div>
      </form>
    </Modal>
  );
}

type AskFn = (a: Ask) => Promise<string | null>;
type Msg = { ok: boolean; text: string } | null;

function Note({ msg }: { msg: Msg }) {
  return <div role="status" aria-live="polite">{msg && <p className={`message${msg.ok ? "" : " error"}`} style={{ marginTop: "0.75rem" }}>{msg.text}</p>}</div>;
}

/** Duration picker shared by "Add Premium" and "Add time". */
function Duration({ id, plan, days, setPlan, setDays }: { id: string; plan: string; days: string; setPlan: (v: string) => void; setDays: (v: string) => void }) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-plan`}>How long</label>
        <select id={`${id}-plan`} value={plan} onChange={(e) => setPlan(e.target.value)}>
          {PLANS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      {plan === "custom" && (
        <div className="field">
          <label htmlFor={`${id}-days`}>Days</label>
          <input id={`${id}-days`} className="text-input" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      )}
    </>
  );
}

function durationOf(plan: string, days: string): { body: { plan?: string; days?: number }; label: string } | string {
  if (plan !== "custom") return { body: { plan }, label: PLANS.find((p) => p.id === plan)!.label };
  const count = Number(days);
  if (!Number.isInteger(count) || count < 1 || count > 3650) return "Days must be a whole number from 1 to 3650.";
  return { body: { days: count }, label: `${count} ${count === 1 ? "day" : "days"}` };
}

// ------------------------------------------------------------------ page

export default function Subscriptions() {
  const [raw, setRaw] = useState<{ uid: string; d: DocumentData }[] | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showEnded, setShowEnded] = useState(false);
  const [addTimeFor, setAddTimeFor] = useState<Row | null>(null);
  const [detailsUid, setDetailsUid] = useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [listMsg, setListMsg] = useState<Msg>(null);
  const [now, setNow] = useState(Date.now());
  const confirm = useConfirm();

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

  const rows = useMemo(() => (raw ?? []).map((x) => toRow(x.uid, x.d, now)), [raw, now]);
  const match = (r: Row) => {
    const q = search.trim().toLowerCase();
    return !q || (r.email ?? "").includes(q) || r.uid.toLowerCase().includes(q) || (r.play?.orderId ?? "").toLowerCase().includes(q);
  };
  const active = rows.filter((r) => r.active).sort((a, b) => a.activeUntil - b.activeUntil);
  const ended = rows.filter((r) => !r.active).sort((a, b) => b.updatedAt - a.updatedAt);
  const details = rows.find((r) => r.uid === detailsUid) ?? null;

  const remove = async (r: Row) => {
    const who = r.email ?? r.uid;
    const reason = await confirm.open({
      title: "Remove Premium?",
      message: `Premium you added for ${who} ends now. Their phone shows it at once.${r.play ? " Their Google Play subscription is not touched." : ""}`,
      confirm: "Remove Premium",
      danger: true,
      input: "Reason (optional)",
    });
    if (reason === null) return;
    try {
      const res = (await removePremium({ email: r.email!, reason })).data;
      setListMsg({ ok: true, text: res.status.active ? `Removed for ${who}. Premium stays on until ${date(res.status.activeUntil)} from Google Play.` : `Premium removed for ${who}.` });
    } catch (err) {
      setListMsg({ ok: false, text: describeError(err) });
    }
  };

  return (
    <Page title="Subscriptions" intro="Add Premium for anyone by email, and see everyone who has it. Changes reach the user's phone at once.">
      <ErrorNote error={error} />

      <dl className="sp-stats" aria-label="Premium summary">
        <div className="sp-stat"><dt>With Premium now</dt><dd>{raw ? active.length : "…"}</dd></div>
        <div className="sp-stat"><dt>From Google Play</dt><dd>{raw ? active.filter((r) => r.source === "play").length : "…"}</dd></div>
        <div className="sp-stat"><dt>Added by admin</dt><dd>{raw ? active.filter((r) => r.source === "admin").length : "…"}</dd></div>
        <div className="sp-stat">
          <dt>Premium switch</dt>
          <dd style={{ fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span className={`badge ${config?.required === false ? "muted" : "ok"}`}>{config ? (config.required ? "On" : "Off, all free") : "…"}</span>
            <button type="button" className="sp-link" onClick={() => setSwitchOpen(true)} disabled={!config}>Change</button>
          </dd>
        </div>
      </dl>

      <AddPremium ask={confirm.open} />

      <section className="panel" aria-labelledby="h-users">
        <div className="sp-head">
          <h2 id="h-users">People with Premium</h2>
          <div className="field" style={{ minWidth: "16rem" }}>
            <label htmlFor="sub-search" className="sr-only">Find by email or order</label>
            <input id="sub-search" type="search" placeholder="Find by email or order" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <Note msg={listMsg} />
        {raw === null ? <Loading what="Premium users" /> : active.filter(match).length === 0 ? (
          <p className="sp-empty">{search ? "No one with Premium matches this search." : "Nobody has Premium yet. Add Premium above."}</p>
        ) : (
          <ul className="sp-list">
            {active.filter(match).map((r) => (
              <UserRow key={r.uid} r={r}>
                <button type="button" className="btn" onClick={() => setAddTimeFor(r)} disabled={!r.email}>Add time</button>
                {r.admin && r.admin.expiresAt > now && (
                  <button type="button" className="btn secondary" onClick={() => remove(r)}>Remove Premium</button>
                )}
                <button type="button" className="btn secondary" onClick={() => setDetailsUid(r.uid)}>Details</button>
              </UserRow>
            ))}
          </ul>
        )}
        {ended.length > 0 && (
          <>
            <button type="button" className="sp-link" aria-expanded={showEnded} onClick={() => setShowEnded((v) => !v)} style={{ marginTop: "0.75rem" }}>
              {showEnded ? "Hide" : "Show"} people whose Premium ended ({ended.length})
            </button>
            {showEnded && (
              <ul className="sp-list">
                {ended.filter(match).map((r) => (
                  <UserRow key={r.uid} r={r}>
                    <button type="button" className="btn secondary" onClick={() => setAddTimeFor(r)} disabled={!r.email}>Add Premium again</button>
                    <button type="button" className="btn secondary" onClick={() => setDetailsUid(r.uid)}>Details</button>
                  </UserRow>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {addTimeFor && <AddTime row={addTimeFor} onClose={() => setAddTimeFor(null)} onDone={(text) => setListMsg({ ok: true, text })} />}
      {details && <Details row={details} ask={confirm.open} onClose={() => setDetailsUid(null)} onRemove={() => remove(details)} />}
      {switchOpen && config && <SwitchBox config={config} onClose={() => setSwitchOpen(false)} />}
      {confirm.element}
    </Page>
  );
}

function UserRow({ r, children }: { r: Row; children: ReactNode }) {
  const left = r.active ? daysLeft(r.activeUntil) : 0;
  const total = r.startedAt && r.activeUntil > r.startedAt ? Math.ceil((r.activeUntil - r.startedAt) / DAY) : left;
  const pct = total > 0 ? Math.min(100, Math.round((left / total) * 100)) : 0;
  const name = r.email ?? r.uid;
  const ends = r.activeUntil || r.play?.expiresAt || r.admin?.expiresAt || 0;
  return (
    <li className="sp-row">
      <div className="sp-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</div>
      <div style={{ minWidth: 0 }}>
        <div className="sp-who">
          <Link to={`/users/${r.uid}`}>{name}</Link>
          {r.source === "play" || (!r.active && r.play) ? <span className="badge play">Google Play</span> : null}
          {r.source === "admin" || (!r.active && !r.play && r.admin) ? <span className="badge admin">Added by admin</span> : null}
          {r.play?.trial && r.source === "play" ? <span className="badge muted">Free trial</span> : null}
          {r.play?.test ? <span className="badge muted">Test</span> : null}
        </div>
        <div className="sp-meta">
          {r.plan || "Premium"} · {r.active ? (r.source === "play" && r.play?.autoRenew ? "renews" : "ends") : "ended"} {date(ends)}
        </div>
        {r.active && (
          <div className="sp-bar" role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={total} aria-valuenow={left}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="sp-left">
        {r.active ? <><strong>{left}</strong><span>{left === 1 ? "day left" : "days left"}</span></> : <span className="badge muted">Ended</span>}
      </div>
      <div className="sp-actions">{children}</div>
    </li>
  );
}

function AddPremium({ ask }: { ask: AskFn }) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("1m");
  const [days, setDays] = useState("7");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) {
      setMsg({ ok: false, text: "Enter the user's full email address." });
      document.getElementById("add-email")?.focus();
      return;
    }
    const d = durationOf(plan, days);
    if (typeof d === "string") {
      setMsg({ ok: false, text: d });
      return;
    }
    const ok = await ask({
      title: "Add Premium?",
      message: `${address} gets ${d.label} of Premium. If they already have Premium from you, the time is added to the end.`,
      confirm: "Add Premium",
    });
    if (ok === null) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = (await addPremium({ email: address, note, ...d.body })).data;
      setMsg({ ok: true, text: `Done. ${r.email} has Premium until ${date(r.status.activeUntil)}.` });
      setEmail("");
      setNote("");
    } catch (err) {
      setMsg({ ok: false, text: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel sp-hero" aria-labelledby="h-add">
      <h2 id="h-add">Add Premium</h2>
      <p className="sub">Type the email they signed in to Third Eye with. Works at once; no payment.</p>
      <form onSubmit={submit}>
        <div className="sp-add">
          <div className="field">
            <label htmlFor="add-email">User's email</label>
            <input id="add-email" className="text-input" type="email" placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <Duration id="add" plan={plan} days={days} setPlan={setPlan} setDays={setDays} />
          <button type="submit" className="btn" disabled={busy}>{busy ? "Adding…" : "Add Premium"}</button>
        </div>
        <div className="field sp-note">
          <label htmlFor="add-note">Note (optional, only admins see it)</label>
          <input id="add-note" className="text-input" type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </form>
      <Note msg={msg} />
    </section>
  );
}

function AddTime({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: (text: string) => void }) {
  const [plan, setPlan] = useState("1m");
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const who = row.email ?? row.uid;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const d = durationOf(plan, days);
    if (typeof d === "string") return setMsg({ ok: false, text: d });
    setBusy(true);
    try {
      const r = (await addPremium({ email: row.email!, note: "", ...d.body })).data;
      onDone(`${d.label} added for ${who}. Premium until ${date(r.status.activeUntil)}.`);
      onClose();
    } catch (err) {
      setMsg({ ok: false, text: describeError(err) });
      setBusy(false);
    }
  };

  return (
    <Modal title={row.active ? `Add time for ${who}` : `Add Premium for ${who}`} onClose={onClose}>
      <form className="stack" style={{ gap: "0.9rem" }} onSubmit={submit}>
        <p>{row.active && row.admin && row.admin.expiresAt > Date.now()
          ? `Added to the end of the Premium you gave (now until ${date(row.admin.expiresAt)}).`
          : "Starts now. Their phone shows it at once."}</p>
        <Duration id="time" plan={plan} days={days} setPlan={setPlan} setDays={setDays} />
        <Note msg={msg} />
        <div className="actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? "Adding…" : "Add Premium"}</button>
        </div>
      </form>
    </Modal>
  );
}

function Details({ row, ask, onClose, onRemove }: { row: Row; ask: AskFn; onClose: () => void; onRemove: () => void }) {
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const who = row.email ?? row.uid;
  const play = row.play;
  const order = play?.orderId ?? "";

  useEffect(() => {
    userHistory({ uid: row.uid }).then((r) => setHistory(r.data.history)).catch(() => setHistory([]));
  }, [row.uid, row.updatedAt]);

  const doPlay = async (action: string, a: Ask | null, done: string) => {
    if (a && (await ask(a)) === null) return;
    setBusy(action);
    setMsg(null);
    try {
      await playAction({ uid: row.uid, action, confirmOrderId: order });
      setMsg({ ok: true, text: done });
    } catch (err) {
      setMsg({ ok: false, text: describeError(err) });
    } finally {
      setBusy("");
    }
  };

  return (
    <Modal title={who} onClose={onClose} wide>
      <p>
        <strong>Premium {row.active ? "on" : "off"}</strong>
        {row.active ? ` until ${date(row.activeUntil)} (${daysLeft(row.activeUntil)} days left)` : ""}
      </p>

      <div className="sp-stat">
        <h3 style={{ fontSize: "1rem" }}>Google Play subscription</h3>
        {play ? (
          <div className="sp-meta">
            {play.plan}: {play.payment}{play.voided ? ", refunded" : ""}{play.test ? " (test purchase)" : ""}<br />
            Started {date(play.startedAt)} · ends {date(play.expiresAt)} · renews automatically: {play.autoRenew ? "yes" : "no"}{play.country ? ` · ${play.country}` : ""}<br />
            Order <span className="mono">{play.orderId || "—"}</span>
          </div>
        ) : <p className="sp-meta">None</p>}
        {play && (
          <div className="sp-actions" style={{ justifyContent: "flex-start", marginTop: "0.75rem" }}>
            <button type="button" className="btn secondary" disabled={!!busy} onClick={() => doPlay("refresh", null, "Updated from Google Play.")}>
              {busy === "refresh" ? "Checking…" : "Check Google Play again"}
            </button>
            <button type="button" className="btn secondary" disabled={!!busy || !play.autoRenew} onClick={() => doPlay("cancel", {
              title: "Stop renewing?", message: `${who} will not be charged again. Premium stays on until ${date(play.expiresAt)}.`, confirm: "Stop renewing",
            }, "Renewal stopped. Premium stays until the end date.")}>Stop renewing</button>
            <button type="button" className="btn secondary" disabled={!!busy} onClick={() => doPlay("refund", {
              title: "Refund the last payment?", message: `Order ${order} is refunded. Premium stays on until the end date. This cannot be undone.`, confirm: "Refund", danger: true,
            }, "Refunded. Premium stays until the end date.")}>Refund</button>
            <button type="button" className="btn danger" disabled={!!busy} onClick={() => doPlay("refund_revoke", {
              title: "Refund and remove Premium?", message: `Order ${order} is refunded and Premium from Google Play ends now. This cannot be undone.`, confirm: "Refund and remove", danger: true,
            }, "Refunded and Premium removed.")}>Refund and remove Premium</button>
          </div>
        )}
      </div>

      <div className="sp-stat">
        <h3 style={{ fontSize: "1rem" }}>Premium added by admin</h3>
        {row.admin ? (
          <p className="sp-meta">
            {row.admin.plan}: {date(row.admin.startsAt)} to {date(row.admin.expiresAt)}, by {row.admin.byEmail}{row.admin.note ? ` · ${row.admin.note}` : ""}
          </p>
        ) : <p className="sp-meta">None</p>}
        {row.admin && row.admin.expiresAt > Date.now() && row.email && (
          <div className="sp-actions" style={{ justifyContent: "flex-start", marginTop: "0.5rem" }}>
            <button type="button" className="btn secondary" onClick={onRemove}>Remove Premium</button>
          </div>
        )}
      </div>

      <Note msg={msg} />

      <h3 style={{ fontSize: "1rem" }}>History</h3>
      {history === null ? <Loading what="history" /> : history.length === 0 ? <p className="sp-meta">No history yet.</p> : (
        <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
          {history.map((h, i) => <li key={i} className="sp-meta">{date(h.at)}: {historyText(h)}</li>)}
        </ul>
      )}
    </Modal>
  );
}

function SwitchBox({ config, onClose }: { config: Config; onClose: () => void }) {
  const [required, setRequired] = useState(config.required);
  const [free, setFree] = useState<string[]>(config.freeFeatures);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await saveConfig({ set: true, required, freeFeatures: free });
      onClose();
    } catch (err) {
      setMsg({ ok: false, text: describeError(err) });
      setBusy(false);
    }
  };

  return (
    <Modal title="Premium switch" onClose={onClose}>
      <form className="stack" style={{ gap: "0.75rem" }} onSubmit={save}>
        <p>
          {required ? "On: online features need Premium." : "Off: every feature is free for everyone."}
          {config.updatedByEmail ? ` Last changed ${date(config.updatedAt)} by ${config.updatedByEmail}.` : ""}
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", minHeight: 44, fontWeight: 600 }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} style={{ width: 22, height: 22 }} />
          Require Premium for online features
        </label>
        <fieldset disabled={!required} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sp-meta" style={{ marginBottom: "0.25rem" }}>Free for everyone even when Premium is on:</legend>
          {FEATURES.map((f) => (
            <label key={f} style={{ display: "flex", alignItems: "center", gap: "0.6rem", minHeight: 40 }}>
              <input type="checkbox" checked={free.includes(f)} style={{ width: 20, height: 20 }}
                onChange={(e) => setFree((x) => (e.target.checked ? [...x, f] : x.filter((y) => y !== f)))} />
              {f}
            </label>
          ))}
        </fieldset>
        <Note msg={msg} />
        <div className="actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className={`btn${!required && config.required ? " danger" : ""}`} disabled={busy}>
            {busy ? "Saving…" : !required && config.required ? "Turn Premium off" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
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
