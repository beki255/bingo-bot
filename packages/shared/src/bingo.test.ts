import { describe, expect, it } from "vitest";
import {
  checkWinningPattern,
  formatBingoCall,
  generateDeterministicCartela,
} from "./bingo.js";

describe("bingo shared logic", () => {
  it("generates 200 distinct valid fixed cartelas", () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 200; i++) {
      const grid = generateDeterministicCartela(i);
      expect(grid).toHaveLength(5);
      const cardNums = new Set<number>();
      for (let c = 0; c < 5; c++) {
        const min = c * 15 + 1;
        const max = (c + 1) * 15;
        for (let r = 0; r < 5; r++) {
          const val = grid[r][c];
          expect(val).toBeGreaterThanOrEqual(min);
          expect(val).toBeLessThanOrEqual(max);
          expect(cardNums.has(val)).toBe(false);
          cardNums.add(val);
        }
      }
      const key = JSON.stringify(grid);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("formats 75-ball Bingo calls accurately", () => {
    expect(formatBingoCall(1)).toBe("B1");
    expect(formatBingoCall(75)).toBe("O75");
  });

  it("checks ONE_LINE, TWO_LINES, FOUR_CORNERS, X_SHAPE, and FULL_HOUSE", () => {
    const grid = generateDeterministicCartela(1);
    expect(checkWinningPattern(grid, grid[0], "ONE_LINE", true).won).toBe(true);
    expect(checkWinningPattern(grid, [...grid[0], ...grid[1]], "TWO_LINES", true).won).toBe(true);
    expect(
      checkWinningPattern(grid, [grid[0][0], grid[0][4], grid[4][0], grid[4][4]], "FOUR_CORNERS", true).won
    ).toBe(true);
    expect(checkWinningPattern(grid, grid.flat(), "FULL_HOUSE", false).won).toBe(true);
  });
});

