import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FEATURES, liveUsers, sumDaily, useDaily, useNow, useRecentUsage, useSummary, useUsers } from "../data";
import { dayKeyLabel, fmtMs, fmtNumber, fmtPercent, istDayKey, lastDayKeys } from "../format";
import { useTheme } from "../theme";
import { ChartFigure, ChartTooltip, ErrorNote, Loading, Page, Panel, Stat, Stats } from "../components/ui";

const DAYS = 30;

export default function Overview() {
  const keys = useMemo(() => lastDayKeys(DAYS), []);
  const daily = useDaily(keys[0]);
  const users = useUsers();
  const recent = useRecentUsage(200);
  const summary = useSummary();
  const now = useNow();
  const { colors } = useTheme();

  const byDay = new Map(daily.data.map((d) => [d.id, d]));
  const series = keys.map((k) => ({
    day: dayKeyLabel(k),
    calls: byDay.get(k)?.calls ?? 0,
    users: byDay.get(k)?.activeUsers ?? 0,
    errors: byDay.get(k)?.errors ?? 0,
  }));
  const today = byDay.get(istDayKey(new Date()));
  const totals = sumDaily(daily.data);
  const live = liveUsers(recent.data, now).length;
  const newToday = users.data.filter((u) => u.firstSeen && istDayKey(u.firstSeen) === istDayKey(new Date())).length;

  const share = FEATURES.map((f, i) => ({ name: f, value: totals.f[f] ?? 0, color: colors.series[i] })).filter((x) => x.value > 0);
  const shareTotal = share.reduce((a, b) => a + b.value, 0);
  const hours = Array.from({ length: 24 }, (_, h) => {
    const key = String(h).padStart(2, "0");
    return { hour: `${key}:00`, calls: totals.h[key] ?? 0 };
  });
  const peak = hours.reduce((a, b) => (b.calls > a.calls ? b : a), hours[0]);

  return (
    <Page title="Overview" intro="Usage of Third Eye online features, in India time. Updates live.">
      <ErrorNote error={daily.error || users.error} />
      <Stats label="Key numbers">
        <Stat
          label="Total users"
          value={summary.data ? fmtNumber(summary.data.totalUsers) : fmtNumber(users.data.length)}
          note={
            summary.data
              ? `${fmtNumber(summary.data.googleUsers ?? 0)} Google, ${fmtNumber(summary.data.emailUsers ?? 0)} email, ${fmtNumber(summary.data.anonymousUsers)} old guest`
              : "Users who used an online feature"
          }
        />
        <Stat label="Active today" value={fmtNumber(today?.activeUsers ?? 0)} note={`${fmtNumber(newToday)} new today`} />
        <Stat
          label="Live now"
          value={
            <>
              {live > 0 && <span className="live-dot" aria-hidden="true" />}
              {fmtNumber(live)}
            </>
          }
          note={<Link to="/live">In the last 5 minutes</Link>}
        />
        <Stat label="Requests today" value={fmtNumber(today?.calls ?? 0)} note={`${fmtNumber(totals.calls)} in ${DAYS} days`} />
        <Stat
          label="Failure rate"
          value={fmtPercent(totals.calls ? totals.errors / totals.calls : 0)}
          note={`${fmtNumber(totals.errors)} failed in ${DAYS} days`}
        />
        <Stat label="Average response" value={fmtMs(totals.calls ? totals.msTotal / totals.calls : 0)} note={`Over ${DAYS} days`} />
      </Stats>

      {daily.loading ? (
        <Loading what="usage history" />
      ) : (
        <>
          <Panel title="Requests and active users" sub={`Last ${DAYS} days`} id="trend">
            <ChartFigure
              caption="Requests and active users per day"
              summary={`${fmtNumber(totals.calls)} requests in ${DAYS} days.`}
              rows={series}
              columns={[
                { key: "day", label: "Day", render: (r) => r.day },
                { key: "calls", label: "Requests", num: true, render: (r) => fmtNumber(r.calls) },
                { key: "users", label: "Active users", num: true, render: (r) => fmtNumber(r.users) },
                { key: "errors", label: "Failed", num: true, render: (r) => fmtNumber(r.errors) },
              ]}
              legend={[
                { label: "Requests", color: colors.series[0] },
                { label: "Active users", color: colors.series[1] },
              ]}
            >
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="day" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="calls" name="Requests" stroke={colors.series[0]} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="users" name="Active users" stroke={colors.series[1]} strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFigure>
          </Panel>

          <div className="grid two">
            <Panel title="Feature share" sub={`Requests by feature, last ${DAYS} days`} id="share">
              <ChartFigure
                caption="Feature share"
                summary={share.map((s) => `${s.name} ${fmtPercent(s.value / shareTotal)}`).join(", ") || "No requests yet."}
                rows={share}
                columns={[
                  { key: "name", label: "Feature", render: (r) => r.name },
                  { key: "value", label: "Requests", num: true, render: (r) => fmtNumber(r.value) },
                  { key: "pct", label: "Share", num: true, render: (r) => fmtPercent(r.value / shareTotal) },
                ]}
                legend={share.map((s) => ({ label: `${s.name} ${fmtPercent(s.value / shareTotal)}`, color: s.color }))}
              >
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={share} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
                      {share.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartFigure>
              <p className="muted" style={{ marginTop: "0.75rem" }}>
                Cash Reader works offline, so its use is not counted.
              </p>
            </Panel>

            <Panel title="Busiest hours" sub={peak.calls ? `Peak at ${peak.hour} India time` : "No requests yet"} id="hours">
              <ChartFigure
                caption="Requests by hour of day"
                summary={peak.calls ? `Busiest hour is ${peak.hour} with ${fmtNumber(peak.calls)} requests.` : "No requests yet."}
                rows={hours}
                columns={[
                  { key: "hour", label: "Hour", render: (r) => r.hour },
                  { key: "calls", label: "Requests", num: true, render: (r) => fmtNumber(r.calls) },
                ]}
              >
                <ResponsiveContainer>
                  <BarChart data={hours} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke={colors.grid} vertical={false} />
                    <XAxis dataKey="hour" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} interval={3} />
                    <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.grid }} />
                    <Bar dataKey="calls" name="Requests" fill={colors.series[0]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFigure>
            </Panel>
          </div>
        </>
      )}
    </Page>
  );
}
