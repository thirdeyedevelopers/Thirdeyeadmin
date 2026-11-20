import { Link } from "react-router-dom";
import { liveUsers, useNow, useRecentUsage, useUserNames } from "../data";
import { fmtMs, fmtNumber, fmtTime, relative } from "../format";
import { DataTable, ErrorNote, Loading, Page, Panel, Stat, Stats, StatusBadge } from "../components/ui";

export default function LivePage() {
  const recent = useRecentUsage(100);
  const now = useNow(10_000);
  const nameOf = useUserNames();
  const active = liveUsers(recent.data, now);
  const lastMinute = recent.data.filter((u) => u.at && now - u.at.getTime() < 60_000).length;

  return (
    <Page title="Live" intro="People using online features right now. The lists refresh by themselves without moving your place.">
      <ErrorNote error={recent.error} />
      <Stats label="Live numbers">
        <Stat label="Active in last 5 minutes" value={fmtNumber(active.length)} />
        <Stat label="Requests in last minute" value={fmtNumber(lastMinute)} />
      </Stats>

      <Panel title="Active users" sub="Each user's most recent request in the last 5 minutes" id="active">
        {recent.loading ? (
          <Loading what="live activity" />
        ) : (
          <DataTable
            caption="Active users"
            rows={active}
            empty="Nobody has used an online feature in the last 5 minutes."
            columns={[
              { key: "uid", label: "User", render: (r) => <Link to={`/users/${r.uid}`}>{nameOf(r.uid)}</Link> },
              { key: "feature", label: "Feature", render: (r) => r.feature },
              { key: "when", label: "Last request", render: (r) => relative(r.at, now) },
              { key: "ok", label: "Result", render: (r) => <StatusBadge ok={r.ok} code={r.errCode} /> },
            ]}
          />
        )}
      </Panel>

      <Panel title="Latest requests" sub="Newest first, last 100" id="feed">
        {recent.loading ? (
          <Loading what="requests" />
        ) : (
          <DataTable
            caption="Latest requests"
            rows={recent.data}
            empty="No requests yet. They appear here as soon as the app is used."
            columns={[
              { key: "time", label: "Time", render: (r) => fmtTime(r.at) },
              { key: "uid", label: "User", render: (r) => <Link to={`/users/${r.uid}`}>{nameOf(r.uid)}</Link> },
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
