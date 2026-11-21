import { FormEvent, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { describeError } from "../data";
import { fmtDateTime } from "../format";
import { ErrorNote, Loading, Page } from "../components/ui";

interface TestResult {
  ok: boolean | null;
  message: string;
  at?: number;
}

interface Slot {
  id: string;
  name: string;
  model: string;
  features: string[];
  source: "dashboard" | "server" | "fallback";
  fallbackName: string;
  last4: string;
  updatedAt: number;
  updatedBy: string;
  lastTest: TestResult | null;
}

const listKeys = httpsCallable<void, { slots: Slot[] }>(functions, "adminApiKeys");
const setKey = httpsCallable<{ slot: string; key: string }, { saved: boolean; test: TestResult; last4?: string }>(functions, "adminSetApiKey");
const testKey = httpsCallable<{ slot: string }, TestResult>(functions, "adminTestApiKey");
const deleteKey = httpsCallable<{ slot: string }, { ok: boolean }>(functions, "adminDeleteApiKey");

export default function ApiKeys() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    listKeys()
      .then((r) => {
        setSlots(r.data.slots);
        setError("");
      })
      .catch((e) => setError(describeError(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <Page
      title="API keys"
      intro="The Google API key runs every online feature except Audio Transcriber and Video Transcriber, which each have their own key. A new key is tested first, and only a working key is saved. It replaces the old key and takes effect for every user within a few seconds."
    >
      <ErrorNote error={error} />
      {loading && slots.length === 0 ? (
        <Loading what="keys" />
      ) : (
        slots.map((s) => <KeyCard key={s.id} slot={s} onChanged={load} />)
      )}
      <p className="muted">
        Keys are stored encrypted and never shown again after saving, only their last 4 characters. Every change is recorded with
        the admin's email.
      </p>
    </Page>
  );
}

function KeyCard({ slot, onChanged }: { slot: Slot; onChanged: () => void }) {
  const [key, setKeyText] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "test" | "remove">("");
  const [result, setResult] = useState<TestResult | null>(null);
  const inputId = `key-${slot.id}`;
  const statusId = `status-${slot.id}`;

  const run = async (kind: "save" | "test" | "remove", work: () => Promise<TestResult | null>) => {
    setBusy(kind);
    setResult(null);
    try {
      const r = await work();
      if (r) setResult(r);
      onChanged();
    } catch (e) {
      setResult({ ok: false, message: describeError(e) });
    } finally {
      setBusy("");
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const value = key.trim();
    if (!value) {
      setResult({ ok: false, message: "Paste the new API key first." });
      document.getElementById(inputId)?.focus();
      return;
    }
    run("save", async () => {
      const r = (await setKey({ slot: slot.id, key: value })).data;
      if (r.saved) {
        setKeyText("");
        return { ok: true, message: `Saved and in use (${r.last4}). Test: ${r.test.message}` };
      }
      return { ok: false, message: `Not saved. The old key is still in use. Test: ${r.test.message}` };
    });
  };

  const test = () => run("test", async () => (await testKey({ slot: slot.id })).data);

  const remove = () => {
    if (!window.confirm(`Remove the dashboard key for ${slot.name}? ${slot.source === "dashboard" && slot.fallbackName ? `It will use the ${slot.fallbackName} again.` : "Third Eye will go back to the server key set during setup."}`)) return;
    run("remove", async () => {
      await deleteKey({ slot: slot.id });
      return { ok: true, message: slot.fallbackName ? `Key removed. The ${slot.fallbackName} is in use again.` : "Dashboard key removed. The server key is in use again." };
    });
  };

  const last = slot.lastTest;

  return (
    <section className="panel" aria-labelledby={`h-${slot.id}`}>
      <h2 id={`h-${slot.id}`}>{slot.name}</h2>
      <p className="sub">
        Used by {slot.features.join(", ")}
        {slot.model && (
          <>
            {" "}
            · Model <span className="mono">{slot.model}</span>
          </>
        )}
      </p>

      <dl className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))", gap: "1rem", margin: "0 0 1rem" }}>
        <div className="stat">
          <dt>Key in use</dt>
          <dd style={{ fontSize: "1.1rem" }}>
            {slot.source === "dashboard" ? (
              <>
                Dashboard key <span className="mono">{slot.last4}</span>
              </>
            ) : slot.source === "fallback" ? (
              `Using the ${slot.fallbackName} until a key is saved here`
            ) : (
              "Server key (set during setup)"
            )}
          </dd>
        </div>
        {slot.source === "dashboard" && (
          <div className="stat">
            <dt>Saved</dt>
            <dd style={{ fontSize: "1.1rem" }}>
              {fmtDateTime(slot.updatedAt ? new Date(slot.updatedAt) : undefined)}
              {slot.updatedBy && <div className="muted" style={{ fontSize: "0.9rem" }}>by {slot.updatedBy}</div>}
            </dd>
          </div>
        )}
        <div className="stat">
          <dt>Last test</dt>
          <dd style={{ fontSize: "1.1rem" }}>
            {last ? (
              <>
                <span className={`badge ${last.ok ? "ok" : "fail"}`}>{last.ok ? "Working" : "Failed"}</span>
                <div className="muted" style={{ fontSize: "0.9rem" }}>
                  {last.message}
                  {last.at ? ` ${fmtDateTime(new Date(last.at))}` : ""}
                </div>
              </>
            ) : (
              "Not tested yet"
            )}
          </dd>
        </div>
      </dl>

      <form onSubmit={save} className="stack" style={{ gap: "0.75rem" }}>
        <div className="field">
          <label htmlFor={inputId}>New API key</label>
          <input
            id={inputId}
            type={show ? "text" : "password"}
            value={key}
            onChange={(e) => setKeyText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="AIza…"
            aria-describedby={statusId}
            style={{
              minHeight: 44, padding: "0 0.75rem", font: "inherit", color: "var(--text)",
              background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8,
            }}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: 44, width: "fit-content" }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ width: 20, height: 20 }} />
          Show key
        </label>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button type="submit" className="btn" disabled={!!busy}>
            {busy === "save" ? "Testing and saving…" : "Test and save"}
          </button>
          <button type="button" className="btn secondary" onClick={test} disabled={!!busy}>
            {busy === "test" ? "Testing…" : "Test key in use"}
          </button>
          {slot.source === "dashboard" && (
            <button type="button" className="btn secondary" onClick={remove} disabled={!!busy}>
              {busy === "remove" ? "Removing…" : "Remove dashboard key"}
            </button>
          )}
        </div>
      </form>

      <div id={statusId} role="status" aria-live="polite" style={{ marginTop: "0.75rem" }}>
        {result && <p className={`message${result.ok ? "" : " error"}`}>{result.message}</p>}
      </div>
    </section>
  );
}
