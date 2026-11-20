import { NavLink, Outlet } from "react-router-dom";
import { useSession } from "../auth/AuthGate";
import { ThemeChoice, useTheme } from "../theme";

const LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/live", label: "Live" },
  { to: "/users", label: "Users" },
  { to: "/features", label: "Features" },
  { to: "/health", label: "Health" },
  { to: "/admins", label: "Admins" },
];

export default function Layout() {
  const { user, signOut } = useSession();
  const { choice, setChoice } = useTheme();

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => {
        e.preventDefault();
        document.querySelector<HTMLElement>("#main h1")?.focus();
      }}>
        Skip to content
      </a>
      <div className="shell">
        <header className="sidebar">
          <div className="brand">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
            <span>Third Eye Admin</span>
          </div>
          <nav aria-label="Dashboard">
            <ul className="nav">
              {LINKS.map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} end={l.end}>
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sidebar-foot">
            <div className="field">
              <label htmlFor="theme">Appearance</label>
              <select id="theme" value={choice} onChange={(e) => setChoice(e.target.value as ThemeChoice)}>
                <option value="system">Match system</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <p className="who">Signed in as {user.email}</p>
            <button className="btn secondary" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
        <main id="main">
          <Outlet />
        </main>
      </div>
    </>
  );
}
