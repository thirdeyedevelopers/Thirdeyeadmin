import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDaily, useFailures, useRecentUsage, useUserNames } from "../data";
import { dayKeyLabel, fmtDateTime, fmtMs, fmtNumber, fmtPercent, lastDayKeys } from "../format";
import { useTheme } from "../theme";
import { ChartFigure, ChartTooltip, DataTable, ErrorNote, Loading, Page, Panel } from "../components/ui";

const DAYS = 14;
const SAMPLE = 1000;

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export default function Health() {
  const keys = useMemo(() => lastDayKeys(DAYS), []);
  const daily = useDaily(keys[0]);
  const recent = useRecentUsage(SAMPLE);
  const failures = useFailures(50);
  const nameOf = useUserNames();
  const { colors } = useTheme();

  const byDay = new Map(daily.data.map((d) => [d.id, d]));
  const errorSeries = keys.map((k) => {
    const d = byDay.get(k);
    return { day: dayKeyLabel(k), errors: d?.errors ?? 0, calls: d?.calls ?? 0 };
  });

  const fns = new Map<string, { fn: string; feature: string; calls: number; failed: number; ms: number[] }>();
  for (const u of recent.data) {
    const key = u.action ? `${u.fn} · ${u.action}` : u.fn;
    const row = fns.get(key) ?? { fn: key, feature: u.feature, calls: 0, failed: 0, ms: [] };
    row.calls++;
    if (!u.ok) row.failed++;
    row.ms.push(u.ms);
    fns.set(key, row);
  }
  const fnRows = [...fns.values()]
    .map((r) => ({ ...r, avg: r.ms.reduce((a, b) => a + b, 0) / r.ms.length, p95: percentile(r.ms, 95) }))
    .sort((a, b) => b.calls - a.calls);

  return (
    <Page title="Health" intro={`Failures and response times. Function figures use the latest ${fmtNumber(SAMPLE)} requests.`}>
      <ErrorNote error={daily.error || recent.error || failures.error} />

      <Panel title="Failed requests per day" sub={`Last ${DAYS} days`} id="errors-day">
        {daily.loading ? (
          <Loading what="failures" />
        ) : (
          <ChartFigure
            caption="Failed requests per day"
            summary={`${fmtNumber(errorSeries.reduce((a, b) => a + b.errors, 0))} failures in ${DAYS} days.`}
            rows={errorSeries}
            columns={[
              { key: "day", label: "Day", render: (r) => r.day },
              { key: "errors", label: "Failed", num: true, render: (r) => fmtNumber(r.errors) },
              { key: "rate", label: "Failure rate", num: true, render: (r) => fmtPercent(r.calls ? r.errors / r.calls : 0) },
            ]}
          >
            <ResponsiveContainer>
              <BarChart data={errorSeries} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="day" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} />
                <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.grid }} />
                <Bar dataKey="errors" name="Failed" fill={colors.series[4]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFigure>
        )}
      </Panel>

      <Panel title="Functions" sub="Requests, failures and response time per Cloud Function" id="functions">
        {recent.loading ? (
          <Loading what="functions" />
        ) : (
          <DataTable
            caption="Cloud Functions"
            rows={fnRows}
            columns={[
              { key: "fn", label: "Function", render: (r) => <span className="mono">{r.fn}</span> },
              { key: "feature", label: "Feature", render: (r) => r.feature },
              { key: "calls", label: "Requests", num: true, render: (r) => fmtNumber(r.calls) },
              { key: "failed", label: "Failure rate", num: true, render: (r) => fmtPercent(r.failed / r.calls) },
              { key: "avg", label: "Average", num: true, render: (r) => fmtMs(r.avg) },
              { key: "p95", label: "Slowest 5%", num: true, render: (r) => fmtMs(r.p95) },
            ]}
          />
        )}
      </Panel>

      <Panel title="Recent failures" sub="Newest first, last 50" id="failures">
        {failures.loading ? (
          <Loading what="failures" />
        ) : (
          <DataTable
            caption="Recent failures"
            rows={failures.data}
            empty="No failures recorded."
            columns={[
              { key: "at", label: "Time", render: (r) => fmtDateTime(r.at) },
              { key: "fn", label: "Function", render: (r) => <span className="mono">{r.fn}{r.action ? ` · ${r.action}` : ""}</span> },
              { key: "code", label: "Error", render: (r) => <span className="mono">{r.errCode ?? "unknown"}</span> },
              { key: "uid", label: "User", render: (r) => <Link to={`/users/${r.uid}`}>{nameOf(r.uid)}</Link> },
              { key: "ms", label: "Time taken", num: true, render: (r) => fmtMs(r.ms) },
            ]}
          />
        )}
      </Panel>
    </Page>
  );
}
