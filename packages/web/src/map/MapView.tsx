import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  cellBoundsForMap,
  cellInBounds,
  cellKey,
  edgeKey,
  floodFill,
  getByPath,
  rectCells,
  rectEdges,
  type CellPatch,
  type EdgeDir,
  type EdgePatch,
} from "@topper/shared";
import { useTable } from "../table/TableProvider.tsx";
import { uploadFile } from "../api.ts";
import { EdgeLayer, FillLayer } from "./DrawingLayer.tsx";
import { nearestEdge, worldToCell } from "./grid.ts";

const PALETTE = [
  "#e8dcc4",
  "#c4b49a",
  "#6b6358",
  "#5c4033",
  "#8b5a2b",
  "#3a5a7a",
  "#4f8a62",
  "#3d4f3a",
  "#a33a32",
  "#2a2116",
];

function snap(value: number, size: number, enabled: boolean) {
  if (!enabled) return value;
  return Math.round(value / size) * size;
}

type PanDrag = {
  kind: "pan";
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

type TokenDrag = {
  kind: "token";
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

type PaintDrag = {
  kind: "paint";
  mode: "fill" | "edge";
  area: boolean;
  color: string | null;
  startCell: { x: number; y: number };
  currentCell: { x: number; y: number };
  startEdge: { x: number; y: number; dir: EdgeDir };
  moved: boolean;
  sent: Set<string>;
  cells: CellPatch[];
  edges: EdgePatch[];
};

type Drag = PanDrag | TokenDrag | PaintDrag;

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
  const [paintColor, setPaintColor] = useState<string | null>("#c4b49a");
  const [preview, setPreview] = useState<{
    kind: "fill" | "edge";
    start: { x: number; y: number };
    end: { x: number; y: number };
    color: string | null;
  } | null>(null);
  const drag = useRef<Drag | null>(null);

  const tokens = snapshot?.tokens ?? [];
  const isGm = snapshot?.table.role === "gm";
  const drawing = Boolean(isGm && (tool === "fill" || tool === "edge"));

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const prevent = (e: WheelEvent) => {
      e.preventDefault();
    };
    node.addEventListener("wheel", prevent, { passive: false });
    return () => node.removeEventListener("wheel", prevent);
  }, [snapshot]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "v" || key === "m") setTool("select");
      else if (key === "t") setTool("token");
      else if (isGm && key === "f") setTool("fill");
      else if (isGm && key === "e") setTool("edge");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isGm, setTool]);

  const map = snapshot?.map;
  const bounds = useMemo(() => {
    if (!map) return null;
    return cellBoundsForMap(map.width, map.height, map.gridSize, map.offsetX, map.offsetY);
  }, [map]);

  const previewFills = useMemo(() => {
    if (!preview || preview.kind !== "fill" || !bounds) return null;
    return rectCells(preview.start.x, preview.start.y, preview.end.x, preview.end.y, preview.color, bounds);
  }, [preview, bounds]);

  const previewEdges = useMemo(() => {
    if (!preview || preview.kind !== "edge") return null;
    return rectEdges(preview.start.x, preview.start.y, preview.end.x, preview.end.y, preview.color);
  }, [preview]);

  if (!snapshot?.map) {
    return <div className="map-stage" />;
  }

  const mapState = snapshot.map;

  function worldFromClient(clientX: number, clientY: number) {
    const rect = viewportRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }

  function cellFromClient(clientX: number, clientY: number) {
    const world = worldFromClient(clientX, clientY);
    return worldToCell(world.x, world.y, mapState.gridSize, mapState.offsetX, mapState.offsetY);
  }

  function edgeFromClient(clientX: number, clientY: number) {
    const world = worldFromClient(clientX, clientY);
    return nearestEdge(world.x, world.y, mapState.gridSize, mapState.offsetX, mapState.offsetY);
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

  function startPan(e: ReactPointerEvent<HTMLDivElement>) {
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

  function paintAtPointer(current: PaintDrag, clientX: number, clientY: number) {
    const cell = cellFromClient(clientX, clientY);
    if (cell.x !== current.startCell.x || cell.y !== current.startCell.y) current.moved = true;
    current.currentCell = cell;

    if (current.area) {
      if (current.moved) {
        setPreview({
          kind: current.mode,
          start: current.startCell,
          end: cell,
          color: current.color,
        });
      }
      return;
    }

    if (current.mode === "fill") {
      if (!bounds || !cellInBounds(cell.x, cell.y, bounds)) return;
      const key = cellKey(cell.x, cell.y);
      if (current.sent.has(key)) return;
      current.sent.add(key);
      const patch = { x: cell.x, y: cell.y, color: current.color };
      current.cells.push(patch);
      send({ type: "paint_cells", cells: [patch], persist: false });
      return;
    }

    const edge = edgeFromClient(clientX, clientY);
    const key = edgeKey(edge.x, edge.y, edge.dir);
    if (current.sent.has(key)) return;
    current.sent.add(key);
    const patch = { ...edge, color: current.color };
    current.edges.push(patch);
    send({ type: "paint_edges", edges: [patch], persist: false });
  }

  function finishPaint(current: PaintDrag) {
    setPreview(null);
    if (current.area) {
      if (current.mode === "fill" && bounds) {
        const cells = current.moved
          ? rectCells(
              current.startCell.x,
              current.startCell.y,
              current.currentCell.x,
              current.currentCell.y,
              current.color,
              bounds,
            )
          : floodFill(mapState.fills, current.startCell, current.color, bounds);
        if (cells.length > 0) send({ type: "paint_cells", cells, persist: true });
        return;
      }
      if (current.mode === "edge") {
        const edges = current.moved
          ? rectEdges(
              current.startCell.x,
              current.startCell.y,
              current.currentCell.x,
              current.currentCell.y,
              current.color,
            )
          : [{ ...current.startEdge, color: current.color }];
        if (edges.length > 0) send({ type: "paint_edges", edges, persist: true });
      }
      return;
    }
    if (current.mode === "fill" && current.cells.length > 0) {
      send({ type: "paint_cells", cells: current.cells, persist: true });
    } else if (current.mode === "edge" && current.edges.length > 0) {
      send({ type: "paint_edges", edges: current.edges, persist: true });
    }
  }

  function eraseAt(clientX: number, clientY: number) {
    if (tool === "fill" && bounds) {
      const cell = cellFromClient(clientX, clientY);
      if (!cellInBounds(cell.x, cell.y, bounds)) return;
      send({ type: "paint_cells", cells: [{ x: cell.x, y: cell.y, color: null }], persist: true });
      return;
    }
    if (tool === "edge") {
      const edge = edgeFromClient(clientX, clientY);
      send({ type: "paint_edges", edges: [{ ...edge, color: null }], persist: true });
    }
  }

  function onViewportPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button === 1) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    if (e.button === 2) e.preventDefault();

    if (tool === "token" && e.button === 0) {
      const world = worldFromClient(e.clientX, e.clientY);
      const x = snap(world.x - mapState.gridSize / 2, mapState.gridSize, mapState.snap);
      const y = snap(world.y - mapState.gridSize / 2, mapState.gridSize, mapState.snap);
      send({
        type: "place_token",
        x,
        y,
        label: "Token",
        size: mapState.gridSize,
      });
      setTool("select");
      return;
    }

    if (drawing && (tool === "fill" || tool === "edge")) {
      const cell = cellFromClient(e.clientX, e.clientY);
      const edge = edgeFromClient(e.clientX, e.clientY);
      const current: PaintDrag = {
        kind: "paint",
        mode: tool,
        area: e.shiftKey,
        color: e.button === 2 || e.altKey ? null : paintColor,
        startCell: cell,
        currentCell: cell,
        startEdge: edge,
        moved: false,
        sent: new Set(),
        cells: [],
        edges: [],
      };
      drag.current = current;
      e.currentTarget.setPointerCapture(e.pointerId);
      paintAtPointer(current, e.clientX, e.clientY);
      return;
    }

    if (e.button !== 0) return;
    startPan(e);
  }

  function onViewportPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    if (current.kind === "pan") {
      if (Math.hypot(e.clientX - current.startX, e.clientY - current.startY) > 3) current.moved = true;
      setPan({
        x: current.originX + (e.clientX - current.startX),
        y: current.originY + (e.clientY - current.startY),
      });
      return;
    }
    if (current.kind === "token") {
      if (Math.hypot(e.clientX - current.startX, e.clientY - current.startY) > 3) current.moved = true;
      const world = worldFromClient(e.clientX, e.clientY);
      const x = snap(world.x - current.originX, mapState.gridSize, mapState.snap);
      const y = snap(world.y - current.originY, mapState.gridSize, mapState.snap);
      send({ type: "move_token", tokenId: current.id, x, y, persist: false });
      return;
    }
    paintAtPointer(current, e.clientX, e.clientY);
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.kind === "token") {
      const world = worldFromClient(e.clientX, e.clientY);
      const x = snap(world.x - current.originX, mapState.gridSize, mapState.snap);
      const y = snap(world.y - current.originY, mapState.gridSize, mapState.snap);
      send({ type: "move_token", tokenId: current.id, x, y, persist: true });
      if (!current.moved) {
        const token = tokens.find((t) => t.id === current.id);
        setSelectedTokenId(current.id);
        if (token?.characterId) setOpenCharacterId(token.characterId);
      }
      return;
    }
    if (current.kind === "pan") {
      if (!current.moved) setSelectedTokenId(null);
      return;
    }
    finishPaint(current);
  }

  function onTokenPointerDown(e: ReactPointerEvent<HTMLButtonElement>, tokenId: string) {
    if (tool === "token" || drawing) return;
    if (e.button !== 0) return;
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

  const viewportClass = ["map-viewport", tool === "token" || drawing ? "placing" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="map-stage">
      <div className="toolbar">
        <div className="toolbar-row">
          <button
            className={`btn small ${tool === "select" ? "primary" : ""}`}
            type="button"
            onClick={() => setTool("select")}
          >
            Move
          </button>
          {isGm ? (
            <>
              <button
                className={`btn small ${tool === "fill" ? "primary" : ""}`}
                type="button"
                onClick={() => setTool("fill")}
              >
                Fill
              </button>
              <button
                className={`btn small ${tool === "edge" ? "primary" : ""}`}
                type="button"
                onClick={() => setTool("edge")}
              >
                Edge
              </button>
            </>
          ) : null}
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
                  onChange={(evt) => void onUploadMap(evt.target.files?.[0])}
                />
              </label>
              <button
                className="btn small"
                type="button"
                onClick={() => send({ type: "update_map", patch: { snap: !mapState.snap } })}
              >
                Snap {mapState.snap ? "on" : "off"}
              </button>
              <label className="btn small" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                Grid
                <input
                  type="number"
                  min={20}
                  max={200}
                  value={mapState.gridSize}
                  onChange={(evt) =>
                    send({ type: "update_map", patch: { gridSize: Number(evt.target.value) || 70 } })
                  }
                  style={{ width: 64 }}
                />
              </label>
            </>
          ) : null}
        </div>
        {drawing ? (
          <div className="toolbar-palette">
            <button
              type="button"
              className={`swatch erase ${paintColor === null ? "active" : ""}`}
              aria-label="Erase"
              title="Erase"
              onClick={() => setPaintColor(null)}
            />
            {PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className={`swatch ${paintColor === color ? "active" : ""}`}
                style={{ background: color }}
                aria-label={color}
                title={color}
                onClick={() => setPaintColor(color)}
              />
            ))}
            <label className="swatch custom" title="Custom color">
              <input
                type="color"
                value={paintColor ?? "#c4b49a"}
                onChange={(evt) => setPaintColor(evt.target.value)}
              />
            </label>
            <p className="toolbar-hint">Drag to paint · Right-click erases · Shift flood / rectangle</p>
          </div>
        ) : null}
      </div>
      <div
        ref={viewportRef}
        className={viewportClass}
        onWheel={onWheel}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onContextMenu={(evt) => {
          evt.preventDefault();
          if (!drawing || drag.current) return;
          eraseAt(evt.clientX, evt.clientY);
        }}
        onAuxClick={(evt) => evt.preventDefault()}
      >
        <div
          className="map-world"
          style={{
            width: mapState.width,
            height: mapState.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {mapState.imageUrl ? (
            <img className="map-image" src={mapState.imageUrl} alt="" draggable={false} />
          ) : (
            <div className="map-blank" />
          )}
          <FillLayer
            fills={mapState.fills ?? {}}
            preview={previewFills}
            width={mapState.width}
            height={mapState.height}
            gridSize={mapState.gridSize}
            offsetX={mapState.offsetX}
            offsetY={mapState.offsetY}
          />
          <div
            className="map-grid"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(210,177,122,0.22) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(210,177,122,0.22) 1px, transparent 1px)`,
              backgroundSize: `${mapState.gridSize}px ${mapState.gridSize}px`,
              backgroundPosition: `${mapState.offsetX}px ${mapState.offsetY}px`,
            }}
          />
          <EdgeLayer
            edges={mapState.edges ?? {}}
            preview={previewEdges}
            width={mapState.width}
            height={mapState.height}
            gridSize={mapState.gridSize}
            offsetX={mapState.offsetX}
            offsetY={mapState.offsetY}
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
                  pointerEvents: drawing ? "none" : undefined,
                }}
                onPointerDown={(evt) => onTokenPointerDown(evt, token.id)}
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
