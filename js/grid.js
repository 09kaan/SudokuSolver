/**
 * Sudoku Grid UI — rendering, interaction, editing
 */
export class SudokuGrid {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    this.originalCells = new Set(); // "r,c" strings
    this.selectedCell = null;
    this.editing = false;
    this.onCellChange = null; // callback
    this._build();
    this._bindKeyboard();
  }

  /* ── Build DOM ───────────────────────────────── */
  _build() {
    this.container.innerHTML = '';
    this.table = document.createElement('div');
    this.table.className = 'sudoku-grid';
    this.cells = [];

    for (let r = 0; r < 9; r++) {
      this.cells[r] = [];
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement('div');
        cell.className = 'sudoku-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;

        // Box borders
        if (c % 3 === 0 && c !== 0) cell.classList.add('box-left');
        if (r % 3 === 0 && r !== 0) cell.classList.add('box-top');

        const valSpan = document.createElement('span');
        valSpan.className = 'cell-value';
        cell.appendChild(valSpan);

        const candDiv = document.createElement('div');
        candDiv.className = 'cell-candidates';
        for (let n = 1; n <= 9; n++) {
          const s = document.createElement('span');
          s.textContent = n;
          s.dataset.n = n;
          candDiv.appendChild(s);
        }
        cell.appendChild(candDiv);

        cell.addEventListener('click', (e) => { e.stopPropagation(); this._onCellClick(r, c); });
        this.table.appendChild(cell);
        this.cells[r][c] = cell;
      }
    }

    this.container.appendChild(this.table);
    this._buildNumberPicker();
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (!this.selectedCell) return;
      const [r, c] = this.selectedCell;

      // Number keys 1-9
      if (e.key >= '1' && e.key <= '9' && this.editing && !this.originalCells.has(`${r},${c}`)) {
        e.preventDefault();
        this.setValue(r, c, parseInt(e.key), false);
        this.picker.classList.add('hidden');
        if (this.onCellChange) this.onCellChange(r, c, parseInt(e.key));
        // Auto-advance to next cell
        const nc = c < 8 ? c + 1 : 0;
        const nr = c < 8 ? r : (r < 8 ? r + 1 : 0);
        this._onCellClick(nr, nc);
      }
      // Delete / Backspace to clear
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.editing && !this.originalCells.has(`${r},${c}`)) {
        e.preventDefault();
        this.setValue(r, c, 0, false);
        this.picker.classList.add('hidden');
        if (this.onCellChange) this.onCellChange(r, c, 0);
      }
      // Arrow key navigation
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        let nr = r, nc = c;
        if (e.key === 'ArrowUp' && r > 0) nr--;
        if (e.key === 'ArrowDown' && r < 8) nr++;
        if (e.key === 'ArrowLeft' && c > 0) nc--;
        if (e.key === 'ArrowRight' && c < 8) nc++;
        this.picker.classList.add('hidden');
        this._onCellClick(nr, nc);
      }
      // Escape to close picker
      else if (e.key === 'Escape') {
        this.picker.classList.add('hidden');
      }
    });
  }

  _buildNumberPicker() {
    this.picker = document.createElement('div');
    this.picker.className = 'number-picker hidden';
    this.picker.id = 'number-picker';
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement('button');
      btn.textContent = n;
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._pickNumber(n); });
      this.picker.appendChild(btn);
    }
    const clr = document.createElement('button');
    clr.textContent = '✕';
    clr.className = 'picker-clear';
    clr.addEventListener('click', (e) => { e.stopPropagation(); this._pickNumber(0); });
    this.picker.appendChild(clr);
    document.body.appendChild(this.picker);

    document.addEventListener('click', (e) => {
      if (!this.picker.contains(e.target)) this.picker.classList.add('hidden');
    });
  }

  /* ── Public API ──────────────────────────────── */
  loadPuzzle(puzzle, originals) {
    this.grid = puzzle.map(r => [...r]);
    this.originalCells = new Set(originals || []);
    // If no originals specified, mark all filled cells as original
    if (!originals) {
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (this.grid[r][c] !== 0) this.originalCells.add(`${r},${c}`);
    }
    this._render();
  }

  getGrid() {
    return this.grid.map(r => [...r]);
  }

  getOriginals() {
    return new Set(this.originalCells);
  }

  setValue(row, col, value, animate = true) {
    this.grid[row][col] = value;
    const cell = this.cells[row][col];
    const valSpan = cell.querySelector('.cell-value');
    valSpan.textContent = value || '';

    cell.classList.remove('original', 'solved');
    if (value !== 0) {
      cell.classList.add('solved');
      if (animate) {
        cell.classList.add('pop-in');
        setTimeout(() => cell.classList.remove('pop-in'), 400);
      }
    }
    cell.querySelector('.cell-candidates').style.display = value ? 'none' : '';
  }

  highlightCells(highlights) {
    this.clearHighlights();
    for (const h of highlights) {
      const cell = this.cells[h.row][h.col];
      cell.classList.add(`hl-${h.color}`);
    }
  }

  clearHighlights() {
    const colors = ['success', 'info', 'warning', 'primary', 'secondary'];
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        colors.forEach(cl => this.cells[r][c].classList.remove(`hl-${cl}`));
  }

  showCandidates(candidates) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = this.cells[r][c];
        const candDiv = cell.querySelector('.cell-candidates');
        if (this.grid[r][c] !== 0) {
          candDiv.style.display = 'none';
          continue;
        }
        candDiv.style.display = '';
        const cands = candidates[r][c];
        for (let n = 1; n <= 9; n++) {
          const s = candDiv.querySelector(`[data-n="${n}"]`);
          s.style.visibility = cands.has(n) ? 'visible' : 'hidden';
        }
      }
    }
  }

  enableEditing() { this.editing = true; }
  disableEditing() { this.editing = false; this.picker.classList.add('hidden'); }

  /**
   * Lock all currently filled cells as originals
   * Used after manual entry to distinguish puzzle givens from solved cells
   */
  lockAsOriginals() {
    this.originalCells = new Set();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] !== 0) {
          this.originalCells.add(`${r},${c}`);
        }
      }
    }
    this._render();
  }

  /* ── Private ─────────────────────────────────── */
  _render() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = this.cells[r][c];
        const v = this.grid[r][c];
        const valSpan = cell.querySelector('.cell-value');
        const candDiv = cell.querySelector('.cell-candidates');
        valSpan.textContent = v || '';
        cell.classList.remove('original', 'solved', 'selected');
        if (v !== 0) {
          cell.classList.add(this.originalCells.has(`${r},${c}`) ? 'original' : 'solved');
          candDiv.style.display = 'none';
        } else {
          candDiv.style.display = 'none'; // hidden until showCandidates called
        }
      }
    }
  }

  _onCellClick(r, c) {
    // Deselect previous
    if (this.selectedCell) {
      const [pr, pc] = this.selectedCell;
      this.cells[pr][pc].classList.remove('selected');
    }
    this.selectedCell = [r, c];
    this.cells[r][c].classList.add('selected');

    // Highlight all cells with the same number
    this._highlightSameNumber(r, c);

    if (this.editing && !this.originalCells.has(`${r},${c}`)) {
      this._showPicker(r, c);
    }
  }

  _highlightSameNumber(r, c) {
    // Clear previous same-value highlights
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 9; j++)
        this.cells[i][j].classList.remove('same-value', 'same-peer');

    const val = this.grid[r][c];
    if (val === 0) return;

    // Highlight all cells with same value
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (i === r && j === c) continue;
        if (this.grid[i][j] === val) {
          this.cells[i][j].classList.add('same-value');
        }
      }
    }

    // Highlight peer cells (same row, col, box)
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 9; i++) {
      if (i !== c && this.grid[r][i] === 0) this.cells[r][i].classList.add('same-peer');
      if (i !== r && this.grid[i][c] === 0) this.cells[i][c].classList.add('same-peer');
    }
    for (let i = br; i < br + 3; i++)
      for (let j = bc; j < bc + 3; j++)
        if (!(i === r && j === c) && this.grid[i][j] === 0)
          this.cells[i][j].classList.add('same-peer');
  }

  _showPicker(r, c) {
    const cell = this.cells[r][c];
    const rect = cell.getBoundingClientRect();
    this.picker.classList.remove('hidden');
    this.picker.style.top = `${rect.bottom + 8}px`;
    this.picker.style.left = `${rect.left + rect.width / 2}px`;
    this._pickerTarget = { row: r, col: c };
  }

  _pickNumber(n) {
    if (!this._pickerTarget) return;
    const { row, col } = this._pickerTarget;
    this.setValue(row, col, n, false);
    this.picker.classList.add('hidden');
    if (this.onCellChange) this.onCellChange(row, col, n);
  }
}
