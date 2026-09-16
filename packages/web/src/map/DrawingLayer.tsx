import { parseCellKey, parseEdgeKey, type CellPatch, type EdgePatch } from "@topper/shared";
import { cellOrigin } from "./grid.ts";

const ERASE_PREVIEW = "#f0e4c8";

function FillRects({
  fills,
  gridSize,
  offsetX,
  offsetY,
  opacity = 1,
  preview = false,
}: {
  fills: Record<string, string> | CellPatch[];
  gridSize: number;
  offsetX: number;
  offsetY: number;
  opacity?: number;
  preview?: boolean;
}) {
  const entries = Array.isArray(fills)
    ? fills
    : Object.entries(fills).flatMap(([key, color]) => {
        const cell = parseCellKey(key);
        return cell ? [{ ...cell, color }] : [];
      });

  return (
    <>
      {entries.map((cell) => {
        const color = cell.color ?? (preview ? ERASE_PREVIEW : null);
        if (!color) return null;
        const origin = cellOrigin(cell.x, cell.y, gridSize, offsetX, offsetY);
        return (
          <rect
            key={`${cell.x},${cell.y}`}
            x={origin.x}
            y={origin.y}
            width={gridSize}
            height={gridSize}
            fill={color}
            opacity={opacity}
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
  preview?: CellPatch[] | null;
  width: number;
  height: number;
  gridSize: number;
  offsetX: number;
  offsetY: number;
}) {
  return (
    <svg className="map-drawing fills" width={width} height={height}>
      <FillRects fills={fills} gridSize={gridSize} offsetX={offsetX} offsetY={offsetY} />
      {preview && preview.length > 0 ? (
        <FillRects
          fills={preview}
          gridSize={gridSize}
          offsetX={offsetX}
          offsetY={offsetY}
          opacity={0.55}
          preview
        />
      ) : null}
    </svg>
  );
}

export function EdgeLayer({
  edges,
  preview,
  width,
  height,
  gridSize,
  offsetX,
  offsetY,
}: {
  edges: Record<string, string>;
  preview?: EdgePatch[] | null;
  width: number;
  height: number;
  gridSize: number;
  offsetX: number;
  offsetY: number;
}) {
  return (
    <svg className="map-drawing edges" width={width} height={height}>
      <EdgeLines edges={edges} gridSize={gridSize} offsetX={offsetX} offsetY={offsetY} />
      {preview && preview.length > 0 ? (
        <EdgeLines
          edges={preview}
          gridSize={gridSize}
          offsetX={offsetX}
          offsetY={offsetY}
          opacity={0.7}
          preview
        />
      ) : null}
    </svg>
  );
}
