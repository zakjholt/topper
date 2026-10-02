export type { FieldDef, FieldType, ResourceValue, SectionDef, SheetSchema } from "./sheets/types.ts";
export { genericSchema } from "./sheets/schemas/generic.ts";
export { getSheetSchema, listSheetSchemas, sheetSchemas } from "./sheets/registry.ts";
export { evaluateFormula, tryEvaluateFormula } from "./sheets/formula.ts";
export {
  cloneJson,
  createEmptyDocument,
  defaultForField,
  getByPath,
  setByPath,
  splitPath,
} from "./sheets/document.ts";
export { parseDiceExpression, rollDice } from "./dice.ts";
export type { DiceRollResult } from "./dice.ts";
export { cellPatchSchema, clientActionSchema, edgePatchSchema, gridTypeSchema } from "./protocol.ts";
export type {
  CharacterState,
  ClientAction,
  DiceLogEntry,
  MapState,
  MemberRole,
  PresenceMember,
  SceneInfo,
  ServerEvent,
  TableInfo,
  TableSnapshot,
  TokenState,
} from "./protocol.ts";
export {
  asColorMap,
  cellBoundsForMap,
  cellInBounds,
  cellKey,
  clampCell,
  edgeKey,
  edgeRunVertices,
  floodFill,
  hexEdgeRun,
  hexLineSharedEdges,
  mergeEdges,
  mergeFills,
  normalizeEdgePatch,
  parseCellKey,
  parseEdgeKey,
  rectCells,
  rectEdges,
  straightEdgeRun,
} from "./drawing.ts";
export type { CellBounds, CellPatch, EdgeDir, EdgePatch } from "./drawing.ts";
export {
  GRID_TYPES,
  asHexDir,
  canonicalizeHexEdge,
  cellCenter,
  cellPolygon,
  cellsInMap,
  cellsInRect,
  gridCounts,
  hexEdgeEndpoints,
  hexHeight,
  hexLine,
  hexNeighbor,
  hexNeighbors,
  hexTokenSize,
  hexWidth,
  isGridType,
  isHexGrid,
  nearestHexEdge,
  polygonPointsAttr,
  worldToCell,
} from "./gridGeometry.ts";
export type { GridType, HexDir } from "./gridGeometry.ts";
