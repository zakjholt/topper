import { useMemo } from "react";
import {
  asHexDir,
  cellPolygon,
  cellsInRect,
  hexEdgeEndpoints,
  isHexGrid,
  parseCellKey,
  parseEdgeKey,
  polygonPointsAttr,
  rectCells,
  type EdgePatch,
  type GridType,
} from "@topper/shared";
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
const MIN_HEX_SCREEN_PX = 6;

export type GridView = {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
};

function hexGridPath(
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridType: GridType,
  view: GridView,
) {
  if (view.width <= 0 || view.height <= 0 || view.zoom <= 0) return "";
  if (gridSize * view.zoom < MIN_HEX_SCREEN_PX) return "";
  const step = Math.max(1, gridSize);
  const worldX = Math.floor(-view.x / view.zoom / step) * step;
  const worldY = Math.floor(-view.y / view.zoom / step) * step;
  const round = (n: number) => Math.round(n * 10) / 10;
  let d = "";
  for (const cell of cellsInRect(
    worldX,
    worldY,
    worldX + view.width / view.zoom,
    worldY + view.height / view.zoom,
    gridSize,
    offsetX,
    offsetY,
    gridType,
  )) {
    const points = cellPolygon(cell.x, cell.y, gridSize, offsetX, offsetY, gridType);
    d += `M${round(points[0]!.x)},${round(points[0]!.y)}`;
    for (let i = 1; i < points.length; i += 1) d += `L${round(points[i]!.x)},${round(points[i]!.y)}`;
    d += "Z";
  }
  return d;
}

function FillShapes({
  fills,
  gridSize,
  offsetX,
  offsetY,
  gridType,
}: {
  fills: Record<string, string>;
  gridSize: number;
  offsetX: number;
  offsetY: number;
  gridType: GridType;
}) {
  return (
    <>
      {Object.entries(fills).map(([key, color]) => {
        const cell = parseCellKey(key);
        if (!cell) return null;
        if (isHexGrid(gridType)) {
          const points = cellPolygon(cell.x, cell.y, gridSize, offsetX, offsetY, gridType);
          return <polygon key={key} points={polygonPointsAttr(points)} fill={color} />;
        }
        const origin = cellOrigin(cell.x, cell.y, gridSize, offsetX, offsetY);
        return <rect key={key} x={origin.x} y={origin.y} width={gridSize} height={gridSize} fill={color} />;
      })}
    </>
  );
}

function EdgeLines({
  edges,
  gridSize,
  offsetX,
  offsetY,
  gridType,
  opacity = 1,
  preview = false,
}: {
  edges: Record<string, string> | EdgePatch[];
  gridSize: number;
  offsetX: number;
  offsetY: number;
  gridType: GridType;
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
        if (isHexGrid(gridType)) {
          const dir = asHexDir(edge.dir);
          if (dir === null) return null;
          const { a, b } = hexEdgeEndpoints(edge.x, edge.y, dir, gridSize, offsetX, offsetY, gridType);
          return (
            <line
              key={`${edge.x},${edge.y},${edge.dir}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={width}
              strokeLinecap="round"
              opacity={opacity}
            />
          );
        }
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
  gridType = "square",
}: {
  fills: Record<string, string>;
  preview?: FillPreview | null;
  width: number;
  height: number;
  gridSize: number;
  offsetX: number;
  offsetY: number;
  gridType?: GridType;
}) {
  const stroke = Math.max(3, gridSize * 0.06);
  const hexPreview =
    preview && isHexGrid(gridType)
      ? rectCells(preview.start.x, preview.start.y, preview.end.x, preview.end.y, preview.color)
      : null;
  const box =
    preview && !isHexGrid(gridType)
      ? cellsToWorldRect(preview.start, preview.end, gridSize, offsetX, offsetY)
      : null;

  return (
    <svg className="map-drawing fills" {...drawingSvgProps(width, height)}>
      <FillShapes fills={fills} gridSize={gridSize} offsetX={offsetX} offsetY={offsetY} gridType={gridType} />
      {hexPreview && preview
        ? hexPreview.map((cell) => {
            const points = cellPolygon(cell.x, cell.y, gridSize, offsetX, offsetY, gridType);
            return (
              <polygon
                key={`preview-${cell.x},${cell.y}`}
                className="map-fill-preview"
                points={polygonPointsAttr(points)}
                fill={preview.color ?? ERASE_PREVIEW}
                fillOpacity={preview.color ? 0.5 : 0.28}
                stroke={preview.color ?? "#e07a6c"}
                strokeWidth={stroke}
                strokeDasharray={`${gridSize * 0.2} ${gridSize * 0.12}`}
              />
            );
          })
        : null}
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
  gridType = "square",
}: {
  edges: Record<string, string>;
  preview?: EdgePatch[] | null;
  linePreview?: { start: { x: number; y: number }; end: { x: number; y: number }; color: string | null } | null;
  width: number;
  height: number;
  gridSize: number;
  offsetX: number;
  offsetY: number;
  gridType?: GridType;
}) {
  const widthStroke = Math.max(6, gridSize * 0.12);
  const line =
    !isHexGrid(gridType) &&
    linePreview &&
    (linePreview.start.x !== linePreview.end.x || linePreview.start.y !== linePreview.end.y)
      ? {
          a: cellOrigin(linePreview.start.x, linePreview.start.y, gridSize, offsetX, offsetY),
          b: cellOrigin(linePreview.end.x, linePreview.end.y, gridSize, offsetX, offsetY),
          color: linePreview.color ?? ERASE_PREVIEW,
        }
      : null;

  return (
    <svg className="map-drawing edges" {...drawingSvgProps(width, height)}>
      <EdgeLines edges={edges} gridSize={gridSize} offsetX={offsetX} offsetY={offsetY} gridType={gridType} />
      {preview && preview.length > 0 ? (
        <EdgeLines
          edges={preview}
          gridSize={gridSize}
          offsetX={offsetX}
          offsetY={offsetY}
          gridType={gridType}
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
  gridType = "square",
  aligning = false,
  view,
}: {
  width: number;
  height: number;
  gridSize: number;
  offsetX: number;
  offsetY: number;
  gridType?: GridType;
  aligning?: boolean;
  view?: GridView;
}) {
  const step = Math.max(1, gridSize);
  const zoom = view?.zoom ?? 1;
  const viewWidth = view?.width ?? 0;
  const viewHeight = view?.height ?? 0;
  const cellX = view && zoom > 0 ? Math.floor(-view.x / zoom / step) : 0;
  const cellY = view && zoom > 0 ? Math.floor(-view.y / zoom / step) : 0;
  const hexPath = useMemo(() => {
    if (!isHexGrid(gridType) || zoom <= 0) return "";
    return hexGridPath(gridSize, offsetX, offsetY, gridType, {
      x: -cellX * step * zoom,
      y: -cellY * step * zoom,
      zoom,
      width: viewWidth,
      height: viewHeight,
    });
  }, [cellX, cellY, gridSize, gridType, offsetX, offsetY, step, viewHeight, viewWidth, zoom]);

  if (isHexGrid(gridType)) {
    return (
      <svg className={`map-drawing grid ${aligning ? "is-aligning" : ""}`} {...drawingSvgProps(width, height)}>
        {hexPath ? <path className="map-grid-hex" d={hexPath} /> : null}
      </svg>
    );
  }

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
