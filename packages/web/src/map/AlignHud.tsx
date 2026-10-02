import { isHexGrid, type GridType } from "@topper/shared";
import { GRID_SIZE_MAX, GRID_SIZE_MIN, gridCounts } from "./align.ts";
import { NumberField } from "./NumberField.tsx";

function IconMap() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M3.6 5.4 8 3.8l4 1.6 4.4-1.6v11.2L12 16.6l-4-1.6-4.4 1.6V5.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 3.8v11.2M12 5.4v11.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function AlignHud({
  width,
  height,
  gridSize,
  offsetX,
  offsetY,
  gridType = "square",
  live,
  hasImage,
  error,
  onChange,
  onDone,
  onReplace,
}: {
  width: number;
  height: number;
  gridSize: number;
  offsetX: number;
  offsetY: number;
  gridType?: GridType;
  live: boolean;
  hasImage: boolean;
  error: string | null;
  onChange: (patch: { gridSize?: number; offsetX?: number; offsetY?: number }) => void;
  onDone: () => void;
  onReplace: () => void;
}) {
  const counts = gridCounts(width, height, gridSize, offsetX, offsetY, gridType);
  const cellName = isHexGrid(gridType) ? "hex" : "square";

  return (
    <div className={`map-align ${live ? "is-live" : ""}`} role="dialog" aria-label="Align grid">
      <div className="map-align-head">
        <p>
          Align grid
          <span>
            {counts.cols} × {counts.rows}
          </span>
        </p>
        <button type="button" className="toolbar-palette-done" onClick={onDone}>
          Done
        </button>
      </div>
      <p className="map-align-hint">
        {live
          ? "Release to snap the grid"
          : `Drag one ${cellName} on the map · Alt-drag or arrows to nudge · Esc when it lines up`}
      </p>
      <div className="map-align-fields">
        <label className="map-align-field">
          <span>Size</span>
          <NumberField
            min={GRID_SIZE_MIN}
            max={GRID_SIZE_MAX}
            value={gridSize}
            disabled={live}
            onCommit={(next) => onChange({ gridSize: next })}
          />
        </label>
        <label className="map-align-field">
          <span>X</span>
          <NumberField value={offsetX} disabled={live} onCommit={(next) => onChange({ offsetX: next })} />
        </label>
        <label className="map-align-field">
          <span>Y</span>
          <NumberField value={offsetY} disabled={live} onCommit={(next) => onChange({ offsetY: next })} />
        </label>
      </div>
      <button type="button" className="map-align-replace" onClick={onReplace}>
        {hasImage ? "Replace background" : "Add background"}
      </button>
      {error ? <p className="map-align-error">{error}</p> : null}
    </div>
  );
}

export function MapDropOverlay({
  hasImage,
  hovering,
  uploading,
  error,
  onPick,
}: {
  hasImage: boolean;
  hovering: boolean;
  uploading: boolean;
  error: string | null;
  onPick: () => void;
}) {
  // Background images are optional — only interrupt the board while dragging/uploading.
  if (!uploading && !hovering) return null;

  const title = uploading ? "Uploading background" : hasImage ? "Drop to replace" : "Drop to add background";
  const subtitle = uploading ? "Hang on a moment" : "png · jpeg · webp · gif";

  return (
    <div className={`map-drop ${hovering ? "is-hot" : ""} ${uploading ? "is-busy" : ""}`}>
      <button type="button" className="map-drop-card" onClick={onPick} disabled={uploading}>
        <span className="map-drop-icon">
          <IconMap />
        </span>
        <p>{title}</p>
        <span>{subtitle}</span>
        {error ? <span className="map-align-error">{error}</span> : null}
      </button>
    </div>
  );
}
