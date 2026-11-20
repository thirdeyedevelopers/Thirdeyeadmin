import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider, isConfigured } from "../firebase";
import Login from "./Login";

type Status = "checking" | "signed-out" | "admin";

interface Session {
  user: User;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext)!;

/** Only Google accounts whose email has a document in `admins/` get past this gate. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setStatus("signed-out");
        return;
      }
      setStatus("checking");
      try {
        const snap = await getDoc(doc(db, "admins", (u.email ?? "").toLowerCase()));
        if (!snap.exists()) throw new Error("not-admin");
        setUser(u);
        setError("");
        setStatus("admin");
      } catch {
        setError(`${u.email ?? "This account"} is not on the admin list. Ask the project owner to add it.`);
        await signOut(auth);
      }
    });
  }, []);

  if (!isConfigured) {
    return (
      <Login
        error="The Firebase web config is missing. Paste it into src/firebaseConfig.ts and reload."
        busy={false}
        onSignIn={() => {}}
        disabled
      />
    );
  }

  if (status === "checking") {
    return (
      <div className="login" role="status">
        <p>Checking your access…</p>
      </div>
    );
  }

  if (status !== "admin" || !user) {
    return (
      <Login
        error={error}
        busy={busy}
        onSignIn={async () => {
          setBusy(true);
          setError("");
          try {
            await signInWithPopup(auth, googleProvider);
          } catch (e) {
            const code = (e as { code?: string }).code ?? "";
            if (!code.includes("popup-closed") && !code.includes("cancelled-popup")) {
              setError(
                code.includes("unauthorized-domain")
                  ? "This website address is not allowed to sign in. Add it under Authentication → Settings → Authorized domains."
                  : "Sign in failed. Try again.",
              );
            }
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return <SessionContext.Provider value={{ user, signOut: () => signOut(auth) }}>{children}</SessionContext.Provider>;
}
