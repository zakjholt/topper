import { z } from "zod";
import type { DiceRollResult } from "./dice.ts";

export type MemberRole = "gm" | "player";

export type PresenceMember = {
  userId: string;
  name: string;
  role: MemberRole;
};

export type MapState = {
  tableId: string;
  imageUrl: string | null;
  width: number;
  height: number;
  gridSize: number;
  snap: boolean;
  offsetX: number;
  offsetY: number;
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
  characters: CharacterState[];
  tokens: TokenState[];
  diceLog: DiceLogEntry[];
  members: PresenceMember[];
};

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
      gridSize: z.number().positive().optional(),
      snap: z.boolean().optional(),
      offsetX: z.number().optional(),
      offsetY: z.number().optional(),
    }),
  }),
  z.object({ type: z.literal("roll_dice"), expression: z.string().min(1) }),
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
  | { type: "presence"; members: PresenceMember[] }
  | { type: "error"; message: string };
