import { and, asc, desc, eq } from "drizzle-orm";
import type {
  CellPatch,
  CharacterState,
  DiceLogEntry,
  EdgePatch,
  MapState,
  MemberRole,
  PresenceMember,
  SceneInfo,
  TableInfo,
  TableSnapshot,
  TokenState,
} from "@topper/shared";
import { asColorMap, mergeEdges, mergeFills } from "@topper/shared";
import { createEmptyDocument, getSheetSchema } from "@topper/shared";
import { db } from "./index.ts";
import {
  characters,
  diceLog,
  scenes,
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
  const sceneId = newId();
  await db.insert(scenes).values({
    id: sceneId,
    tableId: id,
    name: "Scene 1",
    sortOrder: 0,
  });
  await db.update(tables).set({ activeSceneId: sceneId }).where(eq(tables.id, id));
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
    sceneId: row.sceneId,
    ownerId: row.ownerId,
    characterId: row.characterId,
    x: row.x,
    y: row.y,
    size: row.size,
    label: row.label,
    imageUrl: row.imageUrl,
  };
}

function asMap(row: typeof scenes.$inferSelect): MapState {
  return {
    tableId: row.tableId,
    sceneId: row.id,
    imageUrl: row.imageUrl,
    width: row.width,
    height: row.height,
    gridSize: row.gridSize,
    snap: row.snap,
    offsetX: row.offsetX,
    offsetY: row.offsetY,
    fills: asColorMap(row.fills),
    edges: asColorMap(row.edges),
  };
}

function asScene(row: typeof scenes.$inferSelect): SceneInfo {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
  };
}

async function listSceneRows(tableId: string) {
  return db.select().from(scenes).where(eq(scenes.tableId, tableId)).orderBy(asc(scenes.sortOrder), asc(scenes.name));
}

async function listTokensForScene(sceneId: string) {
  const rows = await db.select().from(tokens).where(eq(tokens.sceneId, sceneId));
  return rows.map(asToken);
}

export async function listScenes(tableId: string): Promise<SceneInfo[]> {
  return (await listSceneRows(tableId)).map(asScene);
}

async function ensureScenes(tableId: string) {
  const existing = await listSceneRows(tableId);
  if (existing.length > 0) return existing;
  const id = newId();
  const [row] = await db
    .insert(scenes)
    .values({ id, tableId, name: "Scene 1", sortOrder: 0 })
    .returning();
  if (!row) throw new Error("Failed to create scene");
  await db.update(tables).set({ activeSceneId: id }).where(eq(tables.id, tableId));
  return [row];
}

export async function getActiveScene(tableId: string) {
  const rows = await ensureScenes(tableId);
  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1);
  const active = rows.find((row) => row.id === table?.activeSceneId) ?? rows[0];
  if (!active) throw new Error("No scenes");
  if (table && table.activeSceneId !== active.id) {
    await db.update(tables).set({ activeSceneId: active.id }).where(eq(tables.id, tableId));
  }
  return active;
}

export async function getScene(sceneId: string) {
  const [row] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  return row ?? null;
}

function nextSceneName(existing: string[]) {
  const used = new Set(existing);
  for (let i = 1; i < 1000; i += 1) {
    const name = `Scene ${i}`;
    if (!used.has(name)) return name;
  }
  return "Scene";
}

function copyName(name: string, existing: string[]) {
  const used = new Set(existing);
  const base = `${name} copy`;
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const next = `${name} copy ${i}`;
    if (!used.has(next)) return next;
  }
  return base;
}

export async function createScene(
  tableId: string,
  input: { name?: string; duplicate?: boolean } = {},
) {
  const current = await getActiveScene(tableId);
  const rows = await listSceneRows(tableId);
  const names = rows.map((row) => row.name);
  const sortOrder = Math.max(-1, ...rows.map((row) => row.sortOrder)) + 1;
  const id = newId();
  const [row] = await db
    .insert(scenes)
    .values(
      input.duplicate
        ? {
            id,
            tableId,
            name: input.name?.trim() || copyName(current.name, names),
            sortOrder,
            imageUrl: current.imageUrl,
            width: current.width,
            height: current.height,
            gridSize: current.gridSize,
            snap: current.snap,
            offsetX: current.offsetX,
            offsetY: current.offsetY,
            fills: current.fills,
            edges: current.edges,
          }
        : {
            id,
            tableId,
            name: input.name?.trim() || nextSceneName(names),
            sortOrder,
            width: current.width,
            height: current.height,
            gridSize: current.gridSize,
            snap: current.snap,
            offsetX: current.offsetX,
            offsetY: current.offsetY,
          },
    )
    .returning();
  if (!row) throw new Error("Failed to create scene");
  if (input.duplicate) {
    const sourceTokens = await db.select().from(tokens).where(eq(tokens.sceneId, current.id));
    if (sourceTokens.length > 0) {
      await db.insert(tokens).values(
        sourceTokens.map((token) => ({
          ...token,
          id: newId(),
          sceneId: id,
        })),
      );
    }
  }
  await db.update(tables).set({ activeSceneId: id }).where(eq(tables.id, tableId));
  return {
    scenes: await listScenes(tableId),
    sceneId: id,
    map: asMap(row),
    tokens: await listTokensForScene(id),
  };
}

export async function switchScene(tableId: string, sceneId: string) {
  const scene = await getScene(sceneId);
  if (!scene || scene.tableId !== tableId) throw new Error("Scene not found");
  await db.update(tables).set({ activeSceneId: sceneId }).where(eq(tables.id, tableId));
  return {
    sceneId,
    map: asMap(scene),
    tokens: await listTokensForScene(sceneId),
  };
}

export async function renameScene(tableId: string, sceneId: string, name: string) {
  const scene = await getScene(sceneId);
  if (!scene || scene.tableId !== tableId) throw new Error("Scene not found");
  const [row] = await db
    .update(scenes)
    .set({ name: name.trim() })
    .where(eq(scenes.id, sceneId))
    .returning();
  if (!row) throw new Error("Scene not found");
  return listScenes(tableId);
}

export async function deleteScene(tableId: string, sceneId: string) {
  const rows = await listSceneRows(tableId);
  if (rows.length <= 1) throw new Error("A table needs at least one scene");
  const scene = rows.find((row) => row.id === sceneId);
  if (!scene) throw new Error("Scene not found");
  const index = rows.findIndex((row) => row.id === sceneId);
  const fallback = rows[index - 1] ?? rows[index + 1];
  if (!fallback) throw new Error("A table needs at least one scene");
  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1);
  const wasActive = table?.activeSceneId === sceneId;
  await db.delete(scenes).where(eq(scenes.id, sceneId));
  if (wasActive) {
    await db.update(tables).set({ activeSceneId: fallback.id }).where(eq(tables.id, tableId));
  }
  const active = wasActive ? fallback : await getActiveScene(tableId);
  return {
    scenes: await listScenes(tableId),
    switched: wasActive
      ? {
          sceneId: active.id,
          map: asMap(active),
          tokens: await listTokensForScene(active.id),
        }
      : null,
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
  const active = await getActiveScene(tableId);
  const sceneRows = await listSceneRows(tableId);
  const characterRows = await db.select().from(characters).where(eq(characters.tableId, tableId));
  const tokenRows = await listTokensForScene(active.id);
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
    map: asMap(active),
    scenes: sceneRows.map(asScene),
    activeSceneId: active.id,
    characters: characterRows.map(asCharacter),
    tokens: tokenRows,
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
  const scene = await getActiveScene(input.tableId);
  const size = input.size ?? scene.gridSize ?? 70;
  const [row] = await db
    .insert(tokens)
    .values({
      id: newId(),
      tableId: input.tableId,
      sceneId: scene.id,
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
  patch: Partial<Omit<MapState, "tableId" | "sceneId" | "fills" | "edges">>,
): Promise<MapState> {
  const current = await getActiveScene(tableId);
  const [row] = await db.update(scenes).set(patch).where(eq(scenes.id, current.id)).returning();
  if (!row) throw new Error("Map not found");
  return asMap(row);
}

export async function paintMapCells(tableId: string, cells: CellPatch[]): Promise<MapState> {
  const current = await getActiveScene(tableId);
  const fills = mergeFills(asColorMap(current.fills), cells);
  const [row] = await db.update(scenes).set({ fills }).where(eq(scenes.id, current.id)).returning();
  if (!row) throw new Error("Map not found");
  return asMap(row);
}

export async function paintMapEdges(tableId: string, edges: EdgePatch[]): Promise<MapState> {
  const current = await getActiveScene(tableId);
  const nextEdges = mergeEdges(asColorMap(current.edges), edges);
  const [row] = await db.update(scenes).set({ edges: nextEdges }).where(eq(scenes.id, current.id)).returning();
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
