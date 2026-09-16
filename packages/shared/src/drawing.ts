export type EdgeDir = "h" | "v";

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
  if (!Number.isInteger(x) || !Number.isInteger(y) || (dir !== "h" && dir !== "v")) return null;
  return { x, y, dir };
}

export function asColorMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, color] of Object.entries(value as Record<string, unknown>)) {
    if (typeof color === "string") next[key] = color;
  }
  return next;
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
    const key = edgeKey(patch.x, patch.y, patch.dir);
    if (patch.color === null) delete next[key];
    else next[key] = patch.color;
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
): CellBounds {
  const size = Math.max(1, gridSize);
  return {
    minX: Math.floor((0 - offsetX) / size),
    minY: Math.floor((0 - offsetY) / size),
    maxX: Math.floor((width - 1 - offsetX) / size),
    maxY: Math.floor((height - 1 - offsetY) / size),
  };
}

export function floodFill(
  fills: Record<string, string>,
  start: { x: number; y: number },
  paintColor: string | null,
  bounds: CellBounds,
): CellPatch[] {
  if (!cellInBounds(start.x, start.y, bounds)) return [];
  const target = fills[cellKey(start.x, start.y)] ?? null;
  if (target === paintColor) return [];

  const patches: CellPatch[] = [];
  const seen = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const cell = queue.pop()!;
    if (!cellInBounds(cell.x, cell.y, bounds)) continue;
    const key = cellKey(cell.x, cell.y);
    if (seen.has(key)) continue;
    const color = fills[key] ?? null;
    if (color !== target) continue;
    seen.add(key);
    patches.push({ x: cell.x, y: cell.y, color: paintColor });
    queue.push(
      { x: cell.x + 1, y: cell.y },
      { x: cell.x - 1, y: cell.y },
      { x: cell.x, y: cell.y + 1 },
      { x: cell.x, y: cell.y - 1 },
    );
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
): EdgePatch[] {
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
  const x = start.x;
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const edges: EdgePatch[] = [];
  for (let y = minY; y < maxY; y += 1) {
    edges.push({ x, y, dir: "v", color });
  }
  return edges;
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
  if (!axis) return [{ ...startEdge, color }];
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
  const x = first.x;
  let minY = first.y;
  let maxY = first.y + 1;
  for (const edge of matching) {
    minY = Math.min(minY, edge.y);
    maxY = Math.max(maxY, edge.y + 1);
  }
  return { start: { x, y: minY }, end: { x, y: maxY } };
}
