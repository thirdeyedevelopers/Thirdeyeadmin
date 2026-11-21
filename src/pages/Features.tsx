import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { COMING_SOON, displayName, FEATURE_FUNCTIONS, FEATURES, sumDaily, useAccounts, useDaily, useRecentUsage } from "../data";
import { dayKeyLabel, fmtMs, fmtNumber, fmtPercent, lastDayKeys } from "../format";
import { useTheme } from "../theme";
import { ChartFigure, ChartTooltip, ErrorNote, Loading, Page, Panel } from "../components/ui";

const DAYS = 30;
const SAMPLE = 1000;

export default function Features() {
  const keys = useMemo(() => lastDayKeys(DAYS), []);
  const daily = useDaily(keys[0]);
  const users = useAccounts();
  const recent = useRecentUsage(SAMPLE);
  const { colors } = useTheme();

  const totals = sumDaily(daily.data);
  const byDay = new Map(daily.data.map((d) => [d.id, d]));
  const series = keys.map((k) => {
    const row: Record<string, string | number> = { day: dayKeyLabel(k) };
    for (const f of FEATURES) row[f] = byDay.get(k)?.f[f] ?? 0;
    return row;
  });

  const stats = FEATURES.map((f, i) => {
    const sample = recent.data.filter((u) => u.feature === f);
    const failed = sample.filter((u) => !u.ok).length;
    return {
      feature: f,
      color: colors.series[i],
      calls: totals.f[f] ?? 0,
      users: users.data.filter((u) => (u.features[f] ?? 0) > 0).length,
      top: users.data
        .filter((u) => (u.features[f] ?? 0) > 0)
        .sort((a, b) => (b.features[f] ?? 0) - (a.features[f] ?? 0))
        .slice(0, 3),
      successRate: sample.length ? 1 - failed / sample.length : null,
      avgMs: sample.length ? sample.reduce((a, b) => a + b.ms, 0) / sample.length : null,
      soon: COMING_SOON.has(f),
    };
  });

  return (
    <Page title="Features" intro={`Online features over the last ${DAYS} days. Success rate and speed use the latest ${fmtNumber(SAMPLE)} requests.`}>
      <ErrorNote error={daily.error || users.error || recent.error} />
      {daily.loading ? (
        <Loading what="features" />
      ) : (
        <>
          <ul className="grid cards" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {stats.map((s) => (
              <li key={s.feature} className="panel" style={{ borderTop: `4px solid ${s.color}` }}>
                <h2>
                  {s.feature}
                  {s.soon && (
                    <>
                      {" "}
                      <span className="badge muted">Coming soon</span>
                    </>
                  )}
                </h2>
                <p className="sub mono">{FEATURE_FUNCTIONS[s.feature].join(", ")}</p>
                <dl className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div className="stat">
                    <dt>Requests</dt>
                    <dd style={{ fontSize: "1.5rem" }}>{fmtNumber(s.calls)}</dd>
                  </div>
                  <div className="stat">
                    <dt>Users</dt>
                    <dd style={{ fontSize: "1.5rem" }}>{fmtNumber(s.users)}</dd>
                  </div>
                  <div className="stat">
                    <dt>Success rate</dt>
                    <dd style={{ fontSize: "1.5rem" }}>{s.successRate === null ? "No data" : fmtPercent(s.successRate)}</dd>
                  </div>
                  <div className="stat">
                    <dt>Average speed</dt>
                    <dd style={{ fontSize: "1.5rem" }}>{s.avgMs === null ? "No data" : fmtMs(s.avgMs)}</dd>
                  </div>
                </dl>
                <h3 style={{ marginTop: "1rem", fontSize: "0.95rem" }}>Top users</h3>
                {s.top.length === 0 ? (
                  <p className="muted" style={{ fontSize: "0.95rem" }}>Nobody yet.</p>
                ) : (
                  <ol style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
                    {s.top.map((u) => (
                      <li key={u.id}>
                        <Link to={`/users/${u.id}`}>{displayName(u, u.id)}</Link>
                        <span className="muted">, {fmtNumber(u.features[s.feature] ?? 0)} requests</span>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
            <li className="panel">
              <h2>Cash Reader</h2>
              <p className="sub">Runs fully on the phone with no server call, so its use is not recorded.</p>
            </li>
            <li className="panel">
              <h2>
                Document Reader <span className="badge muted">Coming soon</span>
              </h2>
              <p className="sub">Not released in the app yet.</p>
            </li>
          </ul>

          <Panel title="Requests per feature" sub={`Daily, last ${DAYS} days`} id="feature-trend">
            <ChartFigure
              caption="Requests per feature per day"
              summary={stats.map((s) => `${s.feature} ${fmtNumber(s.calls)}`).join(", ")}
              rows={series}
              columns={[
                { key: "day", label: "Day", render: (r) => r.day },
                ...FEATURES.map((f) => ({ key: f, label: f, num: true, render: (r: Record<string, string | number>) => fmtNumber(Number(r[f])) })),
              ]}
              legend={stats.map((s) => ({ label: s.feature, color: s.color }))}
            >
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="day" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} minTickGap={24} />
                  <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  {FEATURES.map((f, i) => (
                    <Line
                      key={f}
                      type="monotone"
                      dataKey={f}
                      name={f}
                      stroke={colors.series[i]}
                      strokeWidth={2.5}
                      strokeDasharray={["", "6 4", "2 3", "10 3 2 3", "8 2", "1 4"][i]}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartFigure>
          </Panel>
        </>
      )}
    </Page>
  );
}
