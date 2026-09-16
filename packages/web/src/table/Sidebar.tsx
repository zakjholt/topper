import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getByPath } from "@topper/shared";
import { useSession } from "../auth.ts";
import { useTable } from "../table/TableProvider.tsx";

export function Sidebar() {
  const { snapshot, send, connected, error, setOpenCharacterId, selectedTokenId, setSelectedTokenId } =
    useTable();
  const { data } = useSession();
  const [expression, setExpression] = useState("d20");

  if (!snapshot) {
    return (
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Table</h1>
          <p className="invite">{connected ? "Loading…" : "Connecting…"}</p>
        </div>
      </aside>
    );
  }

  const userId = data?.user.id;
  const selected = snapshot.tokens.find((t) => t.id === selectedTokenId);

  function roll(e: FormEvent) {
    e.preventDefault();
    send({ type: "roll_dice", expression });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>{snapshot.table.name}</h1>
        <p className="invite">
          <span className={`status-dot ${connected ? "" : "off"}`} />
          Invite {snapshot.table.inviteCode} · {snapshot.table.role === "gm" ? "GM" : "Player"}
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <Link className="btn small ghost" to="/">
            Lobby
          </Link>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </div>
      <div className="sidebar-scroll">
        <section className="section">
          <h2>People</h2>
          {snapshot.members.map((member) => (
            <div className="member" key={member.userId}>
              <span>{member.name}</span>
              <span className="role-pill">{member.role}</span>
            </div>
          ))}
        </section>

        <section className="section">
          <h2>Characters</h2>
          {snapshot.characters.map((ch) => (
            <div className="char-row" key={ch.id}>
              <button className="link" type="button" onClick={() => setOpenCharacterId(ch.id)}>
                {String(getByPath(ch.data, "name") || "Unnamed")}
              </button>
              <span className="muted">{ch.ownerId === userId ? "you" : ""}</span>
            </div>
          ))}
          <button
            className="btn small"
            type="button"
            onClick={() => send({ type: "upsert_character", schemaId: "generic" })}
          >
            New character
          </button>
        </section>

        {selected ? (
          <section className="section">
            <h2>Selected token</h2>
            <label>
              Label
              <input
                value={selected.label}
                onChange={(e) =>
                  send({ type: "update_token", tokenId: selected.id, patch: { label: e.target.value } })
                }
              />
            </label>
            <label>
              Linked sheet
              <select
                value={selected.characterId ?? ""}
                onChange={(e) =>
                  send({
                    type: "update_token",
                    tokenId: selected.id,
                    patch: { characterId: e.target.value || null },
                  })
                }
              >
                <option value="">None</option>
                {snapshot.characters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {String(getByPath(ch.data, "name") || "Unnamed")}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn small danger"
              type="button"
              onClick={() => {
                send({ type: "delete_token", tokenId: selected.id });
                setSelectedTokenId(null);
              }}
            >
              Remove token
            </button>
          </section>
        ) : null}

        <section className="section">
          <h2>Dice</h2>
          <form className="dice-form" onSubmit={roll}>
            <input value={expression} onChange={(e) => setExpression(e.target.value)} />
            <button className="btn primary small" type="submit">
              Roll
            </button>
          </form>
          <div>
            {[...snapshot.diceLog].reverse().map((entry) => (
              <div className="log-row" key={entry.id}>
                <span>
                  <strong>{entry.userName}</strong> {entry.expression}
                  <div className="muted">
                    {entry.result.dice.join(", ")}
                    {entry.result.modifier ? ` ${entry.result.modifier > 0 ? "+" : ""}${entry.result.modifier}` : ""}
                  </div>
                </span>
                <span className="total">{entry.result.total}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
