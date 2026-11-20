import { useEffect, useRef } from "react";

interface Props {
  error?: string;
  busy: boolean;
  disabled?: boolean;
  onSignIn: () => void;
}

export default function Login({ error, busy, disabled, onSignIn }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = "Sign in · Third Eye Admin";
    heading.current?.focus();
  }, []);

  return (
    <main className="login">
      <div className="panel">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          <span>Third Eye Admin</span>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          Sign in
        </h1>
        <p className="muted">Use the Google account that is on the admin list.</p>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" onClick={onSignIn} disabled={busy || disabled}>
          {busy ? "Opening Google…" : "Sign in with Google"}
        </button>
      </div>
    </main>
  );
}
