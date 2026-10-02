import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeHexEdge,
  cellCenter,
  cellsInRect,
  hexLine,
  hexNeighbors,
  hexTokenSize,
  nearestHexEdge,
  worldToCell,
} from "./gridGeometry.ts";
import { floodFill, hexEdgeRun, mergeEdges, rectEdges } from "./drawing.ts";

describe("hex axial geometry", () => {
  it("round-trips centers for flat and pointy", () => {
    for (const gridType of ["hexFlat", "hexPointy"] as const) {
      const center = cellCenter(2, -1, 40, 10, 20, gridType);
      const cell = worldToCell(center.x, center.y, 40, 10, 20, gridType);
      assert.deepEqual(cell, { x: 2, y: -1 }, gridType);
    }
  });

  it("has six neighbors", () => {
    assert.equal(hexNeighbors(0, 0).length, 6);
    assert.deepEqual(hexNeighbors(0, 0)[0], { x: 1, y: 0 });
  });

  it("builds hex lines with cube distance", () => {
    const line = hexLine({ x: 0, y: 0 }, { x: 2, y: -1 });
    assert.equal(line.length, 3);
    assert.deepEqual(line[0], { x: 0, y: 0 });
    assert.deepEqual(line[line.length - 1], { x: 2, y: -1 });
  });

  it("canonicalizes opposite hex edges to one key", () => {
    const a = canonicalizeHexEdge(0, 0, 0);
    const b = canonicalizeHexEdge(1, 0, 3);
    assert.deepEqual(a, b);
    assert.ok(Number(a.dir) <= 2);
  });

  it("finds a nearby hex edge", () => {
    const center = cellCenter(0, 0, 50, 0, 0, "hexFlat");
    const edge = nearestHexEdge(center.x + 50, center.y, 50, 0, 0, "hexFlat");
    assert.equal(typeof edge.dir, "string");
    assert.ok(["0", "1", "2"].includes(edge.dir));
  });

  it("flood-fills with six neighbors", () => {
    const fills = { "0,0": "#111111", "1,0": "#111111", "0,1": "#222222" };
    const patches = floodFill(fills, { x: 0, y: 0 }, "#abcdef", {
      minX: -2,
      maxX: 2,
      minY: -2,
      maxY: 2,
    }, "hexFlat");
    const keys = new Set(patches.map((p) => `${p.x},${p.y}`));
    assert.ok(keys.has("0,0"));
    assert.ok(keys.has("1,0"));
    assert.equal(keys.has("0,1"), false);
  });

  it("paints hex edge runs and outlines", () => {
    const run = hexEdgeRun({ x: 0, y: 0, dir: "0" }, { x: 2, y: 0 }, "#abcabc");
    assert.ok(run.length >= 2);
    const outline = rectEdges(0, 0, 1, 1, "#abcabc", "hexFlat");
    assert.ok(outline.length > 4);
    const merged = mergeEdges({}, run);
    assert.ok(Object.keys(merged).length >= 2);
  });

  it("sizes tokens to the inscribed diameter", () => {
    assert.ok(Math.abs(hexTokenSize(40) - 40 * Math.sqrt(3)) < 0.001);
  });

  it("does not enumerate a size-2 hex grid across a large map", () => {
    const cells = cellsInRect(0, 0, 3640, 5460, 2, 420, 280, "hexFlat");
    assert.equal(cells.length, 0);
  });

  it("enumerates only the hexes in a small window", () => {
    const cells = cellsInRect(400, 260, 700, 500, 2, 420, 280, "hexFlat");
    assert.ok(cells.length > 100);
    assert.ok(cells.length < 20000);
  });
});
