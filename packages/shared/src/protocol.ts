import { z } from "zod";
import type { DiceRollResult } from "./dice.ts";
import type { CellPatch, EdgePatch } from "./drawing.ts";
import type { GridType } from "./gridGeometry.ts";

export type MemberRole = "gm" | "player";

export type PresenceMember = {
  userId: string;
  name: string;
  role: MemberRole;
};

export type SceneInfo = {
  id: string;
  name: string;
  sortOrder: number;
};

export type MapState = {
  tableId: string;
  sceneId: string;
  imageUrl: string | null;
  width: number;
  height: number;
  gridType: GridType;
  gridSize: number;
  snap: boolean;
  offsetX: number;
  offsetY: number;
  fills: Record<string, string>;
  edges: Record<string, string>;
};

export type CharacterState = {
  id: string;
  tableId: string;
  ownerId: string;
  schemaId: string;
  schemaVersion: number;
  data: Record<string, unknown>;
};

export type TokenState = {
  id: string;
  tableId: string;
  sceneId: string;
  ownerId: string;
  characterId: string | null;
  x: number;
  y: number;
  size: number;
  label: string;
  imageUrl: string | null;
};

export type DiceLogEntry = {
  id: string;
  tableId: string;
  userId: string;
  userName: string;
  expression: string;
  result: DiceRollResult;
  createdAt: string;
};

export type TableInfo = {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  role: MemberRole;
};

export type TableSnapshot = {
  table: TableInfo;
  map: MapState;
  scenes: SceneInfo[];
  activeSceneId: string;
  characters: CharacterState[];
  tokens: TokenState[];
  diceLog: DiceLogEntry[];
  members: PresenceMember[];
};

const paintColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const cellCoordSchema = z.number().int().min(-5000).max(5000);

export const cellPatchSchema = z.object({
  x: cellCoordSchema,
  y: cellCoordSchema,
  color: paintColorSchema.nullable(),
});

export const edgePatchSchema = z.object({
  x: cellCoordSchema,
  y: cellCoordSchema,
  dir: z.enum(["h", "v", "0", "1", "2", "3", "4", "5"]),
  color: paintColorSchema.nullable(),
});

export const gridTypeSchema = z.enum(["square", "hexFlat", "hexPointy"]);

export const clientActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join_table"), tableId: z.string().min(1) }),
  z.object({
    type: z.literal("patch_character"),
    characterId: z.string().min(1),
    path: z.string().min(1),
    value: z.any(),
  }),
  z.object({
    type: z.literal("move_token"),
    tokenId: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    persist: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("place_token"),
    x: z.number().finite(),
    y: z.number().finite(),
    label: z.string(),
    characterId: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    size: z.number().positive().optional(),
  }),
  z.object({ type: z.literal("delete_token"), tokenId: z.string().min(1) }),
  z.object({
    type: z.literal("update_token"),
    tokenId: z.string().min(1),
    patch: z.object({
      label: z.string().optional(),
      characterId: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      size: z.number().positive().optional(),
    }),
  }),
  z.object({
    type: z.literal("update_map"),
    patch: z.object({
      imageUrl: z.string().nullable().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      gridType: gridTypeSchema.optional(),
      gridSize: z.number().positive().optional(),
      snap: z.boolean().optional(),
      offsetX: z.number().optional(),
      offsetY: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal("paint_cells"),
    cells: z.array(cellPatchSchema).min(1).max(8000),
    persist: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("paint_edges"),
    edges: z.array(edgePatchSchema).min(1).max(8000),
    persist: z.boolean().optional(),
  }),
  z.object({ type: z.literal("roll_dice"), expression: z.string().min(1) }),
  z.object({
    type: z.literal("create_scene"),
    name: z.string().trim().min(1).max(48).optional(),
    duplicate: z.boolean().optional(),
  }),
  z.object({ type: z.literal("switch_scene"), sceneId: z.string().min(1) }),
  z.object({
    type: z.literal("rename_scene"),
    sceneId: z.string().min(1),
    name: z.string().trim().min(1).max(48),
  }),
  z.object({ type: z.literal("delete_scene"), sceneId: z.string().min(1) }),
  z.object({
    type: z.literal("upsert_character"),
    id: z.string().optional(),
    schemaId: z.string().min(1),
    data: z.record(z.any()).optional(),
  }),
]);

export type ClientAction = z.infer<typeof clientActionSchema>;

export type ServerEvent =
  | { type: "table_snapshot"; snapshot: TableSnapshot }
  | { type: "character_patched"; characterId: string; path: string; value: unknown; data: Record<string, unknown> }
  | { type: "character_upserted"; character: CharacterState }
  | { type: "token_moved"; tokenId: string; x: number; y: number }
  | { type: "token_placed"; token: TokenState }
  | { type: "token_deleted"; tokenId: string }
  | { type: "token_updated"; token: TokenState }
  | { type: "dice_rolled"; roll: DiceLogEntry }
  | { type: "map_updated"; map: MapState }
  | { type: "cells_painted"; cells: CellPatch[] }
  | { type: "edges_painted"; edges: EdgePatch[] }
  | { type: "scenes_updated"; scenes: SceneInfo[] }
  | { type: "scene_switched"; sceneId: string; map: MapState; tokens: TokenState[]; scenes?: SceneInfo[] }
  | { type: "presence"; members: PresenceMember[] }
  | { type: "error"; message: string };
