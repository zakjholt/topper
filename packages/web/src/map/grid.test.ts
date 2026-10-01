import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gridLinePositions } from "./grid.ts";

describe("gridLinePositions", () => {
  it("stays within the map and closes a partial final cell", () => {
    assert.deepEqual(gridLinePositions(2000, 70, 0).slice(-3), [1890, 1960, 2000]);
    assert.equal(gridLinePositions(2000, 70, 0).every((x) => x >= 0 && x <= 2000), true);
  });

  it("includes the exact far edge when the map is a whole number of cells", () => {
    assert.deepEqual(gridLinePositions(1400, 70, 0).slice(-2), [1330, 1400]);
  });

  it("respects offset without drawing past the map", () => {
    const xs = gridLinePositions(200, 50, 10);
    assert.deepEqual(xs, [10, 60, 110, 160, 200]);
  });
});
