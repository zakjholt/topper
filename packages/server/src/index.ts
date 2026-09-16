import "dotenv/config";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { api } from "./api.ts";
import { auth } from "./auth.ts";
import { registerWebSocket } from "./ws.ts";

const app = new Hono();
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:5173";

app.use(
  "*",
  cors({
    origin,
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/api", api);

const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "../../data/uploads");
const staticRoot = path.relative(process.cwd(), path.dirname(uploadDir)) || ".";
app.use("/uploads/*", serveStatic({ root: staticRoot }));

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
registerWebSocket(app, upgradeWebSocket);

app.get("/api/health", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 3000);
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`Topper server listening on http://localhost:${port}`);
});

injectWebSocket(server);
