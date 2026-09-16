import WebSocket from "ws";

const origin = "http://localhost:5173";
const api = origin;

function cookieHeader(setCookie: string[]) {
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function json(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("origin", origin);
  if (init.cookie) headers.set("cookie", init.cookie);
  const res = await fetch(`${api}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  }
  return { body, cookie: cookieHeader(res.headers.getSetCookie()) };
}

async function signup(name: string, email: string) {
  try {
    const result = await json("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ name, email, password: "password123" }),
    });
    return result.cookie;
  } catch {
    const result = await json("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: "password123" }),
    });
    return result.cookie;
  }
}

function connect(cookie: string, tableId: string): Promise<{
  ws: WebSocket;
  events: Record<string, unknown>[];
  waitFor: (type: string, after?: number, timeout?: number) => Promise<Record<string, unknown>>;
}> {
  return new Promise((resolve, reject) => {
    const events: Record<string, unknown>[] = [];
    const ws = new WebSocket(`ws://localhost:5173/ws?tableId=${tableId}`, {
      headers: { Cookie: cookie, Origin: origin },
    });
    const waitFor = (type: string, after = 0, timeout = 4000) =>
      new Promise<Record<string, unknown>>((res, rej) => {
        const start = Date.now();
        const tick = () => {
          const found = events.slice(after).find((e) => e.type === type);
          if (found) {
            res(found);
            return;
          }
          if (Date.now() - start > timeout) {
            rej(new Error(`Timed out waiting for ${type}`));
            return;
          }
          setTimeout(tick, 50);
        };
        tick();
      });
    ws.on("message", (data) => {
      events.push(JSON.parse(String(data)) as Record<string, unknown>);
    });
    ws.on("error", reject);
    ws.on("open", () => resolve({ ws, events, waitFor }));
  });
}

const gmCookie = await signup("GM Gale", `gm+${Date.now()}@example.com`);
const playerCookie = await signup("Player Priya", `player+${Date.now()}@example.com`);

const created = await json("/api/tables", {
  method: "POST",
  cookie: gmCookie,
  body: JSON.stringify({ name: "The Bronze Bell" }),
});
const table = created.body.table as { id: string; inviteCode: string };
await json("/api/tables/join", {
  method: "POST",
  cookie: playerCookie,
  body: JSON.stringify({ inviteCode: table.inviteCode }),
});

const gm = await connect(gmCookie, table.id);
const player = await connect(playerCookie, table.id);
await gm.waitFor("table_snapshot");
await player.waitFor("table_snapshot");

let mark = gm.events.length;
gm.ws.send(JSON.stringify({ type: "upsert_character", schemaId: "generic" }));
const createdChar = await gm.waitFor("character_upserted", mark);
const character = createdChar.character as { id: string };

mark = player.events.length;
gm.ws.send(
  JSON.stringify({
    type: "patch_character",
    characterId: character.id,
    path: "name",
    value: "Branwen",
  }),
);
await player.waitFor("character_patched", mark);

mark = gm.events.length;
player.ws.send(
  JSON.stringify({
    type: "place_token",
    x: 140,
    y: 210,
    label: "Branwen",
    characterId: character.id,
  }),
);
const placed = await gm.waitFor("token_placed", mark);
const token = placed.token as { id: string };

mark = gm.events.length;
player.ws.send(JSON.stringify({ type: "move_token", tokenId: token.id, x: 280, y: 350, persist: true }));
await gm.waitFor("token_moved", mark);

mark = player.events.length;
gm.ws.send(
  JSON.stringify({
    type: "patch_character",
    characterId: character.id,
    path: "hp",
    value: { current: 4, max: 10 },
  }),
);
await player.waitFor("character_patched", mark);

mark = gm.events.length;
player.ws.send(JSON.stringify({ type: "roll_dice", expression: "d20+4" }));
await gm.waitFor("dice_rolled", mark);

mark = gm.events.length;
player.ws.send(JSON.stringify({ type: "upsert_character", schemaId: "generic" }));
const playerChar = (await gm.waitFor("character_upserted", mark)).character as { id: string };

mark = gm.events.length;
player.ws.send(
  JSON.stringify({
    type: "patch_character",
    characterId: playerChar.id,
    path: "hp",
    value: { current: 7, max: 12 },
  }),
);
await gm.waitFor("character_patched", mark);

gm.ws.close();
const gmAgain = await connect(gmCookie, table.id);
const snap = (await gmAgain.waitFor("table_snapshot")).snapshot as {
  characters: { id: string; data: { name?: string; hp?: { current: number } } }[];
  tokens: { x: number }[];
  diceLog: unknown[];
};

const branwen = snap.characters.find((ch) => ch.data.name === "Branwen");
const priyaSheet = snap.characters.find((ch) => ch.id === playerChar.id);
if (!branwen) throw new Error("Character name not persisted");
if (branwen.data.hp?.current !== 4) throw new Error("GM HP patch not persisted");
if (priyaSheet?.data.hp?.current !== 7) throw new Error("Player HP patch not persisted");
if (!snap.tokens.some((t) => t.x === 280)) throw new Error("Token position not persisted");
if (snap.diceLog.length < 1) throw new Error("Dice log not persisted");

gmAgain.ws.close();
player.ws.close();
console.log("e2e ok", table.inviteCode);
