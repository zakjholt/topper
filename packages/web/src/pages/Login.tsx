import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signIn } from "../auth.ts";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: err } = await signIn.email({ email, password });
    setPending(false);
    if (err) {
      setError(err.message || "Could not sign in");
      return;
    }
    navigate("/");
  }

  return (
    <div className="auth-page">
      <form className="panel" onSubmit={onSubmit}>
        <p className="brand">Topper</p>
        <p className="lede">A small table. Persistent rooms. Sheets that stay extensible.</p>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <button className="btn primary" disabled={pending} type="submit">
            {pending ? "Entering…" : "Enter"}
          </button>
          <Link to="/signup">Create an account</Link>
        </div>
      </form>
    </div>
  );
}
