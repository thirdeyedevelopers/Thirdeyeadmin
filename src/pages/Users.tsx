import { useState } from "react";
import { Link } from "react-router-dom";
import { Account, displayName, FEATURES, providerLabel, topFeature, useAccounts, useNow } from "../data";
import { fmtDateTime, fmtNumber, relative } from "../format";
import { ErrorNote, Loading, Page, Panel, Stat, Stats } from "../components/ui";

type SortKey = "lastActive" | "created" | "calls" | "errors";

const SORT_LABELS: Record<SortKey, string> = {
  lastActive: "Last active",
  created: "Joined",
  calls: "Requests",
  errors: "Failed",
};

/** Most recent of: last feature use, last sign-in, last time the app refreshed its login. */
const lastActive = (u: Account) =>
  Math.max(u.lastSeen?.getTime() ?? 0, u.lastSignIn?.getTime() ?? 0, u.lastActive?.getTime() ?? 0);

const value = (u: Account, k: SortKey) =>
  k === "lastActive" ? lastActive(u) : k === "created" ? u.created?.getTime() ?? u.firstSeen?.getTime() ?? 0 : u[k];

export default function Users() {
  const accounts = useAccounts();
  const now = useNow(30_000);
  const [search, setSearch] = useState("");
  const [feature, setFeature] = useState("");
  const [signIn, setSignIn] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "lastActive", desc: true });

  const all = accounts.data;
  const term = search.trim().toLowerCase();
  const rows = all
    .filter((u) => !term || [u.id, u.name, u.email].some((v) => v?.toLowerCase().includes(term)))
    .filter((u) => !feature || (u.features[feature] ?? 0) > 0)
    .filter((u) => !signIn || u.provider === signIn)
    .sort((a, b) => (value(a, sort.key) - value(b, sort.key)) * (sort.desc ? -1 : 1));

  const day = 86_400_000;
  const active7 = all.filter((u) => now - lastActive(u) < 7 * day).length;
  const new7 = all.filter((u) => u.created && now - u.created.getTime() < 7 * day).length;
  const usedFeature = all.filter((u) => u.calls > 0).length;

  const header = (key: SortKey, num = true) => {
    const active = sort.key === key;
    return (
      <th scope="col" className={num ? "num" : undefined} aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
        <button onClick={() => setSort({ key, desc: active ? !sort.desc : true })}>
          {SORT_LABELS[key]}
          <span aria-hidden="true">{active ? (sort.desc ? "↓" : "↑") : ""}</span>
        </button>
      </th>
    );
  };

  return (
    <Page
      title="Users"
      intro="Every Third Eye account, from Firebase sign-in, with how much each person uses the app."
      actions={
        <button className="btn secondary" onClick={accounts.refresh} disabled={accounts.loading}>
          {accounts.loading ? "Loading…" : "Refresh"}
        </button>
      }
    >
      <ErrorNote error={accounts.error} />
      <Stats label="Account numbers">
        <Stat label="Accounts" value={fmtNumber(all.filter((u) => u.inAuth).length)} />
        <Stat label="Active in 7 days" value={fmtNumber(active7)} />
        <Stat label="Joined in 7 days" value={fmtNumber(new7)} />
        <Stat label="Used a feature" value={fmtNumber(usedFeature)} note="Since usage recording started" />
      </Stats>

      <Panel title={`${fmtNumber(rows.length)} of ${fmtNumber(all.length)} users`} id="users-list">
        <div className="toolbar">
          <div className="field">
            <label htmlFor="user-search">Search by name, email or ID</label>
            <input id="user-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="user-signin">Sign-in type</label>
            <select id="user-signin" value={signIn} onChange={(e) => setSignIn(e.target.value)}>
              <option value="">All</option>
              <option value="google.com">Google</option>
              <option value="password">Email</option>
              <option value="anonymous">Guest</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="user-feature">Used feature</label>
            <select id="user-feature" value={feature} onChange={(e) => setFeature(e.target.value)}>
              <option value="">Any feature</option>
              {FEATURES.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="sr-only" role="status">
          {accounts.loading ? "" : `${rows.length} users shown`}
        </p>

        {accounts.loading && all.length === 0 ? (
          <Loading what="users" />
        ) : rows.length === 0 ? (
          <p className="empty">{all.length ? "No users match these filters." : "No accounts yet."}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Users, sorted by {SORT_LABELS[sort.key].toLowerCase()}</caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Sign-in</th>
                  {header("lastActive", false)}
                  {header("created", false)}
                  {header("calls")}
                  <th scope="col">Most used</th>
                  {header("errors")}
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const last = lastActive(u);
                  return (
                    <tr key={u.id}>
                      <th scope="row">
                        <Link to={`/users/${u.id}`}>{displayName(u, u.id)}</Link>
                        {u.name && u.email && <div className="muted" style={{ fontWeight: 400, fontSize: "0.875rem" }}>{u.email}</div>}
                        {!u.inAuth && <div className="muted" style={{ fontWeight: 400, fontSize: "0.875rem" }}>Account deleted</div>}
                        {u.disabled && <span className="badge fail">Disabled</span>}
                      </th>
                      <td>{providerLabel(u.provider)}</td>
                      <td title={last ? fmtDateTime(new Date(last)) : undefined}>{last ? relative(new Date(last), now) : "Never"}</td>
                      <td>{fmtDateTime(u.created ?? u.firstSeen)}</td>
                      <td className="num">{fmtNumber(u.calls)}</td>
                      <td>{u.calls ? topFeature(u.features) : "None yet"}</td>
                      <td className="num">{fmtNumber(u.errors)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Page>
  );
}
