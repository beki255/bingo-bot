import type { WinningPattern } from "./types.js";

export type BingoLetter = "B" | "I" | "N" | "G" | "O";

export const BINGO_LETTERS: BingoLetter[] = ["B", "I", "N", "G", "O"];

export function getColumnLetter(num: number): BingoLetter {
  if (num >= 1 && num <= 15) return "B";
  if (num >= 16 && num <= 30) return "I";
  if (num >= 31 && num <= 45) return "N";
  if (num >= 46 && num <= 60) return "G";
  if (num >= 61 && num <= 75) return "O";
  throw new Error(`Invalid 75-ball Bingo number: ${num}`);
}

export function formatBingoCall(num: number): string {
  return `${getColumnLetter(num)}${num}`;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFromRange(start: number, end: number, count: number, rng: () => number): number[] {
  const pool: number[] = [];
  for (let n = start; n <= end; n++) pool.push(n);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function generateDeterministicCartela(cartelaNumber: number): number[][] {
  if (!Number.isInteger(cartelaNumber) || cartelaNumber < 1) {
    throw new Error(`Cartela number must be a positive integer, got ${cartelaNumber}`);
  }
  const rng = mulberry32((cartelaNumber * 2654435761) ^ 0x9e3779b9);

  const cols = [
    pickFromRange(1, 15, 5, rng),
    pickFromRange(16, 30, 5, rng),
    pickFromRange(31, 45, 5, rng),
    pickFromRange(46, 60, 5, rng),
    pickFromRange(61, 75, 5, rng),
  ];

  const grid: number[][] = [];
  for (let row = 0; row < 5; row++) {
    grid.push([cols[0][row], cols[1][row], cols[2][row], cols[3][row], cols[4][row]]);
  }
  return grid;
}

export function isCellMarked(
  grid: number[][],
  row: number,
  col: number,
  calledSet: Set<number>,
  freeCenter: boolean
): boolean {
  if (freeCenter && row === 2 && col === 2) return true;
  const val = grid[row]?.[col];
  if (val === undefined) return false;
  if (val === 0) return true;
  return calledSet.has(val);
}

const ALL_LINES: [number, number][][] = (() => {
  const lines: [number, number][][] = [];
  for (let r = 0; r < 5; r++) {
    lines.push([0, 1, 2, 3, 4].map((c) => [r, c]));
  }
  for (let c = 0; c < 5; c++) {
    lines.push([0, 1, 2, 3, 4].map((r) => [r, c]));
  }
  lines.push([0, 1, 2, 3, 4].map((i) => [i, i]));
  lines.push([0, 1, 2, 3, 4].map((i) => [i, 4 - i]));
  return lines;
})();

const FOUR_CORNERS_CELLS: [number, number][] = [
  [0, 0],
  [0, 4],
  [4, 0],
  [4, 4],
];

const X_SHAPE_CELLS: [number, number][] = [
  [0, 0],
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [0, 4],
  [1, 3],
  [3, 1],
  [4, 0],
];

function dedupeCells(cells: [number, number][]): [number, number][] {
  const seen = new Set<string>();
  const result: [number, number][] = [];
  for (const [r, c] of cells) {
    const key = `${r},${c}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push([r, c]);
    }
  }
  return result;
}

export interface WinCheckResult {
  won: boolean;
  winningCells: [number, number][];
}

export function checkWinningPattern(
  grid: number[][],
  calledNumbers: number[] | Set<number>,
  pattern: WinningPattern,
  freeCenter: boolean
): WinCheckResult {
  const calledSet = calledNumbers instanceof Set ? calledNumbers : new Set(calledNumbers);

  if (pattern === "ONE_LINE" || pattern === "TWO_LINES") {
    const completedLines = ALL_LINES.filter((line) =>
      line.every(([r, c]) => isCellMarked(grid, r, c, calledSet, freeCenter))
    );
    const required = pattern === "ONE_LINE" ? 1 : 2;
    if (completedLines.length >= required) {
      return {
        won: true,
        winningCells: dedupeCells(completedLines.flat()),
      };
    }
    return { won: false, winningCells: [] };
  }

  if (pattern === "FOUR_CORNERS") {
    const won = FOUR_CORNERS_CELLS.every(([r, c]) =>
      isCellMarked(grid, r, c, calledSet, freeCenter)
    );
    return { won, winningCells: won ? FOUR_CORNERS_CELLS : [] };
  }

  if (pattern === "X_SHAPE") {
    const won = X_SHAPE_CELLS.every(([r, c]) =>
      isCellMarked(grid, r, c, calledSet, freeCenter)
    );
    return { won, winningCells: won ? X_SHAPE_CELLS : [] };
  }

  const allCells: [number, number][] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (!isCellMarked(grid, r, c, calledSet, freeCenter)) {
        return { won: false, winningCells: [] };
      }
      allCells.push([r, c]);
    }
  }
  return { won: true, winningCells: allCells };
}

