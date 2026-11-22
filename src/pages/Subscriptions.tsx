import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { describeError, FEATURES } from "../data";
import { fmtDateTime } from "../format";
import { Column, DataTable, ErrorNote, Loading, Page, Panel } from "../components/ui";

// Third Eye Premium. Everything here goes through Cloud Functions (functions/billing.js), which check
// the admin, write admin_audit_logs and never trust this page for prices or Google Play state.

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
  acknowledged: boolean;
  startedAt: number;
  country: string;
  checkedAt: number;
}
interface GrantInfo {
  plan: string;
  days: number;
  startsAt: number;
  expiresAt: number;
  note: string;
  byEmail: string;
}
interface Status {
  active: boolean;
  activeUntil: number;
  source: "play" | "gift" | "none";
  plan: string | null;
  play: PlayInfo | null;
  grant: GrantInfo | null;
}
interface Row extends Status {
  uid: string;
  email: string | null;
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
  days?: number;
  expiresAt?: number;
  byEmail?: string;
  note?: string;
  reason?: string;
  productId?: string;
  state?: string;
  orderId?: string;
}

const listSubs = httpsCallable<{ uid?: string }, { rows: Row[]; config: Config }>(functions, "adminSubscriptions");
const userSub = httpsCallable<{ uid: string }, { status: Status; history: HistoryItem[] }>(functions, "adminSubscriptions");
const grantSub = httpsCallable<{ email: string; plan?: string; days?: number; note: string }, { email: string; status: Status }>(functions, "adminGrantSubscription");
const revokeSub = httpsCallable<{ email: string; reason: string }, { email: string; status: Status }>(functions, "adminRevokeSubscription");
const playAction = httpsCallable<{ uid: string; action: string; confirmOrderId?: string }, { status: Status | null }>(functions, "adminPlayAction");
const saveConfig = httpsCallable<{ set: true; required: boolean; freeFeatures: string[] }, Config>(functions, "adminBillingConfig");

const PLANS = [
  { id: "1m", label: "1 month" },
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "1y", label: "1 year" },
  { id: "custom", label: "Number of days" },
];

const input: CSSProperties = {
  minHeight: 44, padding: "0 0.75rem", font: "inherit", color: "var(--text)",
  background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8,
};
const check: CSSProperties = { display: "flex", alignItems: "center", gap: "0.5rem", minHeight: 44, width: "fit-content" };

const date = (ms?: number | null) => (ms ? fmtDateTime(new Date(ms)) : "—");
const typeLabel = (r: Status) =>
  r.play && r.grant ? "Google Play + gift" : r.play ? "Google Play" : r.grant ? "Gift" : "—";

export default function Subscriptions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [prefill, setPrefill] = useState("");

  const load = () => {
    setLoading(true);
    listSubs({})
      .then((r) => {
        setRows(r.data.rows);
        setConfig(r.data.config);
        setSelected((s) => (s ? r.data.rows.find((x) => x.uid === s.uid) ?? null : null));
        setError("");
      })
      .catch((e) => setError(describeError(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => (r.email ?? "").includes(q) || r.uid.toLowerCase().includes(q) || (r.play?.orderId ?? "").toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const active = rows.filter((r) => r.active);
  const columns: Column<Row>[] = [
    { key: "email", label: "User", render: (r) => <Link to={`/users/${r.uid}`}>{r.email ?? r.uid}</Link> },
    { key: "status", label: "Premium", render: (r) => <span className={`badge ${r.active ? "ok" : "muted"}`}>{r.active ? "On" : "Off"}</span> },
    { key: "type", label: "Type", render: typeLabel },
    { key: "plan", label: "Plan", render: (r) => r.plan ?? r.play?.plan ?? r.grant?.plan ?? "—" },
    { key: "ends", label: "Ends", render: (r) => date(r.activeUntil || r.play?.expiresAt || r.grant?.expiresAt) },
    {
      key: "pay", label: "Google Play payment", render: (r) => r.play
        ? `${r.play.payment}${r.play.voided ? ", refunded" : ""}${r.play.test ? " (test)" : ""}`
        : "—",
    },
    { key: "order", label: "Order", render: (r) => <span className="mono">{r.play?.orderId || "—"}</span> },
    {
      key: "act", label: "Actions", render: (r) => (
        <button type="button" className="btn secondary" onClick={() => setSelected(r)} aria-label={`Manage ${r.email ?? r.uid}`}>
          Manage
        </button>
      ),
    },
  ];

  return (
    <Page
      title="Subscriptions"
      intro="Third Eye Premium unlocks the online features. Google Play subscriptions are checked with Google on the server; gifts given here work at once. Every change is recorded with your email."
    >
      <ErrorNote error={error} />
      {config && <Switch config={config} onSaved={setConfig} />}
      <GiveForm prefill={prefill} onDone={load} />
      {selected && (
        <Manage row={selected} onChanged={load} onClose={() => setSelected(null)} onExtend={(email) => {
          setPrefill(email);
          document.getElementById("give-email")?.focus();
        }} />
      )}
      <Panel title="Subscribers" id="h-subs" sub={`${active.length} with Premium now, ${rows.length} in total`}>
        <div className="toolbar">
          <div className="field">
            <label htmlFor="sub-search">Find by email, user ID or order</label>
            <input id="sub-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} style={input} />
          </div>
          <button type="button" className="btn secondary" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Reload"}
          </button>
        </div>
        {loading && rows.length === 0 ? <Loading what="subscriptions" /> : (
          <DataTable caption="Third Eye Premium subscribers" rows={shown} columns={columns} empty="No subscriptions yet." />
        )}
      </Panel>
    </Page>
  );
}

function Switch({ config, onSaved }: { config: Config; onSaved: (c: Config) => void }) {
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
    if (required && !config.required &&
        !window.confirm("Turn Premium on? From now on, people without Premium can no longer use the online features (except any marked free).")) return;
    setBusy(true);
    setMsg(null);
    try {
      const c = (await saveConfig({ set: true, required, freeFeatures: free })).data;
      onSaved(c);
      setMsg({ ok: true, text: "Saved. It reaches every user within a minute." });
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
        {config.required ? "Premium is required for online features." : "Premium is off: every feature is free for everyone."}
        {config.updatedByEmail ? ` Last changed ${date(config.updatedAt)} by ${config.updatedByEmail}.` : ""}
      </>}
    >
      <form onSubmit={save} className="stack" style={{ gap: "0.5rem" }}>
        <label style={check}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} style={{ width: 20, height: 20 }} />
          Require Premium for online features
        </label>
        <fieldset disabled={!required} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="muted">Free for everyone even when Premium is required:</legend>
          {FEATURES.map((f) => (
            <label key={f} style={check}>
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
      <div role="status" aria-live="polite">{msg && <p className={`message${msg.ok ? "" : " error"}`}>{msg.text}</p>}</div>
    </Panel>
  );
}

function GiveForm({ prefill, onDone }: { prefill: string; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("1m");
  const [days, setDays] = useState("7");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (prefill) setEmail(prefill);
  }, [prefill]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) {
      setMsg({ ok: false, text: "Enter the user's full email address." });
      document.getElementById("give-email")?.focus();
      return;
    }
    const n = Number(days);
    if (plan === "custom" && (!Number.isInteger(n) || n < 1 || n > 3650)) {
      setMsg({ ok: false, text: "Days must be a whole number from 1 to 3650." });
      document.getElementById("give-days")?.focus();
      return;
    }
    const label = plan === "custom" ? `${n} days` : PLANS.find((p) => p.id === plan)?.label;
    if (!window.confirm(`Give ${label} of Premium to ${address}? If they already have a gift, this is added to its end.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = (await grantSub(plan === "custom" ? { email: address, days: n, note } : { email: address, plan, note })).data;
      setMsg({ ok: true, text: `Done. ${r.email} has Premium until ${date(r.status.activeUntil)}.` });
      setNote("");
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Give Premium" id="h-give" sub="The user must have signed in to the app once. Works straight away; no Google Play payment.">
      <form onSubmit={submit} className="stack" style={{ gap: "0.75rem" }}>
        <div className="field">
          <label htmlFor="give-email">User's email</label>
          <input id="give-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" style={input} />
        </div>
        <div className="field">
          <label htmlFor="give-plan">Plan</label>
          <select id="give-plan" value={plan} onChange={(e) => setPlan(e.target.value)} style={input}>
            {PLANS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        {plan === "custom" && (
          <div className="field">
            <label htmlFor="give-days">Days</label>
            <input id="give-days" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} style={input} />
          </div>
        )}
        <div className="field">
          <label htmlFor="give-note">Note (optional, only admins see it)</label>
          <input id="give-note" type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} style={input} />
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button type="submit" className="btn" disabled={busy}>{busy ? "Giving…" : "Give Premium"}</button>
        </div>
      </form>
      <div role="status" aria-live="polite">{msg && <p className={`message${msg.ok ? "" : " error"}`}>{msg.text}</p>}</div>
    </Panel>
  );
}

function Manage({ row, onChanged, onClose, onExtend }: { row: Row; onChanged: () => void; onClose: () => void; onExtend: (email: string) => void }) {
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const who = row.email ?? row.uid;

  useEffect(() => {
    setHistory(null);
    setMsg(null);
    userSub({ uid: row.uid }).then((r) => setHistory(r.data.history)).catch(() => setHistory([]));
  }, [row.uid, row.updatedAt]);

  const run = async (kind: string, question: string | null, work: () => Promise<string>) => {
    if (question && !window.confirm(question)) return;
    setBusy(kind);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await work() });
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: describeError(err) });
    } finally {
      setBusy("");
    }
  };

  const play = row.play;
  const order = play?.orderId ?? "";
  const doPlay = (action: string, question: string, done: string) =>
    run(action, question, async () => {
      await playAction({ uid: row.uid, action, confirmOrderId: order });
      return done;
    });

  return (
    <Panel title={`Manage ${who}`} id="h-manage" sub={`Premium ${row.active ? `on until ${date(row.activeUntil)}` : "off"} · ${typeLabel(row)}`}>
      <dl className="grid two" style={{ margin: "0 0 1rem" }}>
        <div className="stat">
          <dt>Google Play</dt>
          <dd style={{ fontSize: "1rem" }}>
            {play ? (
              <>
                {play.plan}, {play.payment}{play.voided ? ", refunded" : ""}{play.test ? " (test purchase)" : ""}
                <div className="muted">
                  Ends {date(play.expiresAt)} · auto-renew {play.autoRenew ? "on" : "off"} · started {date(play.startedAt)}
                  {play.country ? ` · ${play.country}` : ""}
                </div>
                <div className="muted">Order <span className="mono">{play.orderId || "—"}</span> · checked {date(play.checkedAt)}</div>
              </>
            ) : "No Google Play subscription"}
          </dd>
        </div>
        <div className="stat">
          <dt>Gift</dt>
          <dd style={{ fontSize: "1rem" }}>
            {row.grant ? (
              <>
                {row.grant.plan} ({row.grant.days} days), ends {date(row.grant.expiresAt)}
                <div className="muted">by {row.grant.byEmail}{row.grant.note ? ` · ${row.grant.note}` : ""}</div>
              </>
            ) : "No gift"}
          </dd>
        </div>
      </dl>

      <div className="toolbar">
        {row.email && (
          <button type="button" className="btn secondary" onClick={() => onExtend(row.email!)} disabled={!!busy}>
            Give or extend a gift
          </button>
        )}
        {row.grant && row.email && (
          <button type="button" className="btn secondary" disabled={!!busy} onClick={() => {
            const reason = window.prompt(`Remove the gift from ${who}? Google Play subscriptions are not touched. Reason (optional):`);
            if (reason === null) return;
            run("revoke", null, async () => {
              const r = (await revokeSub({ email: row.email!, reason })).data;
              return r.status.active ? `Gift removed. Premium stays on until ${date(r.status.activeUntil)} from Google Play.` : "Gift removed. Premium is off.";
            });
          }}>
            {busy === "revoke" ? "Removing…" : "Remove gift"}
          </button>
        )}
        {play && (
          <>
            <button type="button" className="btn secondary" disabled={!!busy} onClick={() => run("refresh", null, async () => {
              await playAction({ uid: row.uid, action: "refresh" });
              return "Read again from Google Play.";
            })}>
              {busy === "refresh" ? "Reading…" : "Refresh from Google Play"}
            </button>
            <button type="button" className="btn secondary" disabled={!!busy || !play.autoRenew}
              onClick={() => doPlay("cancel", `Stop renewing ${who}'s Google Play subscription? They keep Premium until ${date(play.expiresAt)}.`, "Renewal cancelled. Premium stays until the end date.")}>
              {busy === "cancel" ? "Cancelling…" : "Cancel renewal"}
            </button>
            <button type="button" className="btn secondary" disabled={!!busy}
              onClick={() => doPlay("refund", `Refund order ${order} for ${who}? They keep Premium until the end date. This cannot be undone.`, "Refunded. Premium stays until the end date.")}>
              {busy === "refund" ? "Refunding…" : "Refund"}
            </button>
            <button type="button" className="btn secondary" disabled={!!busy}
              onClick={() => doPlay("refund_revoke", `Refund order ${order} for ${who} AND end Premium now? This cannot be undone.`, "Refunded and Premium from Google Play ended.")}>
              {busy === "refund_revoke" ? "Refunding…" : "Refund and end access"}
            </button>
          </>
        )}
        <button type="button" className="btn secondary" onClick={onClose}>Close</button>
      </div>
      <div role="status" aria-live="polite">{msg && <p className={`message${msg.ok ? "" : " error"}`}>{msg.text}</p>}</div>

      <h3>History</h3>
      {history === null ? <Loading what="history" /> : history.length === 0 ? <p className="empty">No history yet.</p> : (
        <ul>
          {history.map((h, i) => (
            <li key={i}>
              {date(h.at)}: {historyText(h)}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function historyText(h: HistoryItem): string {
  switch (h.kind) {
    case "gift": return `Gift of ${h.plan} by ${h.byEmail}, until ${date(h.expiresAt)}${h.note ? ` (${h.note})` : ""}`;
    case "gift.removed": return `Gift removed by ${h.byEmail}${h.reason ? ` (${h.reason})` : ""}`;
    case "play.voided": return `Google Play payment refunded or charged back, order ${h.orderId}`;
    default: return `Google Play: ${(h.state ?? "").replace("SUBSCRIPTION_STATE_", "").toLowerCase()}, ${h.productId}, order ${h.orderId}`;
  }
}
