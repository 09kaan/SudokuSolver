const fs = require('fs');
const data = fs.readFileSync('tests/merged_puzzles_data.js', 'utf-8');

const classCode = `
export class PuzzleLibrary {
  /**
   * Get a random puzzle at the specified difficulty
   * @param {'easy'|'medium'|'hard'|'expert'} difficulty
   * @returns {{ puzzle: number[][], solution: number[][] }}
   */
  static getRandom(difficulty = 'medium') {
    const pool = PUZZLES[difficulty] || PUZZLES.medium;
    const entry = pool[Math.floor(Math.random() * pool.length)];
    return {
      puzzle: PuzzleLibrary._toGrid(entry.puzzle),
      solution: PuzzleLibrary._toGrid(entry.solution),
    };
  }

  /**
   * Get total puzzle count for a difficulty
   */
  static getCount(difficulty) {
    return (PUZZLES[difficulty] || []).length;
  }

  /**
   * Validate puzzle has unique solution using backtracking
   * @param {number[][]} grid - 9x9 puzzle grid
   * @returns {boolean} true if exactly one solution exists
   */
  static isUniqueSolution(grid) {
    let count = 0;
    function isValid(g, r, c, v) {
      for (let i = 0; i < 9; i++) {
        if (g[r][i] === v || g[i][c] === v) return false;
      }
      const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
      for (let rr = br; rr < br+3; rr++)
        for (let cc = bc; cc < bc+3; cc++)
          if (g[rr][cc] === v) return false;
      return true;
    }
    function solve(g) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (g[r][c] !== 0) continue;
          for (let v = 1; v <= 9; v++) {
            if (!isValid(g, r, c, v)) continue;
            g[r][c] = v;
            solve(g);
            if (count >= 2) return;
            g[r][c] = 0;
          }
          return;
        }
      }
      count++;
    }
    solve(grid.map(r => [...r]));
    return count === 1;
  }

  /**
   * Convert 81-char string to 9x9 grid
   */
  static _toGrid(str) {
    const grid = [];
    for (let r = 0; r < 9; r++) {
      grid[r] = [];
      for (let c = 0; c < 9; c++) {
        grid[r][c] = parseInt(str[r * 9 + c]) || 0;
      }
    }
    return grid;
  }
}
`;

fs.writeFileSync('js/puzzles.js', data + classCode);
console.log('DONE - js/puzzles.js written with ' + (data.match(/puzzle:/g) || []).length + ' puzzles');
