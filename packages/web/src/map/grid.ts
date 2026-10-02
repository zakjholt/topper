import {
  asHexDir,
  cellCenter,
  hexEdgeEndpoints,
  hexNeighbor,
  isHexGrid,
  nearestHexEdge,
  worldToCell as sharedWorldToCell,
  type EdgeDir,
  type GridType,
} from "@topper/shared";

export function worldToCell(
  worldX: number,
  worldY: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType = "square",
) {
  return sharedWorldToCell(worldX, worldY, gridSize, offsetX, offsetY, gridType);
}

export function nearestVertex(
  worldX: number,
  worldY: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
) {
  const size = Math.max(1, gridSize);
  return {
    x: Math.round((worldX - offsetX) / size),
    y: Math.round((worldY - offsetY) / size),
  };
}

export function closerEdgeVertex(
  edge: { x: number; y: number; dir: EdgeDir },
  worldX: number,
  worldY: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType = "square",
) {
  if (isHexGrid(gridType)) {
    const dir = asHexDir(edge.dir);
    if (dir !== null) {
      const { a, b } = hexEdgeEndpoints(edge.x, edge.y, dir, gridSize, offsetX, offsetY, gridType);
      const da = Math.hypot(worldX - a.x, worldY - a.y);
      const db = Math.hypot(worldX - b.x, worldY - b.y);
      return da <= db ? { x: edge.x, y: edge.y } : hexNeighbor(edge.x, edge.y, dir);
    }
  }
  if (edge.dir !== "h" && edge.dir !== "v") return { x: edge.x, y: edge.y };
  const vertex = nearestVertex(worldX, worldY, gridSize, offsetX, offsetY);
  if (edge.dir === "h") {
    const left = { x: edge.x, y: edge.y };
    const right = { x: edge.x + 1, y: edge.y };
    return Math.abs(vertex.x - left.x) <= Math.abs(vertex.x - right.x) ? left : right;
  }
  const top = { x: edge.x, y: edge.y };
  const bottom = { x: edge.x, y: edge.y + 1 };
  return Math.abs(vertex.y - top.y) <= Math.abs(vertex.y - bottom.y) ? top : bottom;
}

export function nearestEdge(
  worldX: number,
  worldY: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType = "square",
): { x: number; y: number; dir: EdgeDir } {
  if (isHexGrid(gridType)) {
    return nearestHexEdge(worldX, worldY, gridSize, offsetX, offsetY, gridType);
  }
  const size = Math.max(1, gridSize);
  const localX = worldX - offsetX;
  const localY = worldY - offsetY;
  const gx = Math.floor(localX / size);
  const gy = Math.floor(localY / size);
  const fx = localX - gx * size;
  const fy = localY - gy * size;
  const distLeft = fx;
  const distRight = size - fx;
  const distTop = fy;
  const distBottom = size - fy;
  const min = Math.min(distLeft, distRight, distTop, distBottom);
  if (min === distLeft) return { x: gx, y: gy, dir: "v" };
  if (min === distRight) return { x: gx + 1, y: gy, dir: "v" };
  if (min === distTop) return { x: gx, y: gy, dir: "h" };
  return { x: gx, y: gy + 1, dir: "h" };
}

export function cellOrigin(cx: number, cy: number, gridSize: number, offsetX: number, offsetY: number) {
  return {
    x: offsetX + cx * gridSize,
    y: offsetY + cy * gridSize,
  };
}

export function cellsToWorldRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  gridSize: number,
  offsetX: number,
  offsetY: number,
) {
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxX = Math.max(start.x, end.x);
  const maxY = Math.max(start.y, end.y);
  const origin = cellOrigin(minX, minY, gridSize, offsetX, offsetY);
  return {
    x: origin.x,
    y: origin.y,
    width: (maxX - minX + 1) * gridSize,
    height: (maxY - minY + 1) * gridSize,
  };
}

export function gridLinePositions(mapLength: number, gridSize: number, offset: number) {
  const size = Math.max(1, gridSize);
  let pos = offset % size;
  if (pos > 0) pos -= size;
  const positions: number[] = [];
  for (; pos <= mapLength; pos += size) {
    if (pos >= 0) positions.push(pos);
  }
  if (positions.length === 0 || positions[positions.length - 1] !== mapLength) {
    positions.push(mapLength);
  }
  return positions;
}

export function tokenSnapPosition(
  worldX: number,
  worldY: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  snap: boolean,
  gridType: GridType,
  tokenSize: number,
) {
  if (!snap) return { x: worldX, y: worldY };
  if (isHexGrid(gridType)) {
    const cell = worldToCell(worldX + tokenSize / 2, worldY + tokenSize / 2, gridSize, offsetX, offsetY, gridType);
    const center = cellCenter(cell.x, cell.y, gridSize, offsetX, offsetY, gridType);
    return { x: center.x - tokenSize / 2, y: center.y - tokenSize / 2 };
  }
  const size = Math.max(1, gridSize);
  return {
    x: Math.round((worldX - offsetX) / size) * size + offsetX,
    y: Math.round((worldY - offsetY) / size) * size + offsetY,
  };
}

export { cellCenter };
