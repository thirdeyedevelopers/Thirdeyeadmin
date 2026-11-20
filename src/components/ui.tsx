import { ReactNode, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/** Page title, document title, and focus on the heading after every navigation. */
export function Page({ title, intro, actions, children }: { title: string; intro?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${title} · Third Eye Admin`;
    heading.current?.focus();
  }, [pathname, title]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {intro && <p>{intro}</p>}
        </div>
        {actions}
      </div>
      <div className="stack">{children}</div>
    </>
  );
}

export function Panel({ title, sub, children, id }: { title: string; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="panel" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
      {children}
    </section>
  );
}

export function Stats({ children, label }: { children: ReactNode; label: string }) {
  return (
    <dl className="grid stats" aria-label={label}>
      {children}
    </dl>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="panel stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <span className="note">{note}</span>}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="empty" role="status">
      Loading {what}…
    </p>
  );
}

export function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="message error" role="alert">
      {error}
    </p>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  num?: boolean;
  render: (row: T) => ReactNode;
}

/** A chart is hidden from screen readers; its numbers are always available as a real table. */
export function ChartFigure<T>({
  caption,
  summary,
  rows,
  columns,
  children,
  legend,
}: {
  caption: string;
  summary: string;
  rows: T[];
  columns: Column<T>[];
  children: ReactNode;
  legend?: { label: string; color: string }[];
}) {
  return (
    <figure>
      <figcaption className="sr-only">
        {caption}. {summary}
      </figcaption>
      <div className="chart" aria-hidden="true">
        {children}
      </div>
      {legend && (
        <ul className="legend" aria-hidden="true">
          {legend.map((l) => (
            <li key={l.label}>
              <span className="swatch" style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <details className="data">
        <summary>Show {caption.toLowerCase()} as a table</summary>
        <DataTable caption={caption} rows={rows} columns={columns} />
      </details>
    </figure>
  );
}

export function DataTable<T>({ caption, rows, columns, empty = "No data yet." }: { caption: string; rows: T[]; columns: Column<T>[]; empty?: string }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.num ? "num" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? "num" : undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ ok, code }: { ok: boolean; code?: string | null }) {
  return ok ? <span className="badge ok">Success</span> : <span className="badge fail">Failed{code ? `: ${code}` : ""}</span>;
}

export function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      {label && <strong>{label}</strong>}
      {payload.map((p) => (
        <div key={p.name}>
          {p.name}: {p.value.toLocaleString("en-IN")}
        </div>
      ))}
    </div>
  );
}
