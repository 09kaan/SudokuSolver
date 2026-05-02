/**
 * Candidate (pencil mark) management for Sudoku
 * Calculates and tracks possible values for each empty cell
 */
export class CandidateManager {
  constructor() {
    this.candidates = this._createEmpty();
  }

  _createEmpty() {
    return Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set())
    );
  }

  /**
   * Calculate all candidates for the current grid state
   * @param {number[][]} grid - 9x9 grid (0 = empty)
   * @returns {Set[][]} 9x9 array of candidate Sets
   */
  calculate(grid) {
    this.candidates = this._createEmpty();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === 0) {
          this.candidates[r][c] = this._computeForCell(grid, r, c);
        }
      }
    }
    return this.candidates;
  }

  _computeForCell(grid, row, col) {
    const used = new Set();
    // Row
    for (let c = 0; c < 9; c++) {
      if (grid[row][c]) used.add(grid[row][c]);
    }
    // Column
    for (let r = 0; r < 9; r++) {
      if (grid[r][col]) used.add(grid[r][col]);
    }
    // 3x3 Box
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if (grid[r][c]) used.add(grid[r][c]);
      }
    }
    const result = new Set();
    for (let v = 1; v <= 9; v++) {
      if (!used.has(v)) result.add(v);
    }
    return result;
  }

  get(row, col) {
    return this.candidates[row][col];
  }

  /**
   * Get all filled values in a row
   */
  getRowValues(grid, row) {
    const vals = [];
    for (let c = 0; c < 9; c++) {
      if (grid[row][c]) vals.push(grid[row][c]);
    }
    return vals;
  }

  /**
   * Get all filled values in a column
   */
  getColValues(grid, col) {
    const vals = [];
    for (let r = 0; r < 9; r++) {
      if (grid[r][col]) vals.push(grid[r][col]);
    }
    return vals;
  }

  /**
   * Get all filled values in a 3x3 box
   */
  getBoxValues(grid, row, col) {
    const vals = [];
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if (grid[r][c]) vals.push(grid[r][c]);
      }
    }
    return vals;
  }

  /**
   * Get box index (0-8) for a cell
   */
  getBoxIndex(row, col) {
    return Math.floor(row / 3) * 3 + Math.floor(col / 3);
  }
}
