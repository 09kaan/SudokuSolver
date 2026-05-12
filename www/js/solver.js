/**
 * Sudoku Solver Engine
 * Supports step-by-step solving with technique explanations
 * and complete backtracking solve
 */
import { CandidateManager } from './candidates.js';

export class SudokuSolver {
  constructor() {
    this.cm = new CandidateManager();
    // Track candidate eliminations from techniques like pointing pairs
    // Key: "r,c", Value: Set of eliminated digit values
    this.eliminatedCandidates = new Map();
  }

  /**
   * Clear all tracked eliminations (call on new puzzle / clear)
   */
  resetEliminations() {
    this.eliminatedCandidates.clear();
  }

  /**
   * Check if the puzzle is complete (no zeros)
   */
  isComplete(grid) {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (grid[r][c] === 0) return false;
    return true;
  }

  /**
   * Validate the grid has no conflicts
   */
  isValid(grid) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === 0) continue;
        const v = grid[r][c];
        grid[r][c] = 0;
        const cands = this.cm._computeForCell(grid, r, c);
        grid[r][c] = v;
        if (!cands.has(v)) return false;
      }
    }
    return true;
  }

  /**
   * Check if a puzzle can be solved entirely with logical techniques (no backtracking)
   */
  canSolveLogically(grid) {
    const g = grid.map(r => [...r]);
    const tempSolver = new SudokuSolver();
    let maxSteps = 200;
    while (!tempSolver.isComplete(g) && maxSteps-- > 0) {
      const step = tempSolver.getNextStep(g);
      if (!step || step.type === 'backtrack' || step.type === 'error') return false;
      if (step.cell && step.value) g[step.cell.row][step.cell.col] = step.value;
      else if (!step.eliminations || step.eliminations.length === 0) return false;
    }
    return tempSolver.isComplete(g);
  }

  /**
   * Get the next logical step (hint)
   * Tries techniques in order of complexity
   * @returns {object|null} Step object or null if puzzle is complete/unsolvable
   */
  getNextStep(grid) {
    if (this.isComplete(grid)) return null;

    const candidates = this.cm.calculate(grid);

    // Apply tracked eliminations from previous pointing pair steps
    this._applyEliminations(candidates, grid);

    // Check for cells with no candidates (invalid state)
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (grid[r][c] === 0 && candidates[r][c].size === 0)
          return { type: 'error', explanation: `No valid candidates for R${r + 1}C${c + 1}. The puzzle may be invalid.` };

    let step;

    step = this._findNakedSingle(grid, candidates);
    if (step) return step;

    step = this._findHiddenSingle(grid, candidates);
    if (step) return step;

    // Try all elimination techniques in order of difficulty
    // Only show a technique if it leads to a new naked/hidden single
    // Otherwise, silently apply and try next technique
    const eliminationTechniques = [
      () => this._findNakedPair(grid, candidates),
      () => this._findHiddenPair(grid, candidates),
      () => this._findPointingPair(grid, candidates),
      () => this._findBoxLineReduction(grid, candidates),
      () => this._findNakedTriple(grid, candidates),
      () => this._findHiddenTriple(grid, candidates),
      () => this._findNakedQuad(grid, candidates),
      () => this._findHiddenQuad(grid, candidates),
      () => this._findXWing(grid, candidates),
      () => this._findSwordfish(grid, candidates),
      () => this._findJellyfish(grid, candidates),
      () => this._findSkyscraper(grid, candidates),
      () => this._findTwoStringKite(grid, candidates),
      () => this._findXYWing(grid, candidates),
    ];

    let madeProgress = true;
    while (madeProgress) {
      madeProgress = false;
      for (const findTechnique of eliminationTechniques) {
        while (true) {
          step = findTechnique();
          if (!step) break;

          madeProgress = true;
          // Apply elimination to candidates
          this._storeEliminations(step);
          this._applyStepEliminations(step, candidates);

          // Check if this revealed a new naked/hidden single
          const nakedAfter = this._findNakedSingle(grid, candidates);
          const hiddenAfter = !nakedAfter ? this._findHiddenSingle(grid, candidates) : null;

          if (nakedAfter || hiddenAfter) {
            // Productive! Show this technique step to the user
            return step;
          }
          // Not productive yet — silently continue
        }
      }
    }

    // ── Search Proof Fallback ──────────────────────────
    // If all logical techniques exhausted, use contradiction-based reasoning
    step = this._findSearchProof(grid, candidates);
    if (step) return step;

    return null;
  }

  // ── Naked Single ───────────────────────────────────
  _findNakedSingle(grid, candidates) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] !== 0 || candidates[r][c].size !== 1) continue;

        const value = [...candidates[r][c]][0];
        const highlights = [{ row: r, col: c, color: 'success' }];

        // Highlight filled peers
        this._addPeerHighlights(grid, r, c, highlights);

        const rowVals = this.cm.getRowValues(grid, r);
        const colVals = this.cm.getColValues(grid, c);
        const boxVals = this.cm.getBoxValues(grid, r, c);
        const allUsed = [...new Set([...rowVals, ...colVals, ...boxVals])].sort();

        return {
          type: 'naked_single',
          cell: { row: r, col: c },
          value,
          explanation: `<strong>Naked Single</strong> at R${r + 1}C${c + 1}: This cell can only be <strong>${value}</strong>. The digits ${allUsed.join(', ')} are already present in its row, column, or box — leaving ${value} as the only possibility.`,
          highlights,
        };
      }
    }
    return null;
  }

  // ── Hidden Single ──────────────────────────────────
  _findHiddenSingle(grid, candidates) {
    const units = [
      ...this._getRowUnits(),
      ...this._getColUnits(),
      ...this._getBoxUnits(),
    ];

    for (const unit of units) {
      for (let v = 1; v <= 9; v++) {
        if (unit.cells.some(([r, c]) => grid[r][c] === v)) continue;

        const possible = unit.cells.filter(([r, c]) =>
          grid[r][c] === 0 && candidates[r][c].has(v)
        );

        if (possible.length === 1) {
          const [r, c] = possible[0];
          const highlights = [{ row: r, col: c, color: 'success' }];
          const added = new Set([`${r},${c}`]);

          // Highlight ALL cells in the grid that contain this number (show blockers)
          for (let gr = 0; gr < 9; gr++) {
            for (let gc = 0; gc < 9; gc++) {
              if (grid[gr][gc] === v && !added.has(`${gr},${gc}`)) {
                added.add(`${gr},${gc}`);
                // Is this blocker in the same row, col, or box as our cell?
                const sameRow = gr === r;
                const sameCol = gc === c;
                const sameBox = Math.floor(gr / 3) === Math.floor(r / 3) && Math.floor(gc / 3) === Math.floor(c / 3);
                if (sameRow || sameCol || sameBox) {
                  highlights.push({ row: gr, col: gc, color: 'info' });
                }
              }
            }
          }

          // Highlight blocked empty cells in the unit (cells where v can't go)
          for (const [ur, uc] of unit.cells) {
            if (ur === r && uc === c) continue;
            if (added.has(`${ur},${uc}`)) continue;
            if (grid[ur][uc] === 0 && !candidates[ur][uc].has(v)) {
              added.add(`${ur},${uc}`);
              highlights.push({ row: ur, col: uc, color: 'warning' });
            }
          }

          // Build explanation showing why other cells are blocked
          const blockedDetails = [];
          for (const [ur, uc] of unit.cells) {
            if (ur === r && uc === c) continue;
            if (grid[ur][uc] !== 0) continue;
            if (!candidates[ur][uc].has(v)) {
              // Find what blocks this cell
              const blockers = [];
              for (let i = 0; i < 9; i++) {
                if (grid[ur][i] === v) blockers.push(`R${ur + 1}C${i + 1}`);
                if (grid[i][uc] === v) blockers.push(`R${i + 1}C${uc + 1}`);
              }
              const br2 = Math.floor(ur / 3) * 3, bc2 = Math.floor(uc / 3) * 3;
              for (let bx = br2; bx < br2 + 3; bx++)
                for (let by = bc2; by < bc2 + 3; by++)
                  if (grid[bx][by] === v) blockers.push(`R${bx + 1}C${by + 1}`);
              const unique = [...new Set(blockers)];
              if (unique.length > 0) blockedDetails.push(`R${ur + 1}C${uc + 1} blocked by ${unique[0]}`);
            }
          }

          const blockInfo = blockedDetails.length > 0
            ? ` (${blockedDetails.join('; ')})`
            : '';

          return {
            type: 'hidden_single',
            cell: { row: r, col: c },
            value: v,
            explanation: `<strong>Hidden Single</strong> in ${unit.name}: The number <strong>${v}</strong> can only go in R${r + 1}C${c + 1}. All other empty cells in this ${unit.type} are blocked${blockInfo}.`,
            highlights,
          };
        }
      }
    }
    return null;
  }

  // ── Pointing Pair ──────────────────────────────────
  _findPointingPair(grid, candidates) {
    for (let boxR = 0; boxR < 3; boxR++) {
      for (let boxC = 0; boxC < 3; boxC++) {
        const br = boxR * 3, bc = boxC * 3;

        for (let v = 1; v <= 9; v++) {
          // Find cells in this box that have v as candidate
          const cells = [];
          for (let r = br; r < br + 3; r++)
            for (let c = bc; c < bc + 3; c++)
              if (grid[r][c] === 0 && candidates[r][c].has(v))
                cells.push([r, c]);

          if (cells.length < 2 || cells.length > 3) continue;

          // Check if all in same row
          const sameRow = cells.every(([r]) => r === cells[0][0]);
          if (sameRow) {
            const row = cells[0][0];
            const eliminations = [];
            for (let c = 0; c < 9; c++) {
              if (c >= bc && c < bc + 3) continue;
              if (grid[row][c] === 0 && candidates[row][c].has(v)) {
                eliminations.push({ row, col: c });
              }
            }
            if (eliminations.length > 0) {
              const highlights = cells.map(([r, c]) => ({ row: r, col: c, color: 'primary' }));
              eliminations.forEach(e => highlights.push({ row: e.row, col: e.col, color: 'warning' }));

              const elimDesc = eliminations.map(e => `R${e.row + 1}C${e.col + 1}`).join(', ');
              return {
                type: 'pointing_pair',
                cell: null,
                value: null,
                eliminationValue: v,
                eliminations,
                explanation: `<strong>Pointing Pair</strong> in Box ${boxR * 3 + boxC + 1}: The digit <strong>${v}</strong> can only appear in Row ${row + 1} within this box (at ${cells.map(([r, c]) => `R${r + 1}C${c + 1}`).join(', ')}). Therefore, <strong>${v}</strong> is eliminated from ${elimDesc} in the same row.`,
                highlights,
              };
            }
          }

          // Check if all in same column
          const sameCol = cells.every(([, c]) => c === cells[0][1]);
          if (sameCol) {
            const col = cells[0][1];
            const eliminations = [];
            for (let r = 0; r < 9; r++) {
              if (r >= br && r < br + 3) continue;
              if (grid[r][col] === 0 && candidates[r][col].has(v)) {
                eliminations.push({ row: r, col });
              }
            }
            if (eliminations.length > 0) {
              const highlights = cells.map(([r, c]) => ({ row: r, col: c, color: 'primary' }));
              eliminations.forEach(e => highlights.push({ row: e.row, col: e.col, color: 'warning' }));

              const elimDesc = eliminations.map(e => `R${e.row + 1}C${e.col + 1}`).join(', ');
              return {
                type: 'pointing_pair',
                cell: null,
                value: null,
                eliminationValue: v,
                eliminations,
                explanation: `<strong>Pointing Pair</strong> in Box ${boxR * 3 + boxC + 1}: The digit <strong>${v}</strong> can only appear in Column ${col + 1} within this box (at ${cells.map(([r, c]) => `R${r + 1}C${c + 1}`).join(', ')}). Therefore, <strong>${v}</strong> is eliminated from ${elimDesc} in the same column.`,
                highlights,
              };
            }
          }
        }
      }
    }
    return null;
  }
  // ── Naked Pair ────────────────────────────────────────
  _findNakedPair(grid, candidates) {
    const units = [...this._getRowUnits(), ...this._getColUnits(), ...this._getBoxUnits()];
    for (const unit of units) {
      const emptyCells = unit.cells.filter(([r, c]) => grid[r][c] === 0 && candidates[r][c].size === 2);
      for (let i = 0; i < emptyCells.length; i++) {
        for (let j = i + 1; j < emptyCells.length; j++) {
          const [r1, c1] = emptyCells[i], [r2, c2] = emptyCells[j];
          const s1 = candidates[r1][c1], s2 = candidates[r2][c2];
          const vals = [...s1];
          if (!s2.has(vals[0]) || !s2.has(vals[1])) continue;
          const eliminations = [];
          for (const [r, c] of unit.cells) {
            if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
            if (grid[r][c] !== 0) continue;
            for (const v of vals) {
              if (candidates[r][c].has(v)) eliminations.push({ row: r, col: c, val: v });
            }
          }
          if (eliminations.length === 0) continue;
          const highlights = [{ row: r1, col: c1, color: 'primary' }, { row: r2, col: c2, color: 'primary' }];
          const elimCells = new Set();
          for (const e of eliminations) {
            elimCells.add(`R${e.row + 1}C${e.col + 1}`);
            if (!highlights.some(h => h.row === e.row && h.col === e.col))
              highlights.push({ row: e.row, col: e.col, color: 'warning' });
          }
          return {
            type: 'naked_pair', cell: null, value: null, eliminationValue: vals, eliminations,
            explanation: `<strong>Naked Pair</strong> in ${unit.name}: R${r1 + 1}C${c1 + 1} and R${r2 + 1}C${c2 + 1} both contain only {${vals.join(', ')}}. These digits are eliminated from ${[...elimCells].join(', ')}.`,
            highlights,
          };
        }
      }
    }
    return null;
  }

  // ── Hidden Pair ───────────────────────────────────────
  _findHiddenPair(grid, candidates) {
    const units = [...this._getRowUnits(), ...this._getColUnits(), ...this._getBoxUnits()];
    for (const unit of units) {
      const empty = unit.cells.filter(([r, c]) => grid[r][c] === 0);
      for (let v1 = 1; v1 <= 8; v1++) {
        for (let v2 = v1 + 1; v2 <= 9; v2++) {
          const cells1 = empty.filter(([r, c]) => candidates[r][c].has(v1));
          const cells2 = empty.filter(([r, c]) => candidates[r][c].has(v2));
          if (cells1.length !== 2 || cells2.length !== 2) continue;
          if (cells1[0][0] !== cells2[0][0] || cells1[0][1] !== cells2[0][1]) continue;
          if (cells1[1][0] !== cells2[1][0] || cells1[1][1] !== cells2[1][1]) continue;
          const [r1, c1] = cells1[0], [r2, c2] = cells1[1];
          const eliminations = [];
          for (const [r, c] of [[r1, c1], [r2, c2]]) {
            for (const v of candidates[r][c]) {
              if (v !== v1 && v !== v2) eliminations.push({ row: r, col: c, val: v });
            }
          }
          if (eliminations.length === 0) continue;
          return {
            type: 'hidden_pair', cell: null, value: null, eliminationValue: [v1, v2], eliminations,
            explanation: `<strong>Hidden Pair</strong> in ${unit.name}: {${v1}, ${v2}} only appear in R${r1 + 1}C${c1 + 1} and R${r2 + 1}C${c2 + 1}. Other candidates removed from these cells.`,
            highlights: [{ row: r1, col: c1, color: 'primary' }, { row: r2, col: c2, color: 'primary' }],
          };
        }
      }
    }
    return null;
  }

  // ── Box/Line Reduction (Claiming) ─────────────────────
  _findBoxLineReduction(grid, candidates) {
    for (let line = 0; line < 9; line++) {
      for (let v = 1; v <= 9; v++) {
        // Row check
        const rowCells = [];
        for (let c = 0; c < 9; c++) {
          if (grid[line][c] === 0 && candidates[line][c].has(v)) rowCells.push([line, c]);
        }
        if (rowCells.length >= 2 && rowCells.length <= 3) {
          const boxC = Math.floor(rowCells[0][1] / 3);
          if (rowCells.every(([, c]) => Math.floor(c / 3) === boxC)) {
            const br = Math.floor(line / 3) * 3, bc = boxC * 3;
            const eliminations = [];
            for (let r = br; r < br + 3; r++) {
              if (r === line) continue;
              for (let c = bc; c < bc + 3; c++) {
                if (grid[r][c] === 0 && candidates[r][c].has(v)) eliminations.push({ row: r, col: c });
              }
            }
            if (eliminations.length > 0) {
              const highlights = rowCells.map(([r, c]) => ({ row: r, col: c, color: 'primary' }));
              eliminations.forEach(e => highlights.push({ row: e.row, col: e.col, color: 'warning' }));
              return {
                type: 'box_line_reduction', cell: null, value: null, eliminationValue: v, eliminations,
                explanation: `<strong>Box/Line Reduction</strong>: In Row ${line + 1}, digit <strong>${v}</strong> is confined to Box ${Math.floor(line / 3) * 3 + boxC + 1}. Eliminated from other box cells.`,
                highlights,
              };
            }
          }
        }
        // Column check
        const colCells = [];
        for (let r = 0; r < 9; r++) {
          if (grid[r][line] === 0 && candidates[r][line].has(v)) colCells.push([r, line]);
        }
        if (colCells.length >= 2 && colCells.length <= 3) {
          const boxR = Math.floor(colCells[0][0] / 3);
          if (colCells.every(([r]) => Math.floor(r / 3) === boxR)) {
            const br = boxR * 3, bc = Math.floor(line / 3) * 3;
            const eliminations = [];
            for (let r = br; r < br + 3; r++) {
              for (let c = bc; c < bc + 3; c++) {
                if (c === line) continue;
                if (grid[r][c] === 0 && candidates[r][c].has(v)) eliminations.push({ row: r, col: c });
              }
            }
            if (eliminations.length > 0) {
              const highlights = colCells.map(([r, c]) => ({ row: r, col: c, color: 'primary' }));
              eliminations.forEach(e => highlights.push({ row: e.row, col: e.col, color: 'warning' }));
              return {
                type: 'box_line_reduction', cell: null, value: null, eliminationValue: v, eliminations,
                explanation: `<strong>Box/Line Reduction</strong>: In Column ${line + 1}, digit <strong>${v}</strong> is confined to Box ${boxR * 3 + Math.floor(line / 3) + 1}. Eliminated from other box cells.`,
                highlights,
              };
            }
          }
        }
      }
    }
    return null;
  }

  // ── Naked Triple ──────────────────────────────────────
  _findNakedTriple(grid, candidates) {
    const units = [...this._getRowUnits(), ...this._getColUnits(), ...this._getBoxUnits()];
    for (const unit of units) {
      const emptyCells = unit.cells.filter(([r, c]) => grid[r][c] === 0 && candidates[r][c].size >= 2 && candidates[r][c].size <= 3);
      if (emptyCells.length < 3) continue;
      for (let i = 0; i < emptyCells.length - 2; i++) {
        for (let j = i + 1; j < emptyCells.length - 1; j++) {
          for (let k = j + 1; k < emptyCells.length; k++) {
            const [r1, c1] = emptyCells[i], [r2, c2] = emptyCells[j], [r3, c3] = emptyCells[k];
            const union = new Set([...candidates[r1][c1], ...candidates[r2][c2], ...candidates[r3][c3]]);
            if (union.size !== 3) continue;
            const vals = [...union];
            const eliminations = [];
            for (const [r, c] of unit.cells) {
              if ((r === r1 && c === c1) || (r === r2 && c === c2) || (r === r3 && c === c3)) continue;
              if (grid[r][c] !== 0) continue;
              for (const v of vals) {
                if (candidates[r][c].has(v)) eliminations.push({ row: r, col: c, val: v });
              }
            }
            if (eliminations.length === 0) continue;
            const highlights = [{ row: r1, col: c1, color: 'primary' }, { row: r2, col: c2, color: 'primary' }, { row: r3, col: c3, color: 'primary' }];
            const elimCells = new Set();
            for (const e of eliminations) {
              elimCells.add(`R${e.row + 1}C${e.col + 1}`);
              if (!highlights.some(h => h.row === e.row && h.col === e.col))
                highlights.push({ row: e.row, col: e.col, color: 'warning' });
            }
            return {
              type: 'naked_triple', cell: null, value: null, eliminationValue: vals, eliminations,
              explanation: `<strong>Naked Triple</strong> in ${unit.name}: R${r1 + 1}C${c1 + 1}, R${r2 + 1}C${c2 + 1}, R${r3 + 1}C${c3 + 1} contain only {${vals.join(', ')}}. Eliminated from ${[...elimCells].join(', ')}.`,
              highlights,
            };
          }
        }
      }
    }
    return null;
  }

  // ── X-Wing ────────────────────────────────────────────
  _findHiddenTriple(grid, candidates) {
    return this._findHiddenSubset(grid, candidates, 3, 'hidden_triple', 'Hidden Triple');
  }

  _findNakedQuad(grid, candidates) {
    return this._findNakedSubset(grid, candidates, 4, 'naked_quad', 'Naked Quad');
  }

  _findHiddenQuad(grid, candidates) {
    return this._findHiddenSubset(grid, candidates, 4, 'hidden_quad', 'Hidden Quad');
  }

  _findNakedSubset(grid, candidates, size, type, label) {
    const units = [...this._getRowUnits(), ...this._getColUnits(), ...this._getBoxUnits()];
    for (const unit of units) {
      const emptyCells = unit.cells.filter(([r, c]) =>
        grid[r][c] === 0 && candidates[r][c].size >= 2 && candidates[r][c].size <= size
      );
      if (emptyCells.length < size) continue;

      for (const combo of this._combinations(emptyCells, size)) {
        const union = new Set();
        combo.forEach(([r, c]) => candidates[r][c].forEach(v => union.add(v)));
        if (union.size !== size) continue;

        const vals = [...union].sort((a, b) => a - b);
        const comboKeys = new Set(combo.map(([r, c]) => `${r},${c}`));
        const eliminations = [];
        for (const [r, c] of unit.cells) {
          if (comboKeys.has(`${r},${c}`) || grid[r][c] !== 0) continue;
          for (const v of vals) {
            if (candidates[r][c].has(v)) eliminations.push({ row: r, col: c, val: v });
          }
        }
        if (eliminations.length === 0) continue;

        const highlights = combo.map(([r, c]) => ({ row: r, col: c, color: 'primary' }));
        const elimCells = new Set();
        for (const e of eliminations) {
          elimCells.add(`R${e.row + 1}C${e.col + 1}`);
          if (!highlights.some(h => h.row === e.row && h.col === e.col)) {
            highlights.push({ row: e.row, col: e.col, color: 'warning' });
          }
        }
        return {
          type, cell: null, value: null, eliminationValue: vals, eliminations,
          explanation: `<strong>${label}</strong> in ${unit.name}: ${this._formatCells(combo)} contain only {${vals.join(', ')}}. These digits are eliminated from ${[...elimCells].join(', ')}.`,
          highlights,
        };
      }
    }
    return null;
  }

  _findHiddenSubset(grid, candidates, size, type, label) {
    const units = [...this._getRowUnits(), ...this._getColUnits(), ...this._getBoxUnits()];
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const unit of units) {
      const empty = unit.cells.filter(([r, c]) => grid[r][c] === 0);
      if (empty.length < size) continue;

      for (const vals of this._combinations(digits, size)) {
        const cells = empty.filter(([r, c]) => vals.some(v => candidates[r][c].has(v)));
        if (cells.length !== size) continue;
        if (!vals.every(v => cells.some(([r, c]) => candidates[r][c].has(v)))) continue;

        const eliminations = [];
        for (const [r, c] of cells) {
          for (const v of candidates[r][c]) {
            if (!vals.includes(v)) eliminations.push({ row: r, col: c, val: v });
          }
        }
        if (eliminations.length === 0) continue;

        const highlights = cells.map(([r, c]) => ({ row: r, col: c, color: 'primary' }));
        return {
          type, cell: null, value: null, eliminationValue: vals, eliminations,
          explanation: `<strong>${label}</strong> in ${unit.name}: {${vals.join(', ')}} can only appear in ${this._formatCells(cells)}. Other candidates are removed from those cells.`,
          highlights,
        };
      }
    }
    return null;
  }

  _findXWing(grid, candidates) {
    for (let v = 1; v <= 9; v++) {
      // Row-based X-Wing
      const rowPositions = [];
      for (let r = 0; r < 9; r++) {
        const cols = [];
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0 && candidates[r][c].has(v)) cols.push(c);
        }
        if (cols.length === 2) rowPositions.push({ row: r, cols });
      }
      for (let i = 0; i < rowPositions.length; i++) {
        for (let j = i + 1; j < rowPositions.length; j++) {
          if (rowPositions[i].cols[0] === rowPositions[j].cols[0] && rowPositions[i].cols[1] === rowPositions[j].cols[1]) {
            const r1 = rowPositions[i].row, r2 = rowPositions[j].row;
            const c1 = rowPositions[i].cols[0], c2 = rowPositions[i].cols[1];
            const eliminations = [];
            for (let r = 0; r < 9; r++) {
              if (r === r1 || r === r2) continue;
              if (grid[r][c1] === 0 && candidates[r][c1].has(v)) eliminations.push({ row: r, col: c1 });
              if (grid[r][c2] === 0 && candidates[r][c2].has(v)) eliminations.push({ row: r, col: c2 });
            }
            if (eliminations.length === 0) continue;
            const highlights = [
              { row: r1, col: c1, color: 'primary' }, { row: r1, col: c2, color: 'primary' },
              { row: r2, col: c1, color: 'primary' }, { row: r2, col: c2, color: 'primary' },
            ];
            eliminations.forEach(e => highlights.push({ row: e.row, col: e.col, color: 'warning' }));
            return {
              type: 'x_wing', cell: null, value: null, eliminationValue: v, eliminations,
              explanation: `<strong>X-Wing</strong> on digit <strong>${v}</strong>: Rows ${r1 + 1} and ${r2 + 1} have ${v} only in columns ${c1 + 1} and ${c2 + 1}. Eliminated from other cells in those columns.`,
              highlights,
            };
          }
        }
      }
      // Column-based X-Wing
      const colPositions = [];
      for (let c = 0; c < 9; c++) {
        const rows = [];
        for (let r = 0; r < 9; r++) {
          if (grid[r][c] === 0 && candidates[r][c].has(v)) rows.push(r);
        }
        if (rows.length === 2) colPositions.push({ col: c, rows });
      }
      for (let i = 0; i < colPositions.length; i++) {
        for (let j = i + 1; j < colPositions.length; j++) {
          if (colPositions[i].rows[0] === colPositions[j].rows[0] && colPositions[i].rows[1] === colPositions[j].rows[1]) {
            const c1 = colPositions[i].col, c2 = colPositions[j].col;
            const r1 = colPositions[i].rows[0], r2 = colPositions[i].rows[1];
            const eliminations = [];
            for (let c = 0; c < 9; c++) {
              if (c === c1 || c === c2) continue;
              if (grid[r1][c] === 0 && candidates[r1][c].has(v)) eliminations.push({ row: r1, col: c });
              if (grid[r2][c] === 0 && candidates[r2][c].has(v)) eliminations.push({ row: r2, col: c });
            }
            if (eliminations.length === 0) continue;
            const highlights = [
              { row: r1, col: c1, color: 'primary' }, { row: r1, col: c2, color: 'primary' },
              { row: r2, col: c1, color: 'primary' }, { row: r2, col: c2, color: 'primary' },
            ];
            eliminations.forEach(e => highlights.push({ row: e.row, col: e.col, color: 'warning' }));
            return {
              type: 'x_wing', cell: null, value: null, eliminationValue: v, eliminations,
              explanation: `<strong>X-Wing</strong> on digit <strong>${v}</strong>: Columns ${c1 + 1} and ${c2 + 1} have ${v} only in rows ${r1 + 1} and ${r2 + 1}. Eliminated from other cells in those rows.`,
              highlights,
            };
          }
        }
      }
    }
    return null;
  }

  // ── XY-Wing ───────────────────────────────────────────
  _findXYWing(grid, candidates) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] !== 0 || candidates[r][c].size !== 2) continue;
        const [x, y] = [...candidates[r][c]];
        // Find wing cells that are peers of pivot
        const peers = this._getPeers(r, c);
        const wings = [];
        for (const [pr, pc] of peers) {
          if (grid[pr][pc] !== 0 || candidates[pr][pc].size !== 2) continue;
          const s = candidates[pr][pc];
          if ((s.has(x) && !s.has(y)) || (s.has(y) && !s.has(x))) wings.push([pr, pc]);
        }
        for (let i = 0; i < wings.length; i++) {
          for (let j = i + 1; j < wings.length; j++) {
            const [r1, c1] = wings[i], [r2, c2] = wings[j];
            const s1 = candidates[r1][c1], s2 = candidates[r2][c2];
            // One wing has {x,z}, other has {y,z}
            let z = null;
            for (const v of s1) { if (v !== x && v !== y && s2.has(v)) z = v; }
            if (z === null) continue;
            if (!((s1.has(x) && s1.has(z) && s2.has(y) && s2.has(z)) || (s1.has(y) && s1.has(z) && s2.has(x) && s2.has(z)))) continue;
            // Eliminate z from cells that see both wings
            const peers1 = new Set(this._getPeers(r1, c1).map(([a, b]) => `${a},${b}`));
            const peers2 = new Set(this._getPeers(r2, c2).map(([a, b]) => `${a},${b}`));
            const eliminations = [];
            for (const key of peers1) {
              if (!peers2.has(key)) continue;
              const [er, ec] = key.split(',').map(Number);
              if (er === r && ec === c) continue;
              if (er === r1 && ec === c1) continue;
              if (er === r2 && ec === c2) continue;
              if (grid[er][ec] === 0 && candidates[er][ec].has(z)) eliminations.push({ row: er, col: ec });
            }
            if (eliminations.length === 0) continue;
            const highlights = [
              { row: r, col: c, color: 'info' },
              { row: r1, col: c1, color: 'primary' },
              { row: r2, col: c2, color: 'primary' },
            ];
            eliminations.forEach(e => highlights.push({ row: e.row, col: e.col, color: 'warning' }));
            return {
              type: 'xy_wing', cell: null, value: null, eliminationValue: z, eliminations,
              explanation: `<strong>XY-Wing</strong>: Pivot R${r + 1}C${c + 1} {${x},${y}} with wings R${r1 + 1}C${c1 + 1} and R${r2 + 1}C${c2 + 1}. Digit <strong>${z}</strong> eliminated from cells seeing both wings.`,
              highlights,
            };
          }
        }
      }
    }
    return null;
  }

  // ── Swordfish (3-Fish) ───────────────────────────────
  _findSwordfish(grid, candidates) {
    return this._findFish(grid, candidates, 3, 'swordfish', 'Swordfish');
  }

  // ── Jellyfish (4-Fish) ──────────────────────────────
  _findJellyfish(grid, candidates) {
    return this._findFish(grid, candidates, 4, 'jellyfish', 'Jellyfish');
  }

  /**
   * Generalized Fish finder (Swordfish=3, Jellyfish=4)
   * N rows where digit v appears in at most N columns → eliminate v from those columns outside the N rows
   */
  _findFish(grid, candidates, size, type, label) {
    for (let v = 1; v <= 9; v++) {
      // Row-based fish
      const rowData = [];
      for (let r = 0; r < 9; r++) {
        const cols = [];
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0 && candidates[r][c].has(v)) cols.push(c);
        }
        if (cols.length >= 2 && cols.length <= size) rowData.push({ idx: r, positions: cols });
      }
      const rowResult = this._checkFishCombos(grid, candidates, v, rowData, size, type, label, 'row');
      if (rowResult) return rowResult;

      // Column-based fish
      const colData = [];
      for (let c = 0; c < 9; c++) {
        const rows = [];
        for (let r = 0; r < 9; r++) {
          if (grid[r][c] === 0 && candidates[r][c].has(v)) rows.push(r);
        }
        if (rows.length >= 2 && rows.length <= size) colData.push({ idx: c, positions: rows });
      }
      const colResult = this._checkFishCombos(grid, candidates, v, colData, size, type, label, 'col');
      if (colResult) return colResult;
    }
    return null;
  }

  _checkFishCombos(grid, candidates, v, data, size, type, label, orientation) {
    if (data.length < size) return null;
    for (const combo of this._combinations(data, size)) {
      const coverSet = new Set();
      combo.forEach(d => d.positions.forEach(p => coverSet.add(p)));
      if (coverSet.size > size) continue;

      const baseIndices = new Set(combo.map(d => d.idx));
      const coverIndices = [...coverSet];
      const eliminations = [];

      for (const ci of coverIndices) {
        for (let i = 0; i < 9; i++) {
          if (baseIndices.has(i)) continue;
          const [r, c] = orientation === 'row' ? [i, ci] : [ci, i];
          if (grid[r][c] === 0 && candidates[r][c].has(v)) {
            eliminations.push({ row: r, col: c });
          }
        }
      }
      if (eliminations.length === 0) continue;

      const highlights = [];
      for (const d of combo) {
        for (const p of d.positions) {
          const [r, c] = orientation === 'row' ? [d.idx, p] : [p, d.idx];
          highlights.push({ row: r, col: c, color: 'primary' });
        }
      }
      eliminations.forEach(e => highlights.push({ row: e.row, col: e.col, color: 'warning' }));

      const baseLabel = orientation === 'row' ? 'Rows' : 'Columns';
      const coverLabel = orientation === 'row' ? 'columns' : 'rows';
      const baseNums = combo.map(d => d.idx + 1).join(', ');
      const coverNums = coverIndices.map(i => i + 1).join(', ');

      return {
        type, cell: null, value: null, eliminationValue: v, eliminations,
        explanation: `<strong>${label}</strong> on digit <strong>${v}</strong>: ${baseLabel} ${baseNums} contain ${v} only in ${coverLabel} ${coverNums}. Eliminated from other cells in those ${coverLabel}.`,
        highlights,
      };
    }
    return null;
  }

  // ── Skyscraper ──────────────────────────────────────
  _findSkyscraper(grid, candidates) {
    for (let v = 1; v <= 9; v++) {
      // Find rows with exactly 2 positions for digit v
      const rows = [];
      for (let r = 0; r < 9; r++) {
        const cols = [];
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0 && candidates[r][c].has(v)) cols.push(c);
        }
        if (cols.length === 2) rows.push({ row: r, cols });
      }
      // Try pairs of rows sharing one column (the "base")
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          const r1 = rows[i], r2 = rows[j];
          let sharedCol = -1, endCol1 = -1, endCol2 = -1;
          if (r1.cols[0] === r2.cols[0]) { sharedCol = r1.cols[0]; endCol1 = r1.cols[1]; endCol2 = r2.cols[1]; }
          else if (r1.cols[0] === r2.cols[1]) { sharedCol = r1.cols[0]; endCol1 = r1.cols[1]; endCol2 = r2.cols[0]; }
          else if (r1.cols[1] === r2.cols[0]) { sharedCol = r1.cols[1]; endCol1 = r1.cols[0]; endCol2 = r2.cols[1]; }
          else if (r1.cols[1] === r2.cols[1]) { sharedCol = r1.cols[1]; endCol1 = r1.cols[0]; endCol2 = r2.cols[0]; }
          if (sharedCol === -1 || endCol1 === endCol2) continue;

          // Eliminate v from cells that see BOTH end cells
          const peers1 = new Set(this._getPeers(r1.row, endCol1).map(([a, b]) => `${a},${b}`));
          const eliminations = [];
          for (const [pr, pc] of this._getPeers(r2.row, endCol2)) {
            if (pr === r1.row && pc === endCol1) continue;
            if (pr === r2.row && pc === endCol2) continue;
            if (peers1.has(`${pr},${pc}`) && grid[pr][pc] === 0 && candidates[pr][pc].has(v)) {
              eliminations.push({ row: pr, col: pc });
            }
          }
          if (eliminations.length === 0) continue;

          const highlights = [
            { row: r1.row, col: sharedCol, color: 'info' },
            { row: r2.row, col: sharedCol, color: 'info' },
            { row: r1.row, col: endCol1, color: 'primary' },
            { row: r2.row, col: endCol2, color: 'primary' },
          ];
          eliminations.forEach(e => highlights.push({ row: e.row, col: e.col, color: 'warning' }));
          return {
            type: 'skyscraper', cell: null, value: null, eliminationValue: v, eliminations,
            explanation: `<strong>Skyscraper</strong> on digit <strong>${v}</strong>: Rows ${r1.row + 1} and ${r2.row + 1} form a skyscraper linked at column ${sharedCol + 1}. Digit ${v} eliminated from cells seeing both endpoints.`,
            highlights,
          };
        }
      }
      // Column-based skyscraper
      const cols = [];
      for (let c = 0; c < 9; c++) {
        const rs = [];
        for (let r = 0; r < 9; r++) {
          if (grid[r][c] === 0 && candidates[r][c].has(v)) rs.push(r);
        }
        if (rs.length === 2) cols.push({ col: c, rows: rs });
      }
      for (let i = 0; i < cols.length; i++) {
        for (let j = i + 1; j < cols.length; j++) {
          const c1 = cols[i], c2 = cols[j];
          let sharedRow = -1, endRow1 = -1, endRow2 = -1;
          if (c1.rows[0] === c2.rows[0]) { sharedRow = c1.rows[0]; endRow1 = c1.rows[1]; endRow2 = c2.rows[1]; }
          else if (c1.rows[0] === c2.rows[1]) { sharedRow = c1.rows[0]; endRow1 = c1.rows[1]; endRow2 = c2.rows[0]; }
          else if (c1.rows[1] === c2.rows[0]) { sharedRow = c1.rows[1]; endRow1 = c1.rows[0]; endRow2 = c2.rows[1]; }
          else if (c1.rows[1] === c2.rows[1]) { sharedRow = c1.rows[1]; endRow1 = c1.rows[0]; endRow2 = c2.rows[0]; }
          if (sharedRow === -1 || endRow1 === endRow2) continue;

          const peers1 = new Set(this._getPeers(endRow1, c1.col).map(([a, b]) => `${a},${b}`));
          const eliminations = [];
          for (const [pr, pc] of this._getPeers(endRow2, c2.col)) {
            if (pr === endRow1 && pc === c1.col) continue;
            if (pr === endRow2 && pc === c2.col) continue;
            if (peers1.has(`${pr},${pc}`) && grid[pr][pc] === 0 && candidates[pr][pc].has(v)) {
              eliminations.push({ row: pr, col: pc });
            }
          }
          if (eliminations.length === 0) continue;

          const highlights = [
            { row: sharedRow, col: c1.col, color: 'info' },
            { row: sharedRow, col: c2.col, color: 'info' },
            { row: endRow1, col: c1.col, color: 'primary' },
            { row: endRow2, col: c2.col, color: 'primary' },
          ];
          eliminations.forEach(e => highlights.push({ row: e.row, col: e.col, color: 'warning' }));
          return {
            type: 'skyscraper', cell: null, value: null, eliminationValue: v, eliminations,
            explanation: `<strong>Skyscraper</strong> on digit <strong>${v}</strong>: Columns ${c1.col + 1} and ${c2.col + 1} form a skyscraper linked at row ${sharedRow + 1}. Digit ${v} eliminated from cells seeing both endpoints.`,
            highlights,
          };
        }
      }
    }
    return null;
  }

  // ── Two-String Kite ─────────────────────────────────
  _findTwoStringKite(grid, candidates) {
    for (let v = 1; v <= 9; v++) {
      // Find rows and cols with exactly 2 positions for v
      const rowPairs = [];
      for (let r = 0; r < 9; r++) {
        const cs = [];
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0 && candidates[r][c].has(v)) cs.push(c);
        }
        if (cs.length === 2) rowPairs.push({ row: r, cols: cs });
      }
      const colPairs = [];
      for (let c = 0; c < 9; c++) {
        const rs = [];
        for (let r = 0; r < 9; r++) {
          if (grid[r][c] === 0 && candidates[r][c].has(v)) rs.push(r);
        }
        if (rs.length === 2) colPairs.push({ col: c, rows: rs });
      }
      // Try each row-col pair connected through a box
      for (const rp of rowPairs) {
        for (const cp of colPairs) {
          // Check which endpoints share a box
          for (const rc of rp.cols) {
            for (const cr of cp.rows) {
              const boxR = Math.floor(rp.row / 3), boxC = Math.floor(rc / 3);
              const boxR2 = Math.floor(cr / 3), boxC2 = Math.floor(cp.col / 3);
              if (boxR === boxR2 && boxC === boxC2) {
                // These two share a box — the OTHER endpoints form the kite string
                const otherRowCol = rp.cols[0] === rc ? rp.cols[1] : rp.cols[0];
                const otherColRow = cp.rows[0] === cr ? cp.rows[1] : cp.rows[0];
                // Eliminate v from cell at intersection of other endpoints' peers
                const targetR = otherColRow;
                const targetC = otherRowCol;
                if (grid[targetR][targetC] === 0 && candidates[targetR][targetC].has(v)) {
                  const eliminations = [{ row: targetR, col: targetC }];
                  const highlights = [
                    { row: rp.row, col: rc, color: 'info' },
                    { row: cr, col: cp.col, color: 'info' },
                    { row: rp.row, col: otherRowCol, color: 'primary' },
                    { row: otherColRow, col: cp.col, color: 'primary' },
                    { row: targetR, col: targetC, color: 'warning' },
                  ];
                  return {
                    type: 'two_string_kite', cell: null, value: null, eliminationValue: v, eliminations,
                    explanation: `<strong>Two-String Kite</strong> on digit <strong>${v}</strong>: Row ${rp.row + 1} and Column ${cp.col + 1} are linked through Box. Digit ${v} eliminated from R${targetR + 1}C${targetC + 1}.`,
                    highlights,
                  };
                }
              }
            }
          }
        }
      }
    }
    return null;
  }

  // ── Search Proof (Contradiction Fallback) ───────────
  _findSearchProof(grid, candidates) {
    // Find the empty cell with fewest candidates
    let minSize = 10, bestR = -1, bestC = -1;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] !== 0) continue;
        const sz = candidates[r][c].size;
        if (sz > 0 && sz < minSize) { minSize = sz; bestR = r; bestC = c; }
      }
    }
    if (bestR === -1) return null;

    const cands = [...candidates[bestR][bestC]];
    // Try each candidate — if it leads to contradiction, eliminate it
    const eliminated = [];
    for (const tryVal of cands) {
      const testGrid = grid.map(row => [...row]);
      testGrid[bestR][bestC] = tryVal;
      if (this._leadsToContradiction(testGrid)) {
        eliminated.push(tryVal);
      }
    }

    if (eliminated.length === 0) return null;

    // If all but one eliminated → we know the answer
    const remaining = cands.filter(v => !eliminated.includes(v));
    if (remaining.length === 1) {
      return {
        type: 'search_proof', cell: { row: bestR, col: bestC }, value: remaining[0],
        explanation: `<strong>Proof by Contradiction</strong>: At R${bestR + 1}C${bestC + 1}, trying ${eliminated.join(', ')} each leads to a contradiction. The only valid digit is <strong>${remaining[0]}</strong>.`,
        highlights: [{ row: bestR, col: bestC, color: 'success' }],
      };
    }

    // Otherwise, report eliminations
    const eliminations = eliminated.map(val => ({ row: bestR, col: bestC, val }));
    return {
      type: 'search_proof', cell: null, value: null, eliminationValue: eliminated, eliminations,
      explanation: `<strong>Proof by Contradiction</strong>: At R${bestR + 1}C${bestC + 1}, ${eliminated.length > 1 ? 'digits ' + eliminated.join(', ') + ' each lead' : 'digit ' + eliminated[0] + ' leads'} to a contradiction and can be eliminated.`,
      highlights: [{ row: bestR, col: bestC, color: 'warning' }],
    };
  }

  /**
   * Quick check: does placing a value lead to an invalid state?
   * Uses constraint propagation + limited backtrack depth
   */
  _leadsToContradiction(grid) {
    const cm = new CandidateManager();
    const cands = cm.calculate(grid);
    // Check for empty cells with no candidates
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === 0 && cands[r][c].size === 0) return true;
      }
    }
    // Propagate naked singles up to 81 times
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 81) {
      changed = false;
      iterations++;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] !== 0) continue;
          if (cands[r][c].size === 0) return true; // contradiction
          if (cands[r][c].size === 1) {
            const val = [...cands[r][c]][0];
            grid[r][c] = val;
            changed = true;
            // Update candidates
            for (let i = 0; i < 9; i++) {
              cands[r][i].delete(val);
              cands[i][c].delete(val);
            }
            const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
            for (let rr = br; rr < br + 3; rr++)
              for (let cc = bc; cc < bc + 3; cc++)
                cands[rr][cc].delete(val);
            cands[r][c].clear();
            // Check for resulting empty candidates
            for (let i = 0; i < 9; i++) {
              if (grid[r][i] === 0 && cands[r][i].size === 0) return true;
              if (grid[i][c] === 0 && cands[i][c].size === 0) return true;
            }
          }
        }
      }
    }
    // Check for duplicate values in any unit
    for (let i = 0; i < 9; i++) {
      const rowVals = [], colVals = [];
      for (let j = 0; j < 9; j++) {
        if (grid[i][j] !== 0) rowVals.push(grid[i][j]);
        if (grid[j][i] !== 0) colVals.push(grid[j][i]);
      }
      if (new Set(rowVals).size !== rowVals.length) return true;
      if (new Set(colVals).size !== colVals.length) return true;
    }
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const boxVals = [];
        for (let r = br * 3; r < br * 3 + 3; r++)
          for (let c = bc * 3; c < bc * 3 + 3; c++)
            if (grid[r][c] !== 0) boxVals.push(grid[r][c]);
        if (new Set(boxVals).size !== boxVals.length) return true;
      }
    }
    return false;
  }

  _getPeers(row, col) {
    const peers = [];
    const added = new Set();
    const add = (r, c) => { const k = `${r},${c}`; if (!added.has(k) && !(r === row && c === col)) { added.add(k); peers.push([r, c]); } };
    for (let i = 0; i < 9; i++) { add(row, i); add(i, col); }
    const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) add(r, c);
    return peers;
  }

  // ── Full Solve (Backtracking) ──────────────────────
  solveComplete(grid) {
    const copy = grid.map(row => [...row]);
    if (this._backtrack(copy)) return copy;
    return null;
  }

  _backtrack(grid) {
    // Find empty cell with fewest candidates (MRV heuristic)
    let minCands = 10, bestR = -1, bestC = -1;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] !== 0) continue;
        const cands = this.cm._computeForCell(grid, r, c);
        if (cands.size === 0) return false;
        if (cands.size < minCands) {
          minCands = cands.size;
          bestR = r;
          bestC = c;
        }
      }
    }
    if (bestR === -1) return true; // All filled

    const cands = this.cm._computeForCell(grid, bestR, bestC);
    for (const v of cands) {
      grid[bestR][bestC] = v;
      if (this._backtrack(grid)) return true;
      grid[bestR][bestC] = 0;
    }
    return false;
  }

  // ── Elimination Tracking ────────────────────────────
  _storeEliminations(step) {
    if (!step.eliminations) return;
    for (const e of step.eliminations) {
      const key = `${e.row},${e.col}`;
      if (!this.eliminatedCandidates.has(key)) {
        this.eliminatedCandidates.set(key, new Set());
      }
      const set = this.eliminatedCandidates.get(key);
      if (e.val !== undefined) {
        // Per-cell elimination value (naked pair/triple/hidden pair)
        set.add(e.val);
      } else if (step.eliminationValue !== undefined) {
        // Shared elimination value (pointing pair, box/line, x-wing)
        if (Array.isArray(step.eliminationValue)) {
          for (const v of step.eliminationValue) set.add(v);
        } else {
          set.add(step.eliminationValue);
        }
      }
    }
  }

  /**
   * Apply a single step's eliminations directly to candidates array
   */
  _applyStepEliminations(step, candidates) {
    if (!step.eliminations) return;
    for (const e of step.eliminations) {
      if (!candidates[e.row] || !candidates[e.row][e.col]) continue;
      if (e.val !== undefined) {
        candidates[e.row][e.col].delete(e.val);
      } else if (step.eliminationValue !== undefined) {
        if (Array.isArray(step.eliminationValue)) {
          for (const v of step.eliminationValue) candidates[e.row][e.col].delete(v);
        } else {
          candidates[e.row][e.col].delete(step.eliminationValue);
        }
      }
    }
  }

  _applyEliminations(candidates, grid) {
    for (const [key, eliminated] of this.eliminatedCandidates) {
      const [r, c] = key.split(',').map(Number);
      // Only apply if cell is still empty
      if (grid[r][c] === 0 && candidates[r] && candidates[r][c]) {
        for (const v of eliminated) {
          candidates[r][c].delete(v);
        }
      }
    }
  }

  // ── Unit Helpers ───────────────────────────────────
  _getRowUnits() {
    const units = [];
    for (let r = 0; r < 9; r++) {
      const cells = [];
      for (let c = 0; c < 9; c++) cells.push([r, c]);
      units.push({ type: 'row', name: `Row ${r + 1}`, cells });
    }
    return units;
  }

  _getColUnits() {
    const units = [];
    for (let c = 0; c < 9; c++) {
      const cells = [];
      for (let r = 0; r < 9; r++) cells.push([r, c]);
      units.push({ type: 'column', name: `Column ${c + 1}`, cells });
    }
    return units;
  }

  _getBoxUnits() {
    const units = [];
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const cells = [];
        for (let r = br * 3; r < br * 3 + 3; r++)
          for (let c = bc * 3; c < bc * 3 + 3; c++)
            cells.push([r, c]);
        units.push({ type: 'box', name: `Box ${br * 3 + bc + 1}`, cells });
      }
    }
    return units;
  }

  _addPeerHighlights(grid, row, col, highlights) {
    const added = new Set();
    const add = (r, c) => {
      const key = `${r},${c}`;
      if (added.has(key) || (r === row && c === col)) return;
      if (grid[r][c] !== 0) {
        added.add(key);
        highlights.push({ row: r, col: c, color: 'info' });
      }
    };
    for (let i = 0; i < 9; i++) {
      add(row, i);
      add(i, col);
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++)
      for (let c = bc; c < bc + 3; c++)
        add(r, c);
  }

  // ── Utility Helpers ─────────────────────────────────
  *_combinations(arr, size) {
    if (size === 1) {
      for (const item of arr) yield [item];
    } else if (size > 1 && arr.length >= size) {
      for (let i = 0; i <= arr.length - size; i++) {
        for (const rest of this._combinations(arr.slice(i + 1), size - 1)) {
          yield [arr[i], ...rest];
        }
      }
    }
  }

  _formatCells(cells) {
    return cells.map(([r, c]) => `R${r + 1}C${c + 1}`).join(', ');
  }
}
