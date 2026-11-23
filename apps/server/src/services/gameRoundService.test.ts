import { describe, expect, it } from "vitest";
import { generateDeterministicCartela } from "@bingo/shared";
import { checkCartelaWin } from "./gameRoundService.js";

describe("checkCartelaWin (ONE_LINE winning rules)", () => {
  const sampleGrid = generateDeterministicCartela(42);

  it("generates valid 5x5 deterministic cartelas for all 1..600 pool numbers", () => {
    for (let card = 1; card <= 600; card++) {
      const grid = generateDeterministicCartela(card);
      expect(grid).toHaveLength(5);
      const seen = new Set<number>();
      for (let r = 0; r < 5; r++) {
        expect(grid[r]).toHaveLength(5);
        for (let c = 0; c < 5; c++) {
          const val = grid[r][c];
          expect(val).toBeGreaterThanOrEqual(c * 15 + 1);
          expect(val).toBeLessThanOrEqual(c * 15 + 15);
          expect(seen.has(val)).toBe(false);
          seen.add(val);
        }
      }
    }
  });

  it("wins on every horizontal row (0..4) with freeCenter=true", () => {
    for (let r = 0; r < 5; r++) {
      // For row 2, omit center number to confirm freeCenter star counts as marked
      const rowNums = sampleGrid[r].filter((_, c) => !(r === 2 && c === 2));
      const res = checkCartelaWin(sampleGrid, new Set(rowNums), true, "ONE_LINE");
      expect(res.hasWon).toBe(true);
      expect(res.winningKeys).toEqual(new Set([0, 1, 2, 3, 4].map((c) => `${r}-${c}`)));
    }
  });

  it("requires center number on middle row/column/diagonals when freeCenter=false", () => {
    const midRowWithoutCenter = sampleGrid[2].filter((_, c) => c !== 2);
    expect(checkCartelaWin(sampleGrid, new Set(midRowWithoutCenter), false, "ONE_LINE").hasWon).toBe(false);
    expect(checkCartelaWin(sampleGrid, new Set(sampleGrid[2]), false, "ONE_LINE").hasWon).toBe(true);
  });

  it("wins on every vertical column (0..4) with freeCenter=true", () => {
    for (let c = 0; c < 5; c++) {
      const colNums = [0, 1, 2, 3, 4]
        .filter((r) => !(r === 2 && c === 2))
        .map((r) => sampleGrid[r][c]);
      const res = checkCartelaWin(sampleGrid, new Set(colNums), true, "ONE_LINE");
      expect(res.hasWon).toBe(true);
      expect(res.winningKeys).toEqual(new Set([0, 1, 2, 3, 4].map((r) => `${r}-${c}`)));
    }
  });

  it("wins on both diagonals (\\ and /) with freeCenter=true using 4 called numbers", () => {
    const diag1 = [0, 1, 3, 4].map((i) => sampleGrid[i][i]);
    const res1 = checkCartelaWin(sampleGrid, new Set(diag1), true, "ONE_LINE");
    expect(res1.hasWon).toBe(true);
    expect(res1.winningKeys).toEqual(new Set(["0-0", "1-1", "2-2", "3-3", "4-4"]));

    const diag2 = [0, 1, 3, 4].map((i) => sampleGrid[i][4 - i]);
    const res2 = checkCartelaWin(sampleGrid, new Set(diag2), true, "ONE_LINE");
    expect(res2.hasWon).toBe(true);
    expect(res2.winningKeys).toEqual(new Set(["0-4", "1-3", "2-2", "3-1", "4-0"]));
  });

  it("wins on all Four Corners (0-0, 0-4, 4-0, 4-4)", () => {
    const corners = [sampleGrid[0][0], sampleGrid[0][4], sampleGrid[4][0], sampleGrid[4][4]];
    const res = checkCartelaWin(sampleGrid, new Set(corners), true, "ONE_LINE");
    expect(res.hasWon).toBe(true);
    expect(res.winningKeys).toEqual(new Set(["0-0", "0-4", "4-0", "4-4"]));
  });

  it("does NOT win on incomplete lines, 3 corners, or scattered numbers", () => {
    // 4 of 5 in row 0
    expect(
      checkCartelaWin(sampleGrid, new Set(sampleGrid[0].slice(0, 4)), true, "ONE_LINE").hasWon
    ).toBe(false);

    // 3 of 4 corners
    expect(
      checkCartelaWin(
        sampleGrid,
        new Set([sampleGrid[0][0], sampleGrid[0][4], sampleGrid[4][0]]),
        true,
        "ONE_LINE"
      ).hasWon
    ).toBe(false);

    // 8 scattered cells with no complete row/col/diag/4-corners
    const scattered = [
      sampleGrid[0][0],
      sampleGrid[0][2],
      sampleGrid[1][1],
      sampleGrid[1][4],
      sampleGrid[2][0],
      sampleGrid[3][2],
      sampleGrid[3][3],
      sampleGrid[4][1],
    ];
    expect(checkCartelaWin(sampleGrid, new Set(scattered), true, "ONE_LINE").hasWon).toBe(false);
  });
});
