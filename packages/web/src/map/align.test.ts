import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alignFromRect,
  clampGridSize,
  clampOffset,
  fitMapInViewport,
  gridCounts,
  imageFromDrop,
  isFileDrag,
} from "./align.ts";

describe("clampGridSize", () => {
  it("clamps and rounds", () => {
    assert.equal(clampGridSize(70.4), 70);
    assert.equal(clampGridSize(2), 8);
    assert.equal(clampGridSize(900), 800);
    assert.equal(clampGridSize(Number.NaN), 70);
  });
});

describe("clampOffset", () => {
  it("rounds finite values and defaults otherwise", () => {
    assert.equal(clampOffset(12.6), 13);
    assert.equal(clampOffset(-3.2), -3);
    assert.equal(clampOffset(Number.POSITIVE_INFINITY), 0);
  });
});

describe("alignFromRect", () => {
  it("sets offset to the top-left and size to the average side", () => {
    assert.deepEqual(alignFromRect(100, 80, 180, 200), {
      gridSize: 100,
      offsetX: 100,
      offsetY: 80,
    });
  });

  it("is order-independent", () => {
    assert.deepEqual(alignFromRect(180, 200, 100, 80), alignFromRect(100, 80, 180, 200));
  });
});

describe("gridCounts", () => {
  it("counts cells that fit after the offset", () => {
    assert.deepEqual(gridCounts(1000, 700, 100, 0, 0), { cols: 10, rows: 7 });
    assert.deepEqual(gridCounts(1000, 700, 100, 50, 20), { cols: 10, rows: 7 });
  });
});

describe("fitMapInViewport", () => {
  it("fits the map with padding and centers pan", () => {
    const next = fitMapInViewport(1000, 500, 800, 600, 0.2, 3, 50);
    assert.ok(next.zoom > 0.2 && next.zoom <= 3);
    assert.ok(Math.abs(next.pan.x - (800 - 1000 * next.zoom) / 2) < 0.001);
    assert.ok(Math.abs(next.pan.y - (600 - 500 * next.zoom) / 2) < 0.001);
  });
});

describe("drag helpers", () => {
  it("detects file drags and image drops", () => {
    assert.equal(isFileDrag({ dataTransfer: { types: ["Files"] } as DataTransfer }), true);
    assert.equal(isFileDrag({ dataTransfer: { types: ["text/plain"] } as DataTransfer }), false);
    const file = { type: "image/png" } as File;
    const other = { type: "text/plain" } as File;
    assert.equal(
      imageFromDrop({
        dataTransfer: { files: [other, file] as unknown as FileList },
      }),
      file,
    );
    assert.equal(imageFromDrop({ dataTransfer: null }), undefined);
  });
});
