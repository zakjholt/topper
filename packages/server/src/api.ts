import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { requireUser } from "./session.ts";
import { createTable, joinTable, listTablesForUser } from "./db/tables.ts";

const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? "../../data/uploads");

export const api = new Hono();

api.get("/me", async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ user });
});

api.get("/tables", async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const tables = await listTablesForUser(user.id);
  return c.json({ tables });
});

api.post("/tables", async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "Untitled table";
  const table = await createTable(user.id, name);
  return c.json({ table });
});

api.post("/tables/join", async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode : "";
  try {
    const table = await joinTable(user.id, inviteCode);
    return c.json({ table });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Join failed" }, 400);
  }
});

api.post("/upload", async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    return c.json({ error: "file is required" }, 400);
  }
  if (file.size > 8 * 1024 * 1024) {
    return c.json({ error: "File too large (max 8MB)" }, 400);
  }
  const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!allowed.has(file.type)) {
    return c.json({ error: "Only png, jpeg, webp, and gif images are allowed" }, 400);
  }
  const ext =
    file.type === "image/png"
      ? ".png"
      : file.type === "image/webp"
        ? ".webp"
        : file.type === "image/gif"
          ? ".gif"
          : ".jpg";
  await mkdir(uploadRoot, { recursive: true });
  const filename = `${crypto.randomUUID()}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadRoot, filename), buf);
  return c.json({ url: `/uploads/${filename}` });
});
