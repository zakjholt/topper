import { and, desc, eq } from "drizzle-orm";
import type {
  CharacterState,
  DiceLogEntry,
  MapState,
  MemberRole,
  PresenceMember,
  TableInfo,
  TableSnapshot,
  TokenState,
} from "@topper/shared";
import { createEmptyDocument, getSheetSchema } from "@topper/shared";
import { db } from "./index.ts";
import {
  characters,
  diceLog,
  maps,
  tableMembers,
  tables,
  tokens,
  user,
} from "./schema.ts";

function newId(): string {
  return crypto.randomUUID();
}

function inviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function createTable(ownerId: string, name: string) {
  const id = newId();
  const code = inviteCode();
  await db.insert(tables).values({
    id,
    name: name.trim() || "Untitled table",
    ownerId,
    inviteCode: code,
  });
  await db.insert(tableMembers).values({
    tableId: id,
    userId: ownerId,
    role: "gm",
  });
  await db.insert(maps).values({ tableId: id });
  return getTableInfo(id, ownerId);
}

export async function joinTable(userId: string, code: string) {
  const normalized = code.trim().toUpperCase();
  const [table] = await db.select().from(tables).where(eq(tables.inviteCode, normalized)).limit(1);
  if (!table) throw new Error("No table found for that invite code");
  const existing = await db
    .select()
    .from(tableMembers)
    .where(and(eq(tableMembers.tableId, table.id), eq(tableMembers.userId, userId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(tableMembers).values({
      tableId: table.id,
      userId,
      role: table.ownerId === userId ? "gm" : "player",
    });
  }
  return getTableInfo(table.id, userId);
}

export async function listTablesForUser(userId: string): Promise<TableInfo[]> {
  const rows = await db
    .select({
      id: tables.id,
      name: tables.name,
      ownerId: tables.ownerId,
      inviteCode: tables.inviteCode,
      role: tableMembers.role,
    })
    .from(tableMembers)
    .innerJoin(tables, eq(tables.id, tableMembers.tableId))
    .where(eq(tableMembers.userId, userId));
  return rows.map((row) => ({
    ...row,
    role: row.role as MemberRole,
  }));
}

export async function getMembership(tableId: string, userId: string) {
  const [row] = await db
    .select()
    .from(tableMembers)
    .where(and(eq(tableMembers.tableId, tableId), eq(tableMembers.userId, userId)))
    .limit(1);
  return row ? { ...row, role: row.role as MemberRole } : null;
}

export async function getTableInfo(tableId: string, userId: string): Promise<TableInfo> {
  const [row] = await db
    .select({
      id: tables.id,
      name: tables.name,
      ownerId: tables.ownerId,
      inviteCode: tables.inviteCode,
      role: tableMembers.role,
    })
    .from(tables)
    .innerJoin(
      tableMembers,
      and(eq(tableMembers.tableId, tables.id), eq(tableMembers.userId, userId)),
    )
    .where(eq(tables.id, tableId))
    .limit(1);
  if (!row) throw new Error("Table not found");
  return { ...row, role: row.role as MemberRole };
}

function asCharacter(row: typeof characters.$inferSelect): CharacterState {
  return {
    id: row.id,
    tableId: row.tableId,
    ownerId: row.ownerId,
    schemaId: row.schemaId,
    schemaVersion: row.schemaVersion,
    data: (row.data ?? {}) as Record<string, unknown>,
  };
}

function asToken(row: typeof tokens.$inferSelect): TokenState {
  return {
    id: row.id,
    tableId: row.tableId,
    ownerId: row.ownerId,
    characterId: row.characterId,
    x: row.x,
    y: row.y,
    size: row.size,
    label: row.label,
    imageUrl: row.imageUrl,
  };
}

function asMap(row: typeof maps.$inferSelect): MapState {
  return {
    tableId: row.tableId,
    imageUrl: row.imageUrl,
    width: row.width,
    height: row.height,
    gridSize: row.gridSize,
    snap: row.snap,
    offsetX: row.offsetX,
    offsetY: row.offsetY,
  };
}

function asDice(row: typeof diceLog.$inferSelect): DiceLogEntry {
  return {
    id: row.id,
    tableId: row.tableId,
    userId: row.userId,
    userName: row.userName,
    expression: row.expression,
    result: row.result as DiceLogEntry["result"],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function loadSnapshot(tableId: string, userId: string): Promise<TableSnapshot> {
  const table = await getTableInfo(tableId, userId);
  const [mapRow] = await db.select().from(maps).where(eq(maps.tableId, tableId)).limit(1);
  if (!mapRow) throw new Error("Map missing for table");
  const characterRows = await db.select().from(characters).where(eq(characters.tableId, tableId));
  const tokenRows = await db.select().from(tokens).where(eq(tokens.tableId, tableId));
  const diceRows = await db
    .select()
    .from(diceLog)
    .where(eq(diceLog.tableId, tableId))
    .orderBy(desc(diceLog.createdAt))
    .limit(50);
  const memberRows = await db
    .select({
      userId: tableMembers.userId,
      role: tableMembers.role,
      name: user.name,
    })
    .from(tableMembers)
    .innerJoin(user, eq(user.id, tableMembers.userId))
    .where(eq(tableMembers.tableId, tableId));

  return {
    table,
    map: asMap(mapRow),
    characters: characterRows.map(asCharacter),
    tokens: tokenRows.map(asToken),
    diceLog: diceRows.map(asDice).reverse(),
    members: memberRows.map((m) => ({
      userId: m.userId,
      name: m.name,
      role: m.role as MemberRole,
    })),
  };
}

export async function patchCharacterData(
  characterId: string,
  data: Record<string, unknown>,
): Promise<CharacterState> {
  const [row] = await db
    .update(characters)
    .set({ data })
    .where(eq(characters.id, characterId))
    .returning();
  if (!row) throw new Error("Character not found");
  return asCharacter(row);
}

export async function getCharacter(characterId: string) {
  const [row] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
  return row ? asCharacter(row) : null;
}

export async function upsertCharacter(input: {
  id?: string;
  tableId: string;
  ownerId: string;
  schemaId: string;
  data?: Record<string, unknown>;
}): Promise<CharacterState> {
  const schema = getSheetSchema(input.schemaId);
  if (!schema) throw new Error(`Unknown sheet schema '${input.schemaId}'`);
  if (input.id) {
    const existing = await getCharacter(input.id);
    if (!existing || existing.tableId !== input.tableId) throw new Error("Character not found");
    const data = input.data ?? existing.data;
    return patchCharacterData(existing.id, data);
  }
  const id = newId();
  const data = input.data ?? createEmptyDocument(schema);
  const [row] = await db
    .insert(characters)
    .values({
      id,
      tableId: input.tableId,
      ownerId: input.ownerId,
      schemaId: schema.id,
      schemaVersion: schema.version,
      data,
    })
    .returning();
  if (!row) throw new Error("Failed to create character");
  return asCharacter(row);
}

export async function getToken(tokenId: string) {
  const [row] = await db.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1);
  return row ? asToken(row) : null;
}

export async function placeToken(input: {
  tableId: string;
  ownerId: string;
  x: number;
  y: number;
  label: string;
  characterId?: string | null;
  imageUrl?: string | null;
  size?: number;
}): Promise<TokenState> {
  const [map] = await db.select().from(maps).where(eq(maps.tableId, input.tableId)).limit(1);
  const size = input.size ?? map?.gridSize ?? 70;
  const [row] = await db
    .insert(tokens)
    .values({
      id: newId(),
      tableId: input.tableId,
      ownerId: input.ownerId,
      characterId: input.characterId ?? null,
      x: input.x,
      y: input.y,
      size,
      label: input.label,
      imageUrl: input.imageUrl ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to place token");
  return asToken(row);
}

export async function moveToken(tokenId: string, x: number, y: number): Promise<TokenState> {
  const [row] = await db.update(tokens).set({ x, y }).where(eq(tokens.id, tokenId)).returning();
  if (!row) throw new Error("Token not found");
  return asToken(row);
}

export async function updateToken(
  tokenId: string,
  patch: Partial<Pick<TokenState, "label" | "characterId" | "imageUrl" | "size">>,
): Promise<TokenState> {
  const [row] = await db.update(tokens).set(patch).where(eq(tokens.id, tokenId)).returning();
  if (!row) throw new Error("Token not found");
  return asToken(row);
}

export async function deleteToken(tokenId: string) {
  await db.delete(tokens).where(eq(tokens.id, tokenId));
}

export async function updateMap(
  tableId: string,
  patch: Partial<Omit<MapState, "tableId">>,
): Promise<MapState> {
  const [row] = await db.update(maps).set(patch).where(eq(maps.tableId, tableId)).returning();
  if (!row) throw new Error("Map not found");
  return asMap(row);
}

export async function insertDiceRoll(input: {
  tableId: string;
  userId: string;
  userName: string;
  expression: string;
  result: DiceLogEntry["result"];
}): Promise<DiceLogEntry> {
  const [row] = await db
    .insert(diceLog)
    .values({
      id: newId(),
      tableId: input.tableId,
      userId: input.userId,
      userName: input.userName,
      expression: input.expression,
      result: input.result,
    })
    .returning();
  if (!row) throw new Error("Failed to log dice");
  return asDice(row);
}

export async function listMembers(tableId: string): Promise<PresenceMember[]> {
  const memberRows = await db
    .select({
      userId: tableMembers.userId,
      role: tableMembers.role,
      name: user.name,
    })
    .from(tableMembers)
    .innerJoin(user, eq(user.id, tableMembers.userId))
    .where(eq(tableMembers.tableId, tableId));
  return memberRows.map((m) => ({
    userId: m.userId,
    name: m.name,
    role: m.role as MemberRole,
  }));
}
