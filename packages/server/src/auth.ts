import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/index.ts";
import * as schema from "./db/schema.ts";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:5173",
  basePath: "/api/auth",
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:5173"],
  advanced: {
    defaultCookieAttributes: {
      sameSite: "lax",
      path: "/",
    },
  },
});
