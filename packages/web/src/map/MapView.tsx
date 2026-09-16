import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { getByPath } from "@topper/shared";
import { useTable } from "../table/TableProvider.tsx";
import { uploadFile } from "../api.ts";

function snap(value: number, size: number, enabled: boolean) {
  if (!enabled) return value;
  return Math.round(value / size) * size;
}

export function MapView() {
  const {
    snapshot,
    send,
    tool,
    setTool,
    selectedTokenId,
    setSelectedTokenId,
    setOpenCharacterId,
  } = useTable();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(0.75);
  const drag = useRef<{
    kind: "pan" | "token";
    id?: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const tokens = snapshot?.tokens ?? [];

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const prevent = (e: WheelEvent) => {
      e.preventDefault();
    };
    node.addEventListener("wheel", prevent, { passive: false });
    return () => node.removeEventListener("wheel", prevent);
  }, [snapshot]);

  if (!snapshot?.map) {
    return <div className="map-stage" />;
  }

  const map = snapshot.map;

  function worldFromClient(clientX: number, clientY: number) {
    const rect = viewportRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldX = (cursor.x - pan.x) / zoom;
    const worldY = (cursor.y - pan.y) / zoom;
    const next = Math.min(2.4, Math.max(0.25, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    setZoom(next);
    setPan({
      x: cursor.x - worldX * next,
      y: cursor.y - worldY * next,
    });
  }

  function onViewportPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if (tool === "token") {
      const world = worldFromClient(e.clientX, e.clientY);
      const x = snap(world.x - map.gridSize / 2, map.gridSize, map.snap);
      const y = snap(world.y - map.gridSize / 2, map.gridSize, map.snap);
      send({
        type: "place_token",
        x,
        y,
        label: "Token",
        size: map.gridSize,
      });
      setTool("select");
      return;
    }
    drag.current = {
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onViewportPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    if (Math.hypot(e.clientX - current.startX, e.clientY - current.startY) > 3) {
      current.moved = true;
    }
    if (current.kind === "pan") {
      setPan({
        x: current.originX + (e.clientX - current.startX),
        y: current.originY + (e.clientY - current.startY),
      });
    } else if (current.kind === "token" && current.id) {
      const world = worldFromClient(e.clientX, e.clientY);
      const x = snap(world.x - current.originX, map.gridSize, map.snap);
      const y = snap(world.y - current.originY, map.gridSize, map.snap);
      send({ type: "move_token", tokenId: current.id, x, y, persist: false });
    }
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.kind === "token" && current.id) {
      const world = worldFromClient(e.clientX, e.clientY);
      const x = snap(world.x - current.originX, map.gridSize, map.snap);
      const y = snap(world.y - current.originY, map.gridSize, map.snap);
      send({ type: "move_token", tokenId: current.id, x, y, persist: true });
      if (!current.moved) {
        const token = tokens.find((t) => t.id === current.id);
        setSelectedTokenId(current.id);
        if (token?.characterId) setOpenCharacterId(token.characterId);
      }
    } else if (current.kind === "pan" && !current.moved) {
      setSelectedTokenId(null);
    }
  }

  function onTokenPointerDown(e: ReactPointerEvent<HTMLButtonElement>, tokenId: string) {
    if (tool === "token") return;
    e.stopPropagation();
    const token = tokens.find((t) => t.id === tokenId);
    if (!token) return;
    const world = worldFromClient(e.clientX, e.clientY);
    drag.current = {
      kind: "token",
      id: tokenId,
      startX: e.clientX,
      startY: e.clientY,
      originX: world.x - token.x,
      originY: world.y - token.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  async function onUploadMap(file: File | undefined) {
    if (!file) return;
    const url = await uploadFile(file);
    const img = new Image();
    img.onload = () => {
      send({
        type: "update_map",
        patch: { imageUrl: url, width: img.naturalWidth, height: img.naturalHeight },
      });
    };
    img.src = url;
  }

  const isGm = snapshot.table.role === "gm";

  return (
    <div className="map-stage">
      <div className="toolbar">
        <button
          className={`btn small ${tool === "select" ? "primary" : ""}`}
          type="button"
          onClick={() => setTool("select")}
        >
          Move
        </button>
        <button
          className={`btn small ${tool === "token" ? "primary" : ""}`}
          type="button"
          onClick={() => setTool("token")}
        >
          Place token
        </button>
        {isGm ? (
          <>
            <label className="btn small" style={{ margin: 0 }}>
              Map image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onUploadMap(e.target.files?.[0])}
              />
            </label>
            <button
              className="btn small"
              type="button"
              onClick={() => send({ type: "update_map", patch: { snap: !map.snap } })}
            >
              Snap {map.snap ? "on" : "off"}
            </button>
            <label className="btn small" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              Grid
              <input
                type="number"
                min={20}
                max={200}
                value={map.gridSize}
                onChange={(e) =>
                  send({ type: "update_map", patch: { gridSize: Number(e.target.value) || 70 } })
                }
                style={{ width: 64 }}
              />
            </label>
          </>
        ) : null}
      </div>
      <div
        ref={viewportRef}
        className={`map-viewport ${tool === "token" ? "placing" : ""}`}
        onWheel={onWheel}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="map-world"
          style={{
            width: map.width,
            height: map.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {map.imageUrl ? (
            <img className="map-image" src={map.imageUrl} alt="" draggable={false} />
          ) : (
            <div className="map-blank" />
          )}
          <div
            className="map-grid"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(210,177,122,0.22) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(210,177,122,0.22) 1px, transparent 1px)`,
              backgroundSize: `${map.gridSize}px ${map.gridSize}px`,
              backgroundPosition: `${map.offsetX}px ${map.offsetY}px`,
            }}
          />
          {tokens.map((token) => {
            const character = snapshot.characters.find((ch) => ch.id === token.characterId);
            const portrait = character ? (getByPath(character.data, "portrait") as string | undefined) : undefined;
            const name =
              (character ? (getByPath(character.data, "name") as string | undefined) : undefined) ||
              token.label;
            return (
              <button
                key={token.id}
                className={`token ${selectedTokenId === token.id ? "selected" : ""}`}
                type="button"
                style={{
                  width: token.size,
                  height: token.size,
                  left: token.x,
                  top: token.y,
                  backgroundImage: token.imageUrl || portrait ? `url(${token.imageUrl || portrait})` : undefined,
                  backgroundSize: "cover",
                }}
                onPointerDown={(e) => onTokenPointerDown(e, token.id)}
              >
                {token.imageUrl || portrait ? null : (name?.[0] ?? "?").toUpperCase()}
                <span className="token-label">{name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
