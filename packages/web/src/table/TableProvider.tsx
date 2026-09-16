import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ClientAction, ServerEvent, TableSnapshot } from "@topper/shared";
import { mergeEdges, mergeFills } from "@topper/shared";

export type Tool = "select" | "token" | "fill" | "edge";

type TableContextValue = {
  snapshot: TableSnapshot | null;
  connected: boolean;
  error: string | null;
  send: (action: ClientAction) => void;
  selectedTokenId: string | null;
  setSelectedTokenId: (id: string | null) => void;
  openCharacterId: string | null;
  setOpenCharacterId: (id: string | null) => void;
  tool: Tool;
  setTool: (tool: Tool) => void;
};

const TableContext = createContext<TableContextValue | null>(null);

function applyEvent(snapshot: TableSnapshot, event: ServerEvent): TableSnapshot {
  switch (event.type) {
    case "table_snapshot":
      return event.snapshot;
    case "character_patched":
      return {
        ...snapshot,
        characters: snapshot.characters.map((ch) =>
          ch.id === event.characterId ? { ...ch, data: event.data } : ch,
        ),
      };
    case "character_upserted":
      return {
        ...snapshot,
        characters: snapshot.characters.some((ch) => ch.id === event.character.id)
          ? snapshot.characters.map((ch) => (ch.id === event.character.id ? event.character : ch))
          : [...snapshot.characters, event.character],
      };
    case "token_moved":
      return {
        ...snapshot,
        tokens: snapshot.tokens.map((token) =>
          token.id === event.tokenId ? { ...token, x: event.x, y: event.y } : token,
        ),
      };
    case "token_placed":
      return { ...snapshot, tokens: [...snapshot.tokens, event.token] };
    case "token_deleted":
      return {
        ...snapshot,
        tokens: snapshot.tokens.filter((token) => token.id !== event.tokenId),
      };
    case "token_updated":
      return {
        ...snapshot,
        tokens: snapshot.tokens.map((token) => (token.id === event.token.id ? event.token : token)),
      };
    case "dice_rolled":
      return { ...snapshot, diceLog: [...snapshot.diceLog, event.roll].slice(-50) };
    case "map_updated":
      return { ...snapshot, map: event.map };
    case "cells_painted":
      return {
        ...snapshot,
        map: { ...snapshot.map, fills: mergeFills(snapshot.map.fills ?? {}, event.cells) },
      };
    case "edges_painted":
      return {
        ...snapshot,
        map: { ...snapshot.map, edges: mergeEdges(snapshot.map.edges ?? {}, event.edges) },
      };
    case "scenes_updated":
      return { ...snapshot, scenes: event.scenes };
    case "scene_switched":
      return {
        ...snapshot,
        activeSceneId: event.sceneId,
        map: event.map,
        tokens: event.tokens,
        scenes: event.scenes ?? snapshot.scenes,
      };
    case "presence":
      return { ...snapshot, members: event.members };
    case "error":
      return snapshot;
  }
}

export function TableProvider({
  tableId,
  children,
}: {
  tableId: string;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<TableSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [openCharacterId, setOpenCharacterId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?tableId=${encodeURIComponent(tableId)}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError("Lost the table connection");
    ws.onmessage = (evt) => {
      const event = JSON.parse(evt.data) as ServerEvent;
      if (event.type === "error") {
        setError(event.message);
        return;
      }
      setError(null);
      setSnapshot((current) => {
        if (event.type === "table_snapshot") return event.snapshot;
        if (!current) return current;
        return applyEvent(current, event);
      });
      if (event.type === "scene_switched" || event.type === "table_snapshot") {
        const tokens = event.type === "scene_switched" ? event.tokens : event.snapshot.tokens;
        setSelectedTokenId((id) => (id && tokens.some((token) => token.id === id) ? id : null));
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [tableId]);

  const send = useCallback((action: ClientAction) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(action));
  }, []);

  const value = useMemo(
    () => ({
      snapshot,
      connected,
      error,
      send,
      selectedTokenId,
      setSelectedTokenId,
      openCharacterId,
      setOpenCharacterId,
      tool,
      setTool,
    }),
    [snapshot, connected, error, send, selectedTokenId, openCharacterId, tool],
  );

  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}

export function useTable() {
  const ctx = useContext(TableContext);
  if (!ctx) throw new Error("useTable must be used within TableProvider");
  return ctx;
}
