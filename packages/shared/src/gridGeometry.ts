export const GRID_TYPES = ["square", "hexFlat", "hexPointy"] as const;
export type GridType = (typeof GRID_TYPES)[number];

export function isGridType(value: unknown): value is GridType {
  return value === "square" || value === "hexFlat" || value === "hexPointy";
}

export function isHexGrid(gridType: GridType | string | null | undefined) {
  return gridType === "hexFlat" || gridType === "hexPointy";
}

const SQRT3 = Math.sqrt(3);

/** Axial neighbor deltas — same for flat and pointy. */
export const HEX_DIRECTIONS = [
  { x: 1, y: 0 },
  { x: 1, y: -1 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
] as const;

export type HexDir = 0 | 1 | 2 | 3 | 4 | 5;

export function asHexDir(dir: string | number): HexDir | null {
  const n = typeof dir === "number" ? dir : Number(dir);
  if (!Number.isInteger(n) || n < 0 || n > 5) return null;
  return n as HexDir;
}

export function hexNeighbor(x: number, y: number, dir: HexDir) {
  const d = HEX_DIRECTIONS[dir];
  return { x: x + d.x, y: y + d.y };
}

export function hexNeighbors(x: number, y: number) {
  return HEX_DIRECTIONS.map((d) => ({ x: x + d.x, y: y + d.y }));
}

export function oppositeHexDir(dir: HexDir): HexDir {
  return ((dir + 3) % 6) as HexDir;
}

/** Store each shared edge once using dirs 0–2 on the owning cell. */
export function canonicalizeHexEdge(x: number, y: number, dir: HexDir) {
  if (dir <= 2) return { x, y, dir: String(dir) as "0" | "1" | "2" };
  const n = hexNeighbor(x, y, dir);
  return { x: n.x, y: n.y, dir: String(oppositeHexDir(dir)) as "0" | "1" | "2" };
}

export function hexWidth(gridSize: number, gridType: "hexFlat" | "hexPointy") {
  const size = Math.max(1, gridSize);
  return gridType === "hexFlat" ? 2 * size : SQRT3 * size;
}

export function hexHeight(gridSize: number, gridType: "hexFlat" | "hexPointy") {
  const size = Math.max(1, gridSize);
  return gridType === "hexFlat" ? SQRT3 * size : 2 * size;
}

/** Token / inscribed diameter (flat-to-flat). */
export function hexTokenSize(gridSize: number) {
  return SQRT3 * Math.max(1, gridSize);
}

export function cellCenter(
  x: number,
  y: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType,
) {
  const size = Math.max(1, gridSize);
  if (gridType === "square") {
    return {
      x: offsetX + x * size + size / 2,
      y: offsetY + y * size + size / 2,
    };
  }
  if (gridType === "hexFlat") {
    return {
      x: offsetX + size * (1.5 * x),
      y: offsetY + size * (SQRT3 * (y + x / 2)),
    };
  }
  return {
    x: offsetX + size * (SQRT3 * (x + y / 2)),
    y: offsetY + size * (1.5 * y),
  };
}

export function cellPolygon(
  x: number,
  y: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType,
): Array<{ x: number; y: number }> {
  const size = Math.max(1, gridSize);
  if (gridType === "square") {
    const left = offsetX + x * size;
    const top = offsetY + y * size;
    return [
      { x: left, y: top },
      { x: left + size, y: top },
      { x: left + size, y: top + size },
      { x: left, y: top + size },
    ];
  }
  const center = cellCenter(x, y, size, offsetX, offsetY, gridType);
  const start = gridType === "hexFlat" ? 0 : -Math.PI / 6;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = start + (Math.PI / 3) * i;
    points.push({
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    });
  }
  return points;
}

export function polygonPointsAttr(points: Array<{ x: number; y: number }>) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function axialRound(q: number, r: number) {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
  else if (rDiff > sDiff) rr = -rq - rs;
  return { x: rq, y: rr };
}

export function worldToCell(
  worldX: number,
  worldY: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType = "square",
) {
  const size = Math.max(1, gridSize);
  if (gridType === "square") {
    return {
      x: Math.floor((worldX - offsetX) / size),
      y: Math.floor((worldY - offsetY) / size),
    };
  }
  const px = worldX - offsetX;
  const py = worldY - offsetY;
  if (gridType === "hexFlat") {
    const q = ((2 / 3) * px) / size;
    const r = ((-1 / 3) * px + (SQRT3 / 3) * py) / size;
    return axialRound(q, r);
  }
  const q = ((SQRT3 / 3) * px - (1 / 3) * py) / size;
  const r = ((2 / 3) * py) / size;
  return axialRound(q, r);
}

export function cellBoundsForMap(
  width: number,
  height: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType = "square",
) {
  const size = Math.max(1, gridSize);
  if (gridType === "square") {
    return {
      minX: Math.floor((0 - offsetX) / size),
      minY: Math.floor((0 - offsetY) / size),
      maxX: Math.floor((width - 1 - offsetX) / size),
      maxY: Math.floor((height - 1 - offsetY) / size),
    };
  }
  const samples: Array<[number, number]> = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
    [width / 2, 0],
    [width / 2, height],
    [0, height / 2],
    [width, height / 2],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of samples) {
    const cell = worldToCell(x, y, size, offsetX, offsetY, gridType);
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x);
    maxY = Math.max(maxY, cell.y);
  }
  return {
    minX: minX - 1,
    minY: minY - 1,
    maxX: maxX + 1,
    maxY: maxY + 1,
  };
}

/** Above this, a hex lattice is too dense to draw without exhausting memory. */
export const MAX_GRID_CELLS = 20000;

export function cellsInRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType,
  limit = MAX_GRID_CELLS,
) {
  const size = Math.max(1, gridSize);
  const pad = size * 2;
  const left = Math.min(x0, x1) - pad;
  const right = Math.max(x0, x1) + pad;
  const top = Math.min(y0, y1) - pad;
  const bottom = Math.max(y0, y1) + pad;
  const samples: Array<[number, number]> = [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
    [(left + right) / 2, top],
    [(left + right) / 2, bottom],
    [left, (top + bottom) / 2],
    [right, (top + bottom) / 2],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of samples) {
    const cell = worldToCell(x, y, size, offsetX, offsetY, gridType);
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x);
    maxY = Math.max(maxY, cell.y);
  }
  minX -= 1;
  minY -= 1;
  maxX += 1;
  maxY += 1;
  const span = (maxX - minX + 1) * (maxY - minY + 1);
  if (!Number.isFinite(span) || span > limit) return [];
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const center = cellCenter(x, y, size, offsetX, offsetY, gridType);
      if (center.x < left || center.y < top || center.x > right || center.y > bottom) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

export function cellsInMap(
  width: number,
  height: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType,
) {
  return cellsInRect(0, 0, width, height, gridSize, offsetX, offsetY, gridType);
}

export function hexEdgeEndpoints(
  x: number,
  y: number,
  dir: HexDir,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: "hexFlat" | "hexPointy",
) {
  const poly = cellPolygon(x, y, gridSize, offsetX, offsetY, gridType);
  // Vertex i is shared by edges; flat-top vertex 0 is east, edge 0 connects v0–v1 matching +q neighbor.
  const a = poly[dir]!;
  const b = poly[(dir + 1) % 6]!;
  return { a, b };
}

export function nearestHexEdge(
  worldX: number,
  worldY: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: "hexFlat" | "hexPointy",
) {
  const cell = worldToCell(worldX, worldY, gridSize, offsetX, offsetY, gridType);
  let best: { x: number; y: number; dir: HexDir; dist: number } | null = null;
  const candidates = [cell, ...hexNeighbors(cell.x, cell.y)];
  for (const c of candidates) {
    for (let d = 0; d < 6; d += 1) {
      const dir = d as HexDir;
      const { a, b } = hexEdgeEndpoints(c.x, c.y, dir, gridSize, offsetX, offsetY, gridType);
      const dist = pointSegmentDistance(worldX, worldY, a.x, a.y, b.x, b.y);
      if (!best || dist < best.dist) best = { x: c.x, y: c.y, dir, dist };
    }
  }
  const edge = best ?? { x: cell.x, y: cell.y, dir: 0 as HexDir, dist: 0 };
  const canonical = canonicalizeHexEdge(edge.x, edge.y, edge.dir);
  return { x: canonical.x, y: canonical.y, dir: canonical.dir };
}

function pointSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function cubeDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const as = -a.x - a.y;
  const bs = -b.x - b.y;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(as - bs));
}

function cubeLerp(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  const as = -a.x - a.y;
  const bs = -b.x - b.y;
  return axialRound(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
}

export function hexLine(a: { x: number; y: number }, b: { x: number; y: number }) {
  const n = cubeDistance(a, b);
  if (n === 0) return [a];
  const line: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i += 1) {
    line.push(cubeLerp(a, b, i / n));
  }
  return line;
}

export function sharedHexDir(
  a: { x: number; y: number },
  b: { x: number; y: number },
): HexDir | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const idx = HEX_DIRECTIONS.findIndex((d) => d.x === dx && d.y === dy);
  return idx >= 0 ? (idx as HexDir) : null;
}

export function gridCounts(
  width: number,
  height: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType = "square",
) {
  const size = Math.max(1, gridSize);
  if (gridType === "square") {
    return {
      cols: Math.max(1, Math.round((width - offsetX) / size)),
      rows: Math.max(1, Math.round((height - offsetY) / size)),
    };
  }
  const w = hexWidth(size, gridType);
  const h = hexHeight(size, gridType);
  const colPitch = gridType === "hexFlat" ? 1.5 * size : w;
  const rowPitch = gridType === "hexFlat" ? h : 1.5 * size;
  return {
    cols: Math.max(1, Math.round((width - offsetX) / colPitch)),
    rows: Math.max(1, Math.round((height - offsetY) / rowPitch)),
  };
}
