import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  cellBoundsForMap,
  cellInBounds,
  clampCell,
  edgeRunVertices,
  floodFill,
  getByPath,
  rectCells,
  rectEdges,
  straightEdgeRun,
  type CellPatch,
  type EdgeDir,
  type EdgePatch,
} from "@topper/shared";
import { useTable } from "../table/TableProvider.tsx";
import { uploadFile } from "../api.ts";
import { EdgeLayer, FillLayer, GridLayer } from "./DrawingLayer.tsx";
import { closerEdgeVertex, nearestEdge, nearestVertex, worldToCell } from "./grid.ts";

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

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.4;
const ZOOM_SENSITIVITY = 0.0007;

function wheelDeltaPixels(e: ReactWheelEvent<HTMLDivElement>) {
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * e.currentTarget.clientHeight;
  return e.deltaY;
}

function snapToGrid(value: number, size: number, offset: number, enabled: boolean) {
  if (!enabled) return value;
  const step = Math.max(1, size);
  return Math.round((value - offset) / step) * step + offset;
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
  rect: boolean;
  flood: boolean;
  color: string | null;
  startCell: { x: number; y: number };
  currentCell: { x: number; y: number };
  startEdge: { x: number; y: number; dir: EdgeDir };
  startVertex: { x: number; y: number };
  currentVertex: { x: number; y: number };
  axis: EdgeDir | null;
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
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  panRef.current = pan;
  zoomRef.current = zoom;
  const [paintColor, setPaintColor] = useState<string | null>("#c4b49a");
  const [preview, setPreview] = useState<{
    kind: "fill" | "edge";
    shape: "rect" | "line";
    start: { x: number; y: number };
    end: { x: number; y: number };
    color: string | null;
    edges?: EdgePatch[];
  } | null>(null);
  const drag = useRef<Drag | null>(null);
  const [panHeld, setPanHeld] = useState(false);

  const tokens = snapshot?.tokens ?? [];
  const isGm = snapshot?.table.role === "gm";
  const drawing = Boolean(isGm && (tool === "fill" || tool === "edge"));
  const panOverride = panHeld;

  useEffect(() => {
    function syncPanHeld(e: KeyboardEvent) {
      setPanHeld(e.ctrlKey);
    }
    function clearPanHeld() {
      setPanHeld(false);
    }
    window.addEventListener("keydown", syncPanHeld);
    window.addEventListener("keyup", syncPanHeld);
    window.addEventListener("blur", clearPanHeld);
    return () => {
      window.removeEventListener("keydown", syncPanHeld);
      window.removeEventListener("keyup", syncPanHeld);
      window.removeEventListener("blur", clearPanHeld);
    };
  }, []);

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
      if (e.ctrlKey || e.metaKey || e.altKey) return;
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

  const previewFills = preview?.kind === "fill" ? preview : null;

  const previewEdges = useMemo(() => {
    if (!preview || preview.kind !== "edge") return null;
    if (preview.shape === "line") return preview.edges ?? null;
    return rectEdges(preview.start.x, preview.start.y, preview.end.x, preview.end.y, preview.color);
  }, [preview]);

  const previewLine = useMemo(() => {
    if (!preview || preview.kind !== "edge" || preview.shape !== "line" || !preview.edges) return null;
    const vertices = edgeRunVertices(preview.edges);
    if (!vertices) return null;
    return { ...vertices, color: preview.color };
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
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const worldX = (cursor.x - currentPan.x) / currentZoom;
    const worldY = (cursor.y - currentPan.y) / currentZoom;
    const next = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, currentZoom * Math.exp(-wheelDeltaPixels(e) * ZOOM_SENSITIVITY)),
    );
    const nextPan = {
      x: cursor.x - worldX * next,
      y: cursor.y - worldY * next,
    };
    zoomRef.current = next;
    panRef.current = nextPan;
    setZoom(next);
    setPan(nextPan);
  }

  function startPan(e: ReactPointerEvent<HTMLDivElement>) {
    drag.current = {
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      originX: panRef.current.x,
      originY: panRef.current.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function isPanGesture(e: { button: number; ctrlKey: boolean }) {
    return e.button === 1 || e.ctrlKey;
  }

  function vertexFromClient(clientX: number, clientY: number) {
    const world = worldFromClient(clientX, clientY);
    return nearestVertex(world.x, world.y, mapState.gridSize, mapState.offsetX, mapState.offsetY);
  }

  function startVertexFromClient(edge: { x: number; y: number; dir: EdgeDir }, clientX: number, clientY: number) {
    const world = worldFromClient(clientX, clientY);
    return closerEdgeVertex(edge, world.x, world.y, mapState.gridSize, mapState.offsetX, mapState.offsetY);
  }

  function paintAtPointer(current: PaintDrag, clientX: number, clientY: number) {
    const raw = cellFromClient(clientX, clientY);
    const cell = bounds ? clampCell(raw, bounds) : raw;
    if (cell.x !== current.startCell.x || cell.y !== current.startCell.y) current.moved = true;
    current.currentCell = cell;

    if (current.mode === "fill" || current.rect) {
      setPreview({
        kind: current.mode,
        shape: "rect",
        start: current.startCell,
        end: cell,
        color: current.color,
      });
      return;
    }

    const vertex = vertexFromClient(clientX, clientY);
    if (vertex.x !== current.startVertex.x || vertex.y !== current.startVertex.y) current.moved = true;
    current.currentVertex = vertex;
    if (!current.axis) {
      const dx = Math.abs(vertex.x - current.startVertex.x);
      const dy = Math.abs(vertex.y - current.startVertex.y);
      if (dx >= 1 || dy >= 1) current.axis = dx >= dy ? "h" : "v";
    }
    const edges = straightEdgeRun(
      current.startEdge,
      current.startVertex,
      vertex,
      current.axis,
      current.color,
    );
    current.edges = edges;
    setPreview({
      kind: "edge",
      shape: "line",
      start: current.startVertex,
      end: current.axis === "h" ? { x: vertex.x, y: current.startVertex.y } : { x: current.startVertex.x, y: vertex.y },
      color: current.color,
      edges,
    });
  }

  function finishPaint(current: PaintDrag) {
    setPreview(null);
    if (current.mode === "fill") {
      if (!bounds) return;
      const cells =
        !current.moved && current.flood
          ? floodFill(mapState.fills, current.startCell, current.color, bounds)
          : rectCells(
              current.startCell.x,
              current.startCell.y,
              current.currentCell.x,
              current.currentCell.y,
              current.color,
              bounds,
            );
      if (cells.length > 0) send({ type: "paint_cells", cells, persist: true });
      return;
    }
    if (current.rect) {
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
      return;
    }
    const edges = straightEdgeRun(
      current.startEdge,
      current.startVertex,
      current.currentVertex,
      current.axis,
      current.color,
    );
    if (edges.length > 0) send({ type: "paint_edges", edges, persist: true });
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
    if (isPanGesture(e)) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    if (e.button === 2) e.preventDefault();

    if (tool === "token" && e.button === 0) {
      const world = worldFromClient(e.clientX, e.clientY);
      const x = snapToGrid(world.x - mapState.gridSize / 2, mapState.gridSize, mapState.offsetX, mapState.snap);
      const y = snapToGrid(world.y - mapState.gridSize / 2, mapState.gridSize, mapState.offsetY, mapState.snap);
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
      const rawCell = cellFromClient(e.clientX, e.clientY);
      const cell = tool === "fill" && bounds ? clampCell(rawCell, bounds) : rawCell;
      const edge = edgeFromClient(e.clientX, e.clientY);
      const startVertex = startVertexFromClient(edge, e.clientX, e.clientY);
      const current: PaintDrag = {
        kind: "paint",
        mode: tool,
        rect: tool === "fill" || e.shiftKey,
        flood: tool === "fill" && e.shiftKey,
        color: e.button === 2 || e.altKey ? null : paintColor,
        startCell: cell,
        currentCell: cell,
        startEdge: edge,
        startVertex,
        currentVertex: startVertex,
        axis: null,
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
      const x = snapToGrid(world.x - current.originX, mapState.gridSize, mapState.offsetX, mapState.snap);
      const y = snapToGrid(world.y - current.originY, mapState.gridSize, mapState.offsetY, mapState.snap);
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
      const x = snapToGrid(world.x - current.originX, mapState.gridSize, mapState.offsetX, mapState.snap);
      const y = snapToGrid(world.y - current.originY, mapState.gridSize, mapState.offsetY, mapState.snap);
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
    if (isPanGesture(e)) return;
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

  const viewportClass = [
    "map-viewport",
    tool === "token" || drawing ? "placing" : "",
    panOverride ? "panning" : "",
  ]
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
            <p className="toolbar-hint">
              {tool === "fill"
                ? "Drag a rectangle · Click a cell · Shift-click flood · Right-click erases · Ctrl-drag pans"
                : "Drag a straight wall · Click an edge · Shift-drag a rectangle · Right-click erases · Ctrl-drag pans"}
            </p>
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
          if (evt.ctrlKey || !drawing || drag.current) return;
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
          <GridLayer
            width={mapState.width}
            height={mapState.height}
            gridSize={mapState.gridSize}
            offsetX={mapState.offsetX}
            offsetY={mapState.offsetY}
          />
          <EdgeLayer
            edges={mapState.edges ?? {}}
            preview={previewEdges}
            linePreview={previewLine}
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
                  pointerEvents: drawing || panOverride ? "none" : undefined,
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
