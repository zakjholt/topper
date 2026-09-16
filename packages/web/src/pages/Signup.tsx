import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUp } from "../auth.ts";

export function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: err } = await signUp.email({ name, email, password });
    setPending(false);
    if (err) {
      setError(err.message || "Could not create account");
      return;
    }
    navigate("/");
  }

  return (
    <div className="auth-page">
      <form className="panel" onSubmit={onSubmit}>
        <p className="brand">Topper</p>
        <p className="lede">Pick a name the table will recognize.</p>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            type="text"
            autoComplete="nickname"
            required
          />
        </label>
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
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <button className="btn primary" disabled={pending} type="submit">
            {pending ? "Creating…" : "Create account"}
          </button>
          <Link to="/login">Already have a seat</Link>
        </div>
      </form>
    </div>
  );
}
