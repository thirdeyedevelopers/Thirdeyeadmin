import { useState } from "react";
import { Link } from "react-router-dom";
import { AppUser, FEATURES, topFeature, useNow, useUsers } from "../data";
import { fmtDateTime, fmtNumber, relative, shortId } from "../format";
import { ErrorNote, Loading, Page, Panel } from "../components/ui";

type SortKey = "lastSeen" | "firstSeen" | "calls" | "errors";

const SORT_LABELS: Record<SortKey, string> = {
  lastSeen: "Last seen",
  firstSeen: "First seen",
  calls: "Requests",
  errors: "Failed",
};

const value = (u: AppUser, k: SortKey) =>
  k === "lastSeen" ? u.lastSeen?.getTime() ?? 0 : k === "firstSeen" ? u.firstSeen?.getTime() ?? 0 : u[k];

export default function Users() {
  const users = useUsers(2000);
  const now = useNow(30_000);
  const [search, setSearch] = useState("");
  const [feature, setFeature] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "lastSeen", desc: true });

  const term = search.trim().toLowerCase();
  const rows = users.data
    .filter((u) => !term || u.id.toLowerCase().includes(term))
    .filter((u) => !feature || (u.features[feature] ?? 0) > 0)
    .sort((a, b) => (value(a, sort.key) - value(b, sort.key)) * (sort.desc ? -1 : 1));

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
    <Page title="Users" intro="Every app install that has used an online feature. Users are anonymous; the ID is the Firebase user ID.">
      <ErrorNote error={users.error} />
      <Panel title={`${fmtNumber(rows.length)} of ${fmtNumber(users.data.length)} users`} id="users-list">
        <div className="toolbar">
          <div className="field">
            <label htmlFor="user-search">Search by user ID</label>
            <input id="user-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
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
          {users.loading ? "" : `${rows.length} users shown`}
        </p>

        {users.loading ? (
          <Loading what="users" />
        ) : rows.length === 0 ? (
          <p className="empty">{users.data.length ? "No users match this search." : "No users yet. They appear after their first online request."}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Users, sorted by {SORT_LABELS[sort.key].toLowerCase()}</caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  {header("lastSeen", false)}
                  {header("firstSeen", false)}
                  {header("calls")}
                  <th scope="col">Most used</th>
                  {header("errors")}
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <th scope="row">
                      <Link to={`/users/${u.id}`} className="mono">
                        User {shortId(u.id)}
                      </Link>
                    </th>
                    <td title={fmtDateTime(u.lastSeen)}>{relative(u.lastSeen, now)}</td>
                    <td>{fmtDateTime(u.firstSeen)}</td>
                    <td className="num">{fmtNumber(u.calls)}</td>
                    <td>{topFeature(u.features)}</td>
                    <td className="num">{fmtNumber(u.errors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Page>
  );
}
