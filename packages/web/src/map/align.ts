export const GRID_SIZE_MIN = 8;
export const GRID_SIZE_MAX = 800;

export function clampGridSize(value: number) {
  if (!Number.isFinite(value)) return 70;
  return Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, Math.round(value)));
}

export function clampOffset(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function alignFromRect(x1: number, y1: number, x2: number, y2: number) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return {
    gridSize: clampGridSize((width + height) / 2),
    offsetX: clampOffset(left),
    offsetY: clampOffset(top),
  };
}

export function gridCounts(
  width: number,
  height: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
) {
  const size = Math.max(1, gridSize);
  return {
    cols: Math.max(1, Math.round((width - offsetX) / size)),
    rows: Math.max(1, Math.round((height - offsetY) / size)),
  };
}

export function fitMapInViewport(
  mapWidth: number,
  mapHeight: number,
  viewWidth: number,
  viewHeight: number,
  zoomMin: number,
  zoomMax: number,
  padding = 48,
) {
  const availW = Math.max(1, viewWidth - padding * 2);
  const availH = Math.max(1, viewHeight - padding * 2);
  const zoom = Math.min(zoomMax, Math.max(zoomMin, Math.min(availW / Math.max(1, mapWidth), availH / Math.max(1, mapHeight))));
  return {
    zoom,
    pan: {
      x: (viewWidth - mapWidth * zoom) / 2,
      y: (viewHeight - mapHeight * zoom) / 2,
    },
  };
}

export function isFileDrag(event: { dataTransfer: DataTransfer | null }) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function imageFromDrop(event: { dataTransfer: DataTransfer | null }) {
  const files = event.dataTransfer?.files;
  if (!files) return undefined;
  return Array.from(files).find((file) => file.type.startsWith("image/"));
}
