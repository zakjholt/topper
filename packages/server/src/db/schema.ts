import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const tables = pgTable("tables", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  inviteCode: text("invite_code").notNull().unique(),
  activeSceneId: text("active_scene_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tableMembers = pgTable(
  "table_members",
  {
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tableId, t.userId] })],
);

export const scenes = pgTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    imageUrl: text("image_url"),
    width: integer("width").notNull().default(2000),
    height: integer("height").notNull().default(1400),
    gridType: text("grid_type").notNull().default("square"),
    gridSize: integer("grid_size").notNull().default(70),
    snap: boolean("snap").notNull().default(true),
    offsetX: integer("offset_x").notNull().default(0),
    offsetY: integer("offset_y").notNull().default(0),
    fills: jsonb("fills").$type<Record<string, string>>().notNull().default({}),
    edges: jsonb("edges").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("scenes_table_id_idx").on(t.tableId)],
);

export const characters = pgTable("characters", {
  id: text("id").primaryKey(),
  tableId: text("table_id")
    .notNull()
    .references(() => tables.id, { onDelete: "cascade" }),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  schemaId: text("schema_id").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tokens = pgTable(
  "tokens",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    characterId: text("character_id").references(() => characters.id, { onDelete: "set null" }),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    size: integer("size").notNull().default(70),
    label: text("label").notNull().default(""),
    imageUrl: text("image_url"),
  },
  (t) => [index("tokens_scene_id_idx").on(t.sceneId)],
);

export const diceLog = pgTable("dice_log", {
  id: text("id").primaryKey(),
  tableId: text("table_id")
    .notNull()
    .references(() => tables.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  userName: text("user_name").notNull(),
  expression: text("expression").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
