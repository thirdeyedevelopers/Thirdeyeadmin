import { Link, useParams } from "react-router-dom";
import { FEATURES, useNow, useUser, useUserUsage } from "../data";
import { fmtDateTime, fmtMs, fmtNumber, fmtPercent, relative, shortId } from "../format";
import { DataTable, ErrorNote, Loading, Page, Panel, Stat, Stats, StatusBadge } from "../components/ui";

export default function UserDetail() {
  const { uid = "" } = useParams();
  const user = useUser(uid);
  const usage = useUserUsage(uid, 100);
  const now = useNow(30_000);
  const u = user.data;

  const breakdown = FEATURES.map((f) => ({ feature: f, calls: u?.features[f] ?? 0 })).filter((x) => x.calls > 0);
  const max = Math.max(1, ...breakdown.map((b) => b.calls));

  return (
    <Page
      title={`User ${shortId(uid)}`}
      intro={<span className="mono">Full ID: {uid}</span>}
      actions={
        <Link className="btn secondary" to="/users">
          All users
        </Link>
      }
    >
      <ErrorNote error={user.error || usage.error} />
      {user.loading ? (
        <Loading what="user" />
      ) : !u ? (
        <p className="message">This user has no recorded activity.</p>
      ) : (
        <>
          <Stats label="User summary">
            <Stat label="Last seen" value={relative(u.lastSeen, now)} note={fmtDateTime(u.lastSeen)} />
            <Stat label="First seen" value={fmtDateTime(u.firstSeen)} />
            <Stat label="Requests" value={fmtNumber(u.calls)} />
            <Stat label="Failed" value={fmtNumber(u.errors)} note={u.calls ? `${fmtPercent(u.errors / u.calls)} of requests` : undefined} />
          </Stats>

          <Panel title="Features used" id="user-features">
            {breakdown.length === 0 ? (
              <p className="empty">No feature use recorded.</p>
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
