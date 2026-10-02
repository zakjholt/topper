import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  cellBoundsForMap,
  cellInBounds,
  clampCell,
  edgeRunVertices,
  floodFill,
  getByPath,
  hexEdgeRun,
  hexTokenSize,
  isHexGrid,
  rectCells,
  rectEdges,
  straightEdgeRun,
  type CellPatch,
  type EdgeDir,
  type EdgePatch,
} from "@topper/shared";
import { useTable } from "../table/TableProvider.tsx";
import { uploadFile } from "../api.ts";
import { AlignHud, MapDropOverlay } from "./AlignHud.tsx";
import {
  alignFromHexRect,
  alignFromRect,
  clampGridSize,
  clampOffset,
  fitMapInViewport,
  imageFromDrop,
  isFileDrag,
} from "./align.ts";
import { EdgeLayer, FillLayer, GridLayer } from "./DrawingLayer.tsx";
import { closerEdgeVertex, nearestEdge, nearestVertex, tokenSnapPosition, worldToCell } from "./grid.ts";
import { Toolbar } from "./Toolbar.tsx";
import { SceneBar } from "./SceneBar.tsx";
import { defaultPaintColor } from "./palette.ts";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.4;
const ZOOM_SENSITIVITY = 0.0007;

function wheelDeltaPixels(e: ReactWheelEvent<HTMLDivElement>) {
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * e.currentTarget.clientHeight;
  return e.deltaY;
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

type AlignDrag = {
  kind: "align";
  mode: "square" | "nudge";
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  offsetX: number;
  offsetY: number;
  gridSize: number;
  moved: boolean;
};

type Drag = PanDrag | TokenDrag | PaintDrag | AlignDrag;

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

function readImageSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read map image"));
    img.src = url;
  });
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
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  panRef.current = pan;
  zoomRef.current = zoom;
  const [paintColor, setPaintColor] = useState<string | null>(defaultPaintColor);
  const [preview, setPreview] = useState<{
    kind: "fill" | "edge";
    shape: "rect" | "line";
    start: { x: number; y: number };
    end: { x: number; y: number };
    color: string | null;
    edges?: EdgePatch[];
  } | null>(null);
  const drag = useRef<Drag | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropDepth = useRef(0);
  const alignOffsetRef = useRef({ x: 0, y: 0 });
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const [panHeld, setPanHeld] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [aligning, setAligning] = useState(false);
  const [alignDraft, setAlignDraft] = useState<{
    gridSize: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [alignSquare, setAlignSquare] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileHover, setFileHover] = useState(false);

  const tokens = snapshot?.tokens ?? [];
  const isGm = snapshot?.table.role === "gm";
  const drawing = Boolean(isGm && (tool === "fill" || tool === "edge"));
  const panOverride = panHeld;
  const sceneId = snapshot?.activeSceneId;
  const sceneRef = useRef(sceneId);

  useEffect(() => {
    if (!sceneId || sceneRef.current === sceneId) {
      sceneRef.current = sceneId;
      return;
    }
    sceneRef.current = sceneId;
    const nextPan = { x: 40, y: 40 };
    const nextZoom = 0.75;
    panRef.current = nextPan;
    zoomRef.current = nextZoom;
    setPan(nextPan);
    setZoom(nextZoom);
    drag.current = null;
    setAligning(false);
    setAlignDraft(null);
    setAlignSquare(null);
    setUploadError(null);
    setFileHover(false);
  }, [sceneId]);

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
    const measure = () => setViewSize({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.addEventListener("wheel", prevent, { passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener("wheel", prevent);
    };
  }, [snapshot]);

  function stopAlign() {
    drag.current = null;
    setMapBusy(false);
    setAligning(false);
    setAlignDraft(null);
    setAlignSquare(null);
  }

  useEffect(() => {
    if (!snapshot?.map) return;
    alignOffsetRef.current = { x: snapshot.map.offsetX, y: snapshot.map.offsetY };
  }, [snapshot?.map?.offsetX, snapshot?.map?.offsetY]);

  useEffect(() => {
    if (!aligning) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isTypingTarget(e.target)) {
          (e.target as HTMLElement).blur();
          return;
        }
        stopAlign();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const alignField = (e.target as HTMLElement | null)?.closest?.(".map-align-field");
      // Keep native up/down steppers in the HUD inputs; left/right still nudge the grid.
      if (isTypingTarget(e.target) && (!alignField || e.key === "ArrowUp" || e.key === "ArrowDown")) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      const next = {
        x: alignOffsetRef.current.x + dx,
        y: alignOffsetRef.current.y + dy,
      };
      alignOffsetRef.current = next;
      send({
        type: "update_map",
        patch: {
          ...(dx !== 0 ? { offsetX: next.x } : {}),
          ...(dy !== 0 ? { offsetY: next.y } : {}),
        },
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aligning, send]);

  const map = snapshot?.map;
  const gridType = map?.gridType ?? "square";
  const bounds = useMemo(() => {
    if (!map) return null;
    return cellBoundsForMap(map.width, map.height, map.gridSize, map.offsetX, map.offsetY, map.gridType ?? "square");
  }, [map]);

  const previewFills = preview?.kind === "fill" ? preview : null;

  const previewEdges = useMemo(() => {
    if (!preview || preview.kind !== "edge") return null;
    if (preview.shape === "line") return preview.edges ?? null;
    return rectEdges(
      preview.start.x,
      preview.start.y,
      preview.end.x,
      preview.end.y,
      preview.color,
      gridType,
    );
  }, [preview, gridType]);

  const previewLine = useMemo(() => {
    if (!preview || preview.kind !== "edge" || preview.shape !== "line" || !preview.edges) return null;
    if (isHexGrid(gridType)) return null;
    const vertices = edgeRunVertices(preview.edges);
    if (!vertices) return null;
    return { ...vertices, color: preview.color };
  }, [preview, gridType]);

  if (!snapshot?.map) {
    return (
      <div className="map-stage">
        <div className="map-board" />
      </div>
    );
  }

  const mapState = snapshot.map;

  function worldFromClient(clientX: number, clientY: number) {
    const rect = viewportRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }

  const mapGridType = mapState.gridType ?? "square";
  const tokenSize = isHexGrid(mapGridType) ? hexTokenSize(mapState.gridSize) : mapState.gridSize;

  function cellFromClient(clientX: number, clientY: number) {
    const world = worldFromClient(clientX, clientY);
    return worldToCell(world.x, world.y, mapState.gridSize, mapState.offsetX, mapState.offsetY, mapGridType);
  }

  function edgeFromClient(clientX: number, clientY: number) {
    const world = worldFromClient(clientX, clientY);
    return nearestEdge(world.x, world.y, mapState.gridSize, mapState.offsetX, mapState.offsetY, mapGridType);
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
    return closerEdgeVertex(
      edge,
      world.x,
      world.y,
      mapState.gridSize,
      mapState.offsetX,
      mapState.offsetY,
      mapGridType,
    );
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

    if (isHexGrid(mapGridType)) {
      const edges = hexEdgeRun(current.startEdge, cell, current.color);
      current.edges = edges;
      setPreview({
        kind: "edge",
        shape: "line",
        start: current.startCell,
        end: cell,
        color: current.color,
        edges,
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
          ? floodFill(mapState.fills, current.startCell, current.color, bounds, mapGridType)
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
            mapGridType,
          )
        : [{ ...current.startEdge, color: current.color }];
      if (edges.length > 0) send({ type: "paint_edges", edges, persist: true });
      return;
    }
    const edges = isHexGrid(mapGridType)
      ? hexEdgeRun(current.startEdge, current.currentCell, current.color)
      : straightEdgeRun(
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
      setMapBusy(true);
      startPan(e);
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    if (e.button === 2) e.preventDefault();

    if (aligning && e.button === 0) {
      const world = worldFromClient(e.clientX, e.clientY);
      drag.current = {
        kind: "align",
        mode: e.altKey ? "nudge" : "square",
        startX: world.x,
        startY: world.y,
        originX: world.x,
        originY: world.y,
        offsetX: mapState.offsetX,
        offsetY: mapState.offsetY,
        gridSize: mapState.gridSize,
        moved: false,
      };
      setMapBusy(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (tool === "token" && e.button === 0) {
      const world = worldFromClient(e.clientX, e.clientY);
      const pos = tokenSnapPosition(
        world.x - tokenSize / 2,
        world.y - tokenSize / 2,
        mapState.gridSize,
        mapState.offsetX,
        mapState.offsetY,
        mapState.snap,
        mapGridType,
        tokenSize,
      );
      send({
        type: "place_token",
        x: pos.x,
        y: pos.y,
        label: "Token",
        size: tokenSize,
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
      setMapBusy(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      paintAtPointer(current, e.clientX, e.clientY);
      return;
    }

    if (e.button !== 0) return;
    setMapBusy(true);
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
      const size = tokens.find((t) => t.id === current.id)?.size ?? tokenSize;
      const pos = tokenSnapPosition(
        world.x - current.originX,
        world.y - current.originY,
        mapState.gridSize,
        mapState.offsetX,
        mapState.offsetY,
        mapState.snap,
        mapGridType,
        size,
      );
      send({ type: "move_token", tokenId: current.id, x: pos.x, y: pos.y, persist: false });
      return;
    }
    if (current.kind === "align") {
      const world = worldFromClient(e.clientX, e.clientY);
      if (Math.hypot(world.x - current.startX, world.y - current.startY) > 4) current.moved = true;
      if (current.mode === "nudge") {
        const next = {
          gridSize: current.gridSize,
          offsetX: clampOffset(current.offsetX + (world.x - current.startX)),
          offsetY: clampOffset(current.offsetY + (world.y - current.startY)),
        };
        setAlignDraft(next);
        setAlignSquare(null);
        return;
      }
      const left = Math.min(current.startX, world.x);
      const top = Math.min(current.startY, world.y);
      const width = Math.abs(world.x - current.startX);
      const height = Math.abs(world.y - current.startY);
      setAlignSquare({ x: left, y: top, width, height });
      if (current.moved && (width > 8 || height > 8)) {
        setAlignDraft(
          isHexGrid(mapGridType)
            ? alignFromHexRect(current.startX, current.startY, world.x, world.y, mapGridType)
            : alignFromRect(current.startX, current.startY, world.x, world.y),
        );
      }
      return;
    }
    paintAtPointer(current, e.clientX, e.clientY);
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    drag.current = null;
    setMapBusy(false);
    if (!current) return;
    if (current.kind === "token") {
      const world = worldFromClient(e.clientX, e.clientY);
      const size = tokens.find((t) => t.id === current.id)?.size ?? tokenSize;
      const pos = tokenSnapPosition(
        world.x - current.originX,
        world.y - current.originY,
        mapState.gridSize,
        mapState.offsetX,
        mapState.offsetY,
        mapState.snap,
        mapGridType,
        size,
      );
      send({ type: "move_token", tokenId: current.id, x: pos.x, y: pos.y, persist: true });
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
    if (current.kind === "align") {
      const world = worldFromClient(e.clientX, e.clientY);
      if (current.mode === "nudge" && current.moved) {
        send({
          type: "update_map",
          patch: {
            offsetX: clampOffset(current.offsetX + (world.x - current.startX)),
            offsetY: clampOffset(current.offsetY + (world.y - current.startY)),
          },
        });
      } else if (current.mode === "square" && current.moved) {
        const width = Math.abs(world.x - current.startX);
        const height = Math.abs(world.y - current.startY);
        if (width > 8 || height > 8) {
          send({
            type: "update_map",
            patch: isHexGrid(mapGridType)
              ? alignFromHexRect(current.startX, current.startY, world.x, world.y, mapGridType)
              : alignFromRect(current.startX, current.startY, world.x, world.y),
          });
        }
      }
      setAlignDraft(null);
      setAlignSquare(null);
      return;
    }
    finishPaint(current);
  }

  function onTokenPointerDown(e: ReactPointerEvent<HTMLButtonElement>, tokenId: string) {
    if (isPanGesture(e)) return;
    if (aligning || tool === "token" || drawing) return;
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
    setMapBusy(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function fitToViewport(width: number, height: number) {
    const node = viewportRef.current;
    if (!node) return;
    const next = fitMapInViewport(width, height, node.clientWidth, node.clientHeight, ZOOM_MIN, ZOOM_MAX);
    zoomRef.current = next.zoom;
    panRef.current = next.pan;
    setZoom(next.zoom);
    setPan(next.pan);
  }

  function onClearMapImage() {
    send({ type: "update_map", patch: { imageUrl: null } });
    setUploadError(null);
    stopAlign();
  }

  async function onUploadMap(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    setFileHover(false);
    dropDepth.current = 0;
    try {
      const url = await uploadFile(file);
      const size = await readImageSize(url);
      send({
        type: "update_map",
        patch: {
          imageUrl: url,
          width: size.width,
          height: size.height,
          offsetX: 0,
          offsetY: 0,
        },
      });
      fitToViewport(size.width, size.height);
      setTool("select");
      setAligning(true);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onBoardDragEnter(e: ReactDragEvent<HTMLDivElement>) {
    if (!isGm || !isFileDrag(e)) return;
    e.preventDefault();
    dropDepth.current += 1;
    setFileHover(true);
  }

  function onBoardDragOver(e: ReactDragEvent<HTMLDivElement>) {
    if (!isGm || !isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onBoardDragLeave(e: ReactDragEvent<HTMLDivElement>) {
    if (!isGm) return;
    dropDepth.current = Math.max(0, dropDepth.current - 1);
    if (dropDepth.current === 0) setFileHover(false);
  }

  function onBoardDrop(e: ReactDragEvent<HTMLDivElement>) {
    if (!isGm) return;
    e.preventDefault();
    dropDepth.current = 0;
    setFileHover(false);
    void onUploadMap(imageFromDrop(e));
  }

  function patchAlign(patch: { gridSize?: number; offsetX?: number; offsetY?: number }) {
    send({
      type: "update_map",
      patch: {
        gridSize: patch.gridSize === undefined ? undefined : clampGridSize(patch.gridSize),
        offsetX: patch.offsetX === undefined ? undefined : clampOffset(patch.offsetX),
        offsetY: patch.offsetY === undefined ? undefined : clampOffset(patch.offsetY),
      },
    });
  }

  const grid = alignDraft ?? {
    gridSize: mapState.gridSize,
    offsetX: mapState.offsetX,
    offsetY: mapState.offsetY,
  };

  const viewportClass = [
    "map-viewport",
    aligning || tool === "token" || drawing ? "placing" : "",
    panOverride ? "panning" : "",
    aligning ? "aligning" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="map-stage">
      <div
        className={`map-board ${fileHover ? "is-drop" : ""} ${aligning ? "is-aligning" : ""}`}
        onDragEnter={onBoardDragEnter}
        onDragOver={onBoardDragOver}
        onDragLeave={onBoardDragLeave}
        onDrop={onBoardDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(evt) => {
            void onUploadMap(evt.target.files?.[0]);
            evt.target.value = "";
          }}
        />
        <Toolbar
          paintColor={paintColor}
          setPaintColor={setPaintColor}
          mapBusy={mapBusy}
          aligning={aligning}
          hasMapImage={Boolean(mapState.imageUrl)}
          onUploadMap={(file) => void onUploadMap(file)}
          onClearImage={onClearMapImage}
          onStartAlign={() => {
            setTool("select");
            setAligning(true);
          }}
          onStopAlign={stopAlign}
        />
        {isGm ? (
          <MapDropOverlay
            hasImage={Boolean(mapState.imageUrl)}
            hovering={fileHover}
            uploading={uploading}
            error={uploadError}
            onPick={() => fileInputRef.current?.click()}
          />
        ) : null}
        {aligning && isGm ? (
          <AlignHud
            width={mapState.width}
            height={mapState.height}
            gridSize={grid.gridSize}
            offsetX={grid.offsetX}
            offsetY={grid.offsetY}
            gridType={mapGridType}
            live={Boolean(alignDraft)}
            hasImage={Boolean(mapState.imageUrl)}
            error={uploadError}
            onChange={patchAlign}
            onDone={stopAlign}
            onReplace={() => fileInputRef.current?.click()}
            onClear={onClearMapImage}
          />
        ) : null}
        {uploadError && !aligning && !fileHover && !uploading ? (
          <p className="map-upload-error">{uploadError}</p>
        ) : null}
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
            gridSize={grid.gridSize}
            offsetX={grid.offsetX}
            offsetY={grid.offsetY}
            gridType={mapGridType}
          />
          <GridLayer
            width={mapState.width}
            height={mapState.height}
            gridSize={grid.gridSize}
            offsetX={grid.offsetX}
            offsetY={grid.offsetY}
            gridType={mapGridType}
            aligning={aligning}
            view={{ x: pan.x, y: pan.y, zoom, width: viewSize.w, height: viewSize.h }}
          />
          {alignSquare ? (
            <svg className="map-drawing align-preview" width={mapState.width} height={mapState.height} viewBox={`0 0 ${mapState.width} ${mapState.height}`} preserveAspectRatio="none">
              <rect
                className="map-align-square"
                x={alignSquare.x}
                y={alignSquare.y}
                width={Math.max(1, alignSquare.width)}
                height={Math.max(1, alignSquare.height)}
              />
            </svg>
          ) : null}
          <EdgeLayer
            edges={mapState.edges ?? {}}
            preview={previewEdges}
            linePreview={previewLine}
            width={mapState.width}
            height={mapState.height}
            gridSize={grid.gridSize}
            offsetX={grid.offsetX}
            offsetY={grid.offsetY}
            gridType={mapGridType}
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
      <SceneBar />
    </div>
  );
}
