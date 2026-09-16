import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TableInfo } from "@topper/shared";
import { api } from "../api.ts";
import { signOut, useSession } from "../auth.ts";

export function HomePage() {
  const { data } = useSession();
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [name, setName] = useState("Friday night");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const result = await api<{ tables: TableInfo[] }>("/api/tables");
    setTables(result.tables);
  }

  useEffect(() => {
    void refresh().catch((err: Error) => setError(err.message));
  }, []);

  async function createTable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await api<{ table: TableInfo }>("/api/tables", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      navigate(`/t/${result.table.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create table");
    }
  }

  async function joinTable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await api<{ table: TableInfo }>("/api/tables/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode }),
      });
      navigate(`/t/${result.table.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join table");
    }
  }

  return (
    <div className="lobby-page">
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <p className="brand">Topper</p>
            <p className="lede">Welcome, {data?.user.name}.</p>
          </div>
          <button className="btn ghost" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>

        <h2>Your tables</h2>
        <div className="table-list">
          {tables.length === 0 ? <p className="muted">No tables yet.</p> : null}
          {tables.map((table) => (
            <Link className="table-card" key={table.id} to={`/t/${table.id}`}>
              <span>
                <strong>{table.name}</strong>
                <div className="muted">
                  {table.role === "gm" ? "GM" : "Player"} · code {table.inviteCode}
                </div>
              </span>
              <span className="muted">Open →</span>
            </Link>
          ))}
        </div>

        <div className="row" style={{ alignItems: "start" }}>
          <form onSubmit={createTable} style={{ flex: 1 }}>
            <label>
              New table
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                type="text"
                autoComplete="off"
              />
            </label>
            <button className="btn primary" type="submit">
              Host
            </button>
          </form>
          <form onSubmit={joinTable} style={{ flex: 1 }}>
            <label>
              Invite code
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                type="text"
                autoComplete="off"
                placeholder="ABCD2345"
              />
            </label>
            <button className="btn" type="submit">
              Join
            </button>
          </form>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
