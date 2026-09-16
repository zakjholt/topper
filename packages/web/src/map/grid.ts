import type { EdgeDir } from "@topper/shared";

export function worldToCell(
  worldX: number,
  worldY: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
) {
  const size = Math.max(1, gridSize);
  return {
    x: Math.floor((worldX - offsetX) / size),
    y: Math.floor((worldY - offsetY) / size),
  };
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
) {
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
): { x: number; y: number; dir: EdgeDir } {
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
  for (; pos < mapLength + size; pos += size) positions.push(pos);
  return positions;
}
