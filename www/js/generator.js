/**
 * Sudoku Puzzle Generator
 * Generates valid puzzles at different difficulty levels
 */
import { CandidateManager } from './candidates.js';

export class PuzzleGenerator {
  constructor() {
    this.cm = new CandidateManager();
  }

  /**
   * Generate a puzzle at the given difficulty
   * @param {'easy'|'medium'|'hard'|'expert'} difficulty
   * @returns {{ puzzle: number[][], solution: number[][] }}
   */
  generate(difficulty = 'medium') {
    const solution = this._generateSolvedGrid();
    const puzzle = solution.map(r => [...r]);

    const cellsToRemove = {
      easy: 36,
      medium: 46,
      hard: 52,
      expert: 58,
    }[difficulty] || 46;

    this._removeClues(puzzle, solution, cellsToRemove);
    return { puzzle, solution };
  }

  /**
   * Generate a fully solved valid Sudoku grid
   */
  _generateSolvedGrid() {
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    this._fillGrid(grid);
    return grid;
  }

  _fillGrid(grid) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] !== 0) continue;

        const candidates = [...this.cm._computeForCell(grid, r, c)];
        // Shuffle candidates for randomness
        this._shuffle(candidates);

        for (const v of candidates) {
          grid[r][c] = v;
          if (this._fillGrid(grid)) return true;
          grid[r][c] = 0;
        }
        return false;
      }
    }
    return true; // All cells filled
  }

  /**
   * Remove clues while ensuring unique solution
   */
  _removeClues(puzzle, solution, count) {
    const positions = [];
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        positions.push([r, c]);

    this._shuffle(positions);
    let removed = 0;

    for (const [r, c] of positions) {
      if (removed >= count) break;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;

      // Check uniqueness — count solutions (stop at 2)
      const solutions = this._countSolutions(puzzle, 2);
      if (solutions === 1) {
        removed++;
      } else {
        puzzle[r][c] = backup; // Restore — removing this creates ambiguity
      }
    }
  }

  /**
   * Count solutions up to maxCount using backtracking
   */
  _countSolutions(grid, maxCount) {
    const copy = grid.map(r => [...r]);
    let count = 0;

    const solve = () => {
      // Find first empty cell
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (copy[r][c] !== 0) continue;

          const cands = this.cm._computeForCell(copy, r, c);
          for (const v of cands) {
            copy[r][c] = v;
            solve();
            if (count >= maxCount) return;
            copy[r][c] = 0;
          }
          return; // No valid candidate = backtrack
        }
      }
      count++; // All cells filled = found a solution
    };

    solve();
    return count;
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
