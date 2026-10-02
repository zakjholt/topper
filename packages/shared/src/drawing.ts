import {
  asHexDir,
  canonicalizeHexEdge,
  cellBoundsForMap as geometryCellBoundsForMap,
  hexLine,
  hexNeighbors,
  isHexGrid,
  sharedHexDir,
  type GridType,
  type HexDir,
} from "./gridGeometry.ts";

export type EdgeDir = "h" | "v" | "0" | "1" | "2" | "3" | "4" | "5";

export type CellPatch = {
  x: number;
  y: number;
  color: string | null;
};

export type EdgePatch = {
  x: number;
  y: number;
  dir: EdgeDir;
  color: string | null;
};

export type CellBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const EDGE_DIRS = new Set<string>(["h", "v", "0", "1", "2", "3", "4", "5"]);

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function edgeKey(x: number, y: number, dir: EdgeDir): string {
  return `${x},${y},${dir}`;
}

export function parseCellKey(key: string): { x: number; y: number } | null {
  const [xs, ys] = key.split(",");
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

export function parseEdgeKey(key: string): { x: number; y: number; dir: EdgeDir } | null {
  const parts = key.split(",");
  if (parts.length !== 3) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const dir = parts[2];
  if (!Number.isInteger(x) || !Number.isInteger(y) || !dir || !EDGE_DIRS.has(dir)) return null;
  return { x, y, dir: dir as EdgeDir };
}

export function asColorMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, color] of Object.entries(value as Record<string, unknown>)) {
    if (typeof color === "string") next[key] = color;
  }
  return next;
}

export function normalizeEdgePatch(patch: EdgePatch): EdgePatch {
  const hexDir = asHexDir(patch.dir);
  if (hexDir === null) return patch;
  const canonical = canonicalizeHexEdge(patch.x, patch.y, hexDir);
  return { x: canonical.x, y: canonical.y, dir: canonical.dir, color: patch.color };
}

export function mergeFills(current: Record<string, string>, patches: CellPatch[]): Record<string, string> {
  const next = { ...current };
  for (const patch of patches) {
    const key = cellKey(patch.x, patch.y);
    if (patch.color === null) delete next[key];
    else next[key] = patch.color;
  }
  return next;
}

export function mergeEdges(current: Record<string, string>, patches: EdgePatch[]): Record<string, string> {
  const next = { ...current };
  for (const patch of patches) {
    const normalized = normalizeEdgePatch(patch);
    const key = edgeKey(normalized.x, normalized.y, normalized.dir);
    if (normalized.color === null) delete next[key];
    else next[key] = normalized.color;
  }
  return next;
}

export function cellInBounds(x: number, y: number, bounds: CellBounds): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

export function clampCell(cell: { x: number; y: number }, bounds: CellBounds) {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, cell.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, cell.y)),
  };
}

export function cellBoundsForMap(
  width: number,
  height: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType = "square",
): CellBounds {
  return geometryCellBoundsForMap(width, height, gridSize, offsetX, offsetY, gridType);
}

export function floodFill(
  fills: Record<string, string>,
  start: { x: number; y: number },
  paintColor: string | null,
  bounds: CellBounds,
  gridType: GridType = "square",
): CellPatch[] {
  if (!cellInBounds(start.x, start.y, bounds)) return [];
  const target = fills[cellKey(start.x, start.y)] ?? null;
  if (target === paintColor) return [];

  const patches: CellPatch[] = [];
  const seen = new Set<string>();
  const queue = [start];
  const neighborFn = isHexGrid(gridType)
    ? (cell: { x: number; y: number }) => hexNeighbors(cell.x, cell.y)
    : (cell: { x: number; y: number }) => [
        { x: cell.x + 1, y: cell.y },
        { x: cell.x - 1, y: cell.y },
        { x: cell.x, y: cell.y + 1 },
        { x: cell.x, y: cell.y - 1 },
      ];

  while (queue.length > 0) {
    const cell = queue.pop()!;
    if (!cellInBounds(cell.x, cell.y, bounds)) continue;
    const key = cellKey(cell.x, cell.y);
    if (seen.has(key)) continue;
    const color = fills[key] ?? null;
    if (color !== target) continue;
    seen.add(key);
    patches.push({ x: cell.x, y: cell.y, color: paintColor });
    queue.push(...neighborFn(cell));
  }

  return patches;
}

export function rectCells(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string | null,
  bounds?: CellBounds,
): CellPatch[] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const cells: CellPatch[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (bounds && !cellInBounds(x, y, bounds)) continue;
      cells.push({ x, y, color });
    }
  }
  return cells;
}

export function rectEdges(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string | null,
  gridType: GridType = "square",
): EdgePatch[] {
  if (!isHexGrid(gridType)) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const edges: EdgePatch[] = [];
    for (let x = minX; x <= maxX; x += 1) {
      edges.push({ x, y: minY, dir: "h", color });
      edges.push({ x, y: maxY + 1, dir: "h", color });
    }
    for (let y = minY; y <= maxY; y += 1) {
      edges.push({ x: minX, y, dir: "v", color });
      edges.push({ x: maxX + 1, y, dir: "v", color });
    }
    return edges;
  }

  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const inside = new Set<string>();
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) inside.add(cellKey(x, y));
  }
  const edges: EdgePatch[] = [];
  const seen = new Set<string>();
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      for (let d = 0; d < 6; d += 1) {
        const dir = d as HexDir;
        const n = hexNeighbors(x, y)[dir]!;
        if (inside.has(cellKey(n.x, n.y))) continue;
        const canonical = canonicalizeHexEdge(x, y, dir);
        const key = edgeKey(canonical.x, canonical.y, canonical.dir);
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ x: canonical.x, y: canonical.y, dir: canonical.dir, color });
      }
    }
  }
  return edges;
}

export function axisLineEdges(
  start: { x: number; y: number },
  end: { x: number; y: number },
  axis: EdgeDir,
  color: string | null,
): EdgePatch[] {
  if (axis === "h") {
    const y = start.y;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const edges: EdgePatch[] = [];
    for (let x = minX; x < maxX; x += 1) {
      edges.push({ x, y, dir: "h", color });
    }
    return edges;
  }
  if (axis === "v") {
    const x = start.x;
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const edges: EdgePatch[] = [];
    for (let y = minY; y < maxY; y += 1) {
      edges.push({ x, y, dir: "v", color });
    }
    return edges;
  }
  return [];
}

function sameEdge(
  a: { x: number; y: number; dir: EdgeDir },
  b: { x: number; y: number; dir: EdgeDir },
) {
  return a.x === b.x && a.y === b.y && a.dir === b.dir;
}

export function straightEdgeRun(
  startEdge: { x: number; y: number; dir: EdgeDir },
  startVertex: { x: number; y: number },
  currentVertex: { x: number; y: number },
  axis: EdgeDir | null,
  color: string | null,
): EdgePatch[] {
  if (!axis || (axis !== "h" && axis !== "v")) return [{ ...startEdge, color }];
  const end =
    axis === "h"
      ? { x: currentVertex.x, y: startVertex.y }
      : { x: startVertex.x, y: currentVertex.y };
  const edges = axisLineEdges(startVertex, end, axis, color);
  if (startEdge.dir === axis && !edges.some((edge) => sameEdge(edge, startEdge))) {
    edges.push({ ...startEdge, color });
  }
  return edges.length > 0 ? edges : [{ ...startEdge, color }];
}

/** Paint the locked hex edge direction along a hex line of cells. */
export function hexEdgeRun(
  startEdge: { x: number; y: number; dir: EdgeDir },
  endCell: { x: number; y: number },
  color: string | null,
): EdgePatch[] {
  const dir = asHexDir(startEdge.dir);
  if (dir === null) return [{ ...normalizeEdgePatch({ ...startEdge, color }) }];
  const line = hexLine({ x: startEdge.x, y: startEdge.y }, endCell);
  const edges: EdgePatch[] = [];
  const seen = new Set<string>();
  for (const cell of line) {
    const canonical = canonicalizeHexEdge(cell.x, cell.y, dir);
    const key = edgeKey(canonical.x, canonical.y, canonical.dir);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ x: canonical.x, y: canonical.y, dir: canonical.dir, color });
  }
  if (edges.length === 0) {
    const canonical = canonicalizeHexEdge(startEdge.x, startEdge.y, dir);
    edges.push({ x: canonical.x, y: canonical.y, dir: canonical.dir, color });
  }
  return edges;
}

/** Shared edges along a hex line (walls between consecutive cells). */
export function hexLineSharedEdges(
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string | null,
): EdgePatch[] {
  const line = hexLine(start, end);
  const edges: EdgePatch[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const dir = sharedHexDir(a, b);
    if (dir === null) continue;
    const canonical = canonicalizeHexEdge(a.x, a.y, dir);
    const key = edgeKey(canonical.x, canonical.y, canonical.dir);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ x: canonical.x, y: canonical.y, dir: canonical.dir, color });
  }
  return edges;
}

export function edgeRunVertices(edges: EdgePatch[]) {
  const matching = edges.filter((edge) => edge.dir === edges[0]?.dir);
  const first = matching[0];
  if (!first) return null;
  if (first.dir === "h") {
    const y = first.y;
    let minX = first.x;
    let maxX = first.x + 1;
    for (const edge of matching) {
      minX = Math.min(minX, edge.x);
      maxX = Math.max(maxX, edge.x + 1);
    }
    return { start: { x: minX, y }, end: { x: maxX, y } };
  }
  if (first.dir === "v") {
    const x = first.x;
    let minY = first.y;
    let maxY = first.y + 1;
    for (const edge of matching) {
      minY = Math.min(minY, edge.y);
      maxY = Math.max(maxY, edge.y + 1);
    }
    return { start: { x, y: minY }, end: { x, y: maxY } };
  }
  return {
    start: { x: first.x, y: first.y },
    end: { x: matching[matching.length - 1]!.x, y: matching[matching.length - 1]!.y },
  };
}
