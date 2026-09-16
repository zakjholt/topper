import type { Context } from "hono";
import { auth } from "./auth.ts";

export async function getSession(c: Context) {
  return auth.api.getSession({ headers: c.req.raw.headers });
}

export async function requireUser(c: Context) {
  const session = await getSession(c);
  if (!session?.user) {
    return null;
  }
  return session.user;
}
