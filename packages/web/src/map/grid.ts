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
