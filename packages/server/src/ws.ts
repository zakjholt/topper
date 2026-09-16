import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";
import {
  clientActionSchema,
  getByPath,
  rollDice,
  setByPath,
  type ClientAction,
  type MemberRole,
  type ServerEvent,
} from "@topper/shared";
import { auth } from "./auth.ts";
import {
  createScene,
  deleteScene,
  deleteToken,
  getActiveScene,
  getCharacter,
  getMembership,
  getToken,
  insertDiceRoll,
  listMembers,
  loadSnapshot,
  moveToken,
  paintMapCells,
  paintMapEdges,
  patchCharacterData,
  placeToken,
  renameScene,
  switchScene,
  updateMap,
  updateToken,
  upsertCharacter,
} from "./db/tables.ts";

type Peer = {
  id: string;
  ws: WSContext;
  userId: string;
  name: string;
  tableId: string;
  role: MemberRole;
};

const rooms = new Map<string, Set<Peer>>();

function send(ws: WSContext, event: ServerEvent) {
  ws.send(JSON.stringify(event));
}

function broadcast(tableId: string, event: ServerEvent, except?: string) {
  const room = rooms.get(tableId);
  if (!room) return;
  const payload = JSON.stringify(event);
  for (const peer of room) {
    if (except && peer.id === except) continue;
    peer.ws.send(payload);
  }
}

function addPeer(peer: Peer) {
  let room = rooms.get(peer.tableId);
  if (!room) {
    room = new Set();
    rooms.set(peer.tableId, room);
  }
  room.add(peer);
}

function removePeer(peer: Peer) {
  const room = rooms.get(peer.tableId);
  if (!room) return;
  room.delete(peer);
  if (room.size === 0) rooms.delete(peer.tableId);
}

function canEditCharacter(role: MemberRole, ownerId: string, userId: string) {
  return role === "gm" || ownerId === userId;
}

function canEditToken(role: MemberRole, ownerId: string, userId: string) {
  return role === "gm" || ownerId === userId;
}

function assertGm(peer: Peer) {
  if (peer.role !== "gm") throw new Error("Only the GM can do that");
}

async function requireActiveToken(peer: Peer, tokenId: string) {
  const token = await getToken(tokenId);
  if (!token || token.tableId !== peer.tableId) throw new Error("Token not found");
  if (!canEditToken(peer.role, token.ownerId, peer.userId)) {
    throw new Error("You cannot edit this token");
  }
  const active = await getActiveScene(peer.tableId);
  if (token.sceneId !== active.id) throw new Error("Token is not on this scene");
  return token;
}

async function handleAction(peer: Peer, action: ClientAction) {
  switch (action.type) {
    case "join_table":
      return;
    case "patch_character": {
      const character = await getCharacter(action.characterId);
      if (!character || character.tableId !== peer.tableId) throw new Error("Character not found");
      if (!canEditCharacter(peer.role, character.ownerId, peer.userId)) {
        throw new Error("You cannot edit this character");
      }
      const next = setByPath(character.data, action.path, action.value);
      const updated = await patchCharacterData(character.id, next);
      broadcast(peer.tableId, {
        type: "character_patched",
        characterId: updated.id,
        path: action.path,
        value: getByPath(updated.data, action.path),
        data: updated.data,
      });
      return;
    }
    case "upsert_character": {
      if (action.id) {
        const existing = await getCharacter(action.id);
        if (!existing || existing.tableId !== peer.tableId) throw new Error("Character not found");
        if (!canEditCharacter(peer.role, existing.ownerId, peer.userId)) {
          throw new Error("You cannot edit this character");
        }
      }
      const character = await upsertCharacter({
        id: action.id,
        tableId: peer.tableId,
        ownerId: peer.userId,
        schemaId: action.schemaId,
        data: action.data,
      });
      broadcast(peer.tableId, { type: "character_upserted", character });
      return;
    }
    case "move_token": {
      const token = await requireActiveToken(peer, action.tokenId);
      if (action.persist !== false) {
        await moveToken(token.id, action.x, action.y);
      }
      broadcast(peer.tableId, {
        type: "token_moved",
        tokenId: token.id,
        x: action.x,
        y: action.y,
      });
      return;
    }
    case "place_token": {
      const token = await placeToken({
        tableId: peer.tableId,
        ownerId: peer.userId,
        x: action.x,
        y: action.y,
        label: action.label,
        characterId: action.characterId,
        imageUrl: action.imageUrl,
        size: action.size,
      });
      broadcast(peer.tableId, { type: "token_placed", token });
      return;
    }
    case "delete_token": {
      const token = await requireActiveToken(peer, action.tokenId);
      await deleteToken(token.id);
      broadcast(peer.tableId, { type: "token_deleted", tokenId: token.id });
      return;
    }
    case "update_token": {
      const token = await requireActiveToken(peer, action.tokenId);
      const updated = await updateToken(token.id, action.patch);
      broadcast(peer.tableId, { type: "token_updated", token: updated });
      return;
    }
    case "update_map": {
      assertGm(peer);
      const map = await updateMap(peer.tableId, action.patch);
      broadcast(peer.tableId, { type: "map_updated", map });
      return;
    }
    case "paint_cells": {
      assertGm(peer);
      if (action.persist !== false) {
        await paintMapCells(peer.tableId, action.cells);
      }
      broadcast(peer.tableId, { type: "cells_painted", cells: action.cells });
      return;
    }
    case "paint_edges": {
      assertGm(peer);
      if (action.persist !== false) {
        await paintMapEdges(peer.tableId, action.edges);
      }
      broadcast(peer.tableId, { type: "edges_painted", edges: action.edges });
      return;
    }
    case "roll_dice": {
      const result = rollDice(action.expression);
      const roll = await insertDiceRoll({
        tableId: peer.tableId,
        userId: peer.userId,
        userName: peer.name,
        expression: result.expression,
        result,
      });
      broadcast(peer.tableId, { type: "dice_rolled", roll });
      return;
    }
    case "create_scene": {
      assertGm(peer);
      const created = await createScene(peer.tableId, {
        name: action.name,
        duplicate: action.duplicate,
      });
      broadcast(peer.tableId, {
        type: "scene_switched",
        sceneId: created.sceneId,
        map: created.map,
        tokens: created.tokens,
        scenes: created.scenes,
      });
      return;
    }
    case "switch_scene": {
      assertGm(peer);
      const next = await switchScene(peer.tableId, action.sceneId);
      broadcast(peer.tableId, {
        type: "scene_switched",
        sceneId: next.sceneId,
        map: next.map,
        tokens: next.tokens,
      });
      return;
    }
    case "rename_scene": {
      assertGm(peer);
      const scenes = await renameScene(peer.tableId, action.sceneId, action.name);
      broadcast(peer.tableId, { type: "scenes_updated", scenes });
      return;
    }
    case "delete_scene": {
      assertGm(peer);
      const result = await deleteScene(peer.tableId, action.sceneId);
      if (result.switched) {
        broadcast(peer.tableId, {
          type: "scene_switched",
          sceneId: result.switched.sceneId,
          map: result.switched.map,
          tokens: result.switched.tokens,
          scenes: result.scenes,
        });
      } else {
        broadcast(peer.tableId, { type: "scenes_updated", scenes: result.scenes });
      }
      return;
    }
  }
}

export function registerWebSocket(app: Hono, upgradeWebSocket: UpgradeWebSocket) {
  app.get(
    "/ws",
    upgradeWebSocket(async (c) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      const tableId = c.req.query("tableId") ?? "";
      if (!session?.user) {
        return {
          onOpen(_evt, ws) {
            send(ws, { type: "error", message: "Unauthorized" });
            ws.close();
          },
        };
      }

      const membership = tableId ? await getMembership(tableId, session.user.id) : null;
      if (!membership) {
        return {
          onOpen(_evt, ws) {
            send(ws, { type: "error", message: "Not a member of this table" });
            ws.close();
          },
        };
      }

      const peer: Peer = {
        id: crypto.randomUUID(),
        ws: null as unknown as WSContext,
        userId: session.user.id,
        name: session.user.name,
        tableId,
        role: membership.role,
      };

      return {
        async onOpen(_evt, ws) {
          peer.ws = ws;
          addPeer(peer);
          try {
            const snapshot = await loadSnapshot(tableId, peer.userId);
            send(ws, { type: "table_snapshot", snapshot });
            broadcast(tableId, { type: "presence", members: await listMembers(tableId) });
          } catch (err) {
            send(ws, {
              type: "error",
              message: err instanceof Error ? err.message : "Failed to load table",
            });
            ws.close();
          }
        },
        async onMessage(evt, ws) {
          if (typeof evt.data !== "string") return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(evt.data);
          } catch {
            send(ws, { type: "error", message: "Invalid JSON" });
            return;
          }
          const action = clientActionSchema.safeParse(parsed);
          if (!action.success) {
            send(ws, { type: "error", message: "Invalid action" });
            return;
          }
          try {
            await handleAction(peer, action.data);
          } catch (err) {
            send(ws, {
              type: "error",
              message: err instanceof Error ? err.message : "Action failed",
            });
          }
        },
        onClose() {
          removePeer(peer);
          void listMembers(tableId).then((members) => {
            broadcast(tableId, { type: "presence", members });
          });
        },
        onError() {
          removePeer(peer);
        },
      };
    }),
  );
}
