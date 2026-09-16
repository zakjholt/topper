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
