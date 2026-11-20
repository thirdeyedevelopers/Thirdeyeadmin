import { useSession } from "../auth/AuthGate";
import { useAdmins } from "../data";
import { firebaseConfig } from "../firebaseConfig";
import { DataTable, ErrorNote, Loading, Page, Panel } from "../components/ui";

export default function Admins() {
  const admins = useAdmins();
  const { user } = useSession();
  const consoleUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/-default-/data/~2Fadmins`;

  return (
    <Page title="Admins" intro="Google accounts that can open this dashboard.">
      <ErrorNote error={admins.error} />
      <Panel title="Admin list" id="admin-list">
        {admins.loading ? (
          <Loading what="admins" />
        ) : (
          <DataTable
            caption="Admins"
            rows={admins.data}
            columns={[
              { key: "email", label: "Email", render: (r) => <>{r.id}{r.id === user.email?.toLowerCase() && <span className="muted"> (you)</span>}</> },
              { key: "role", label: "Role", render: (r) => r.role ?? "admin" },
            ]}
          />
        )}
      </Panel>
      <Panel title="Add or remove an admin" id="admin-how">
        <ol style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gap: "0.5rem" }}>
          <li>
            Open the <a href={consoleUrl} target="_blank" rel="noreferrer">admins collection in Firebase console (opens in a new tab)</a>.
          </li>
          <li>Add a document. Use the person's Google email in lowercase as the document ID, with a field <span className="mono">role</span> set to <span className="mono">admin</span>.</li>
          <li>To remove access, delete that document. The person is locked out on their next page load.</li>
        </ol>
        <p className="muted" style={{ marginTop: "0.75rem" }}>
          The dashboard cannot change this list itself. Only the Firebase console can, which keeps access changes in the owner's hands.
        </p>
      </Panel>
    </Page>
  );
}
