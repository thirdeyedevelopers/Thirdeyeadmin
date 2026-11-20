import { Link, useParams } from "react-router-dom";
import { displayName, FEATURES, providerLabel, useAccount, useNow, useUser, useUserUsage } from "../data";
import { fmtDateTime, fmtMs, fmtNumber, fmtPercent, relative } from "../format";
import { DataTable, ErrorNote, Loading, Page, Panel, Stat, Stats, StatusBadge } from "../components/ui";

export default function UserDetail() {
  const { uid = "" } = useParams();
  const account = useAccount(uid);
  const user = useUser(uid);
  const usage = useUserUsage(uid, 100);
  const now = useNow(30_000);
  const a = account.data;
  const u = user.data;
  const who = { id: uid, name: a?.name ?? u?.name, email: a?.email ?? u?.email };

  const breakdown = FEATURES.map((f) => ({ feature: f, calls: u?.features[f] ?? 0 })).filter((x) => x.calls > 0);
  const max = Math.max(1, ...breakdown.map((b) => b.calls));
  const loading = account.loading || user.loading;

  return (
    <Page
      title={loading ? "User" : displayName(who, uid)}
      intro={
        <>
          {who.name && who.email && <>{who.email} · </>}
          {providerLabel(a?.provider ?? u?.provider)} sign-in · <span className="mono">ID {uid}</span>
        </>
      }
      actions={
        <Link className="btn secondary" to="/users">
          All users
        </Link>
      }
    >
      <ErrorNote error={user.error || usage.error} />
      {loading ? (
        <Loading what="user" />
      ) : (
        <>
          <Panel title="Account" id="user-account">
            {a ? (
              <dl className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))", gap: "1rem", margin: 0 }}>
                <div className="stat"><dt>Name</dt><dd style={{ fontSize: "1.1rem" }}>{a.name ?? "Not given"}</dd></div>
                <div className="stat"><dt>Email</dt><dd style={{ fontSize: "1.1rem", overflowWrap: "anywhere" }}>{a.email ?? "None"}</dd></div>
                <div className="stat"><dt>Sign-in type</dt><dd style={{ fontSize: "1.1rem" }}>{providerLabel(a.provider)}</dd></div>
                <div className="stat"><dt>Joined</dt><dd style={{ fontSize: "1.1rem" }}>{fmtDateTime(a.created)}</dd></div>
                <div className="stat"><dt>Last sign-in</dt><dd style={{ fontSize: "1.1rem" }}>{fmtDateTime(a.lastSignIn)}</dd></div>
                <div className="stat"><dt>Last opened app</dt><dd style={{ fontSize: "1.1rem" }}>{a.lastActive ? relative(a.lastActive, now) : "Never"}</dd></div>
                <div className="stat"><dt>Status</dt><dd style={{ fontSize: "1.1rem" }}>{a.disabled ? "Disabled" : "Active"}</dd></div>
              </dl>
            ) : (
              <p className="muted">This account no longer exists in Firebase sign-in. Only its past usage is shown.</p>
            )}
          </Panel>

          <Stats label="Usage summary">
            <Stat label="Last used a feature" value={u?.lastSeen ? relative(u.lastSeen, now) : "Never"} note={u?.lastSeen ? fmtDateTime(u.lastSeen) : undefined} />
            <Stat label="Requests" value={fmtNumber(u?.calls ?? 0)} />
            <Stat
              label="Failed"
              value={fmtNumber(u?.errors ?? 0)}
              note={u?.calls ? `${fmtPercent(u.errors / u.calls)} of requests` : undefined}
            />
            <Stat label="Last feature" value={u?.lastFeature ?? "None"} />
          </Stats>

          <Panel title="Features used" id="user-features">
            {breakdown.length === 0 ? (
              <p className="empty">This person has not used an online feature since recording started.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {breakdown.map((b) => (
                  <li key={b.feature} className="bar-row">
                    <span>{b.feature}</span>
                    <span className="bar-track" aria-hidden="true">
                      <span className="bar-fill" style={{ width: `${(b.calls / max) * 100}%`, display: "block" }} />
                    </span>
                    <span className="num">
                      {fmtNumber(b.calls)}
                      <span className="sr-only"> requests</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      <Panel title="Recent activity" sub="Last 100 requests, newest first" id="user-activity">
        {usage.loading ? (
          <Loading what="activity" />
        ) : (
          <DataTable
            caption="Recent activity"
            rows={usage.data}
            empty="No requests yet."
            columns={[
              { key: "at", label: "Time", render: (r) => fmtDateTime(r.at) },
              { key: "feature", label: "Feature", render: (r) => r.feature },
              { key: "fn", label: "Function", render: (r) => <span className="mono">{r.fn}{r.action ? ` · ${r.action}` : ""}</span> },
              { key: "ms", label: "Time taken", num: true, render: (r) => fmtMs(r.ms) },
              { key: "ok", label: "Result", render: (r) => <StatusBadge ok={r.ok} code={r.errCode} /> },
            ]}
          />
        )}
      </Panel>
    </Page>
  );
}
