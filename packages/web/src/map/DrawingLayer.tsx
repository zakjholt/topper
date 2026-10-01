import { parseCellKey, parseEdgeKey, type EdgePatch } from "@topper/shared";
import { cellOrigin, cellsToWorldRect, gridLinePositions } from "./grid.ts";

function drawingSvgProps(width: number, height: number) {
  return {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "none" as const,
  };
}

const ERASE_PREVIEW = "#f0e4c8";

function FillRects({
  fills,
  gridSize,
  offsetX,
  offsetY,
}: {
  fills: Record<string, string>;
  gridSize: number;
  offsetX: number;
  offsetY: number;
}) {
  return (
    <>
      {Object.entries(fills).map(([key, color]) => {
        const cell = parseCellKey(key);
        if (!cell) return null;
        const origin = cellOrigin(cell.x, cell.y, gridSize, offsetX, offsetY);
        return (
          <rect
            key={key}
            x={origin.x}
            y={origin.y}
            width={gridSize}
            height={gridSize}
            fill={color}
          />
        );
      })}
    </>
  );
}

function EdgeLines({
  edges,
  gridSize,
  offsetX,
  offsetY,
  opacity = 1,
  preview = false,
}: {
  edges: Record<string, string> | EdgePatch[];
  gridSize: number;
  offsetX: number;
  offsetY: number;
  opacity?: number;
  preview?: boolean;
}) {
  const width = Math.max(6, gridSize * 0.12);
  const entries = Array.isArray(edges)
    ? edges
    : Object.entries(edges).flatMap(([key, color]) => {
        const edge = parseEdgeKey(key);
        return edge ? [{ ...edge, color }] : [];
      });

  return (
    <>
      {entries.map((edge) => {
        const color = edge.color ?? (preview ? ERASE_PREVIEW : null);
        if (!color) return null;
        const origin = cellOrigin(edge.x, edge.y, gridSize, offsetX, offsetY);
        const x2 = edge.dir === "h" ? origin.x + gridSize : origin.x;
        const y2 = edge.dir === "v" ? origin.y + gridSize : origin.y;
        return (
          <line
            key={`${edge.x},${edge.y},${edge.dir}`}
            x1={origin.x}
            y1={origin.y}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={width}
            strokeLinecap="square"
            opacity={opacity}
          />
        );
      })}
    </>
  );
}

export type FillPreview = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  color: string | null;
};

export function FillLayer({
  fills,
  preview,
  width,
  height,
  gridSize,
  offsetX,
  offsetY,
}: {
  fills: Record<string, string>;
  preview?: FillPreview | null;
  width: number;
  height: number;
  gridSize: number;
  offsetX: number;
  offsetY: number;
}) {
  const box = preview
    ? cellsToWorldRect(preview.start, preview.end, gridSize, offsetX, offsetY)
    : null;
  const stroke = Math.max(3, gridSize * 0.06);

  return (
    <svg className="map-drawing fills" {...drawingSvgProps(width, height)}>
      <FillRects fills={fills} gridSize={gridSize} offsetX={offsetX} offsetY={offsetY} />
      {box && preview ? (
        <rect
          className="map-fill-preview"
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill={preview.color ?? ERASE_PREVIEW}
          fillOpacity={preview.color ? 0.5 : 0.28}
          stroke={preview.color ?? "#e07a6c"}
          strokeWidth={stroke}
          strokeDasharray={`${gridSize * 0.2} ${gridSize * 0.12}`}
        />
      ) : null}
    </svg>
  );
}

export function EdgeLayer({
  edges,
  preview,
  linePreview,
  width,
  height,
  gridSize,
  offsetX,
  offsetY,
}: {
  edges: Record<string, string>;
  preview?: EdgePatch[] | null;
  linePreview?: { start: { x: number; y: number }; end: { x: number; y: number }; color: string | null } | null;
  width: number;
  height: number;
  gridSize: number;
  offsetX: number;
  offsetY: number;
}) {
  const widthStroke = Math.max(6, gridSize * 0.12);
  const line =
    linePreview && (linePreview.start.x !== linePreview.end.x || linePreview.start.y !== linePreview.end.y)
      ? {
          a: cellOrigin(linePreview.start.x, linePreview.start.y, gridSize, offsetX, offsetY),
          b: cellOrigin(linePreview.end.x, linePreview.end.y, gridSize, offsetX, offsetY),
          color: linePreview.color ?? ERASE_PREVIEW,
        }
      : null;

  return (
    <svg className="map-drawing edges" {...drawingSvgProps(width, height)}>
      <EdgeLines edges={edges} gridSize={gridSize} offsetX={offsetX} offsetY={offsetY} />
      {preview && preview.length > 0 ? (
        <EdgeLines
          edges={preview}
          gridSize={gridSize}
          offsetX={offsetX}
          offsetY={offsetY}
          opacity={0.55}
          preview
        />
      ) : null}
      {line ? (
        <line
          className="map-edge-preview-line"
          x1={line.a.x}
          y1={line.a.y}
          x2={line.b.x}
          y2={line.b.y}
          stroke={line.color}
          strokeWidth={widthStroke}
          strokeLinecap="square"
          opacity={0.9}
        />
      ) : null}
    </svg>
  );
}

export function GridLayer({
  width,
  height,
  gridSize,
  offsetX,
  offsetY,
  aligning = false,
}: {
  width: number;
  height: number;
  gridSize: number;
  offsetX: number;
  offsetY: number;
  aligning?: boolean;
}) {
  const vertical = gridLinePositions(width, gridSize, offsetX);
  const horizontal = gridLinePositions(height, gridSize, offsetY);
  return (
    <svg className={`map-drawing grid ${aligning ? "is-aligning" : ""}`} {...drawingSvgProps(width, height)}>
      {vertical.map((x) => (
        <line key={`v${x}`} className="map-grid-line" x1={x} y1={0} x2={x} y2={height} />
      ))}
      {horizontal.map((y) => (
        <line key={`h${y}`} className="map-grid-line" x1={0} y1={y} x2={width} y2={y} />
      ))}
    </svg>
  );
}
