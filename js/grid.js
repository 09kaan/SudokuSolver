/**
 * Sudoku Grid UI — rendering, interaction, editing
 * Mobile-first: uses fixed number pad at bottom
 */
export class SudokuGrid {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    this.originalCells = new Set();
    this.selectedCell = null;
    this.editing = false;
    this.onCellChange = null;
    this._build();
    this._bindKeyboard();
    this._bindNumberPad();
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

        if (c % 3 === 0 && c !== 0) cell.classList.add('box-left');
        if (r % 3 === 0 && r !== 0) cell.classList.add('box-top');

        // Alternating 3x3 box shading (diagonal pattern)
        const boxR = Math.floor(r / 3), boxC = Math.floor(c / 3);
        if ((boxR + boxC) % 2 === 0) cell.classList.add('box-shaded');

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

        // Notes container
        const notesDiv = document.createElement('div');
        notesDiv.className = 'cell-notes';
        notesDiv.style.display = 'none';
        for (let n = 1; n <= 9; n++) {
          const s = document.createElement('span');
          s.dataset.n = n;
          s.style.visibility = 'hidden';
          notesDiv.appendChild(s);
        }
        cell.appendChild(notesDiv);

        cell.addEventListener('click', (e) => { e.stopPropagation(); this._onCellClick(r, c); });
        this.table.appendChild(cell);
        this.cells[r][c] = cell;
      }
    }

    this.container.appendChild(this.table);
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (!this.selectedCell) return;
      const [r, c] = this.selectedCell;

      if (e.key >= '1' && e.key <= '9' && this.editing && !this.originalCells.has(`${r},${c}`)) {
        e.preventDefault();
        this.setValue(r, c, parseInt(e.key), false);
        if (this.onCellChange) this.onCellChange(r, c, parseInt(e.key));
      }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.editing && !this.originalCells.has(`${r},${c}`)) {
        e.preventDefault();
        this.setValue(r, c, 0, false);
        if (this.onCellChange) this.onCellChange(r, c, 0);
      }
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        let nr = r, nc = c;
        if (e.key === 'ArrowUp' && r > 0) nr--;
        if (e.key === 'ArrowDown' && r < 8) nr++;
        if (e.key === 'ArrowLeft' && c > 0) nc--;
        if (e.key === 'ArrowRight' && c < 8) nc++;
        this._onCellClick(nr, nc);
      }
    });
  }

  _bindNumberPad() {
    const numBtns = document.querySelectorAll('.num-btn');
    numBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!this.selectedCell || !this.editing) return;
        const [r, c] = this.selectedCell;
        if (this.originalCells.has(`${r},${c}`)) return;
        const n = parseInt(btn.dataset.num);
        this.setValue(r, c, n, false);
        if (this.onCellChange) this.onCellChange(r, c, n);
        this._updateCompletedNumbers();
      });
    });

    // Erase button
    const eraseBtn = document.getElementById('btn-erase');
    if (eraseBtn) {
      eraseBtn.addEventListener('click', () => {
        if (!this.selectedCell || !this.editing) return;
        const [r, c] = this.selectedCell;
        if (this.originalCells.has(`${r},${c}`)) return;
        this.setValue(r, c, 0, false);
        if (this.onCellChange) this.onCellChange(r, c, 0);
      });
    }
  }

  /* ── Public API ──────────────────────────────── */
  loadPuzzle(puzzle, originals) {
    this.grid = puzzle.map(r => [...r]);
    this.originalCells = new Set(originals || []);
    if (!originals) {
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (this.grid[r][c] !== 0) this.originalCells.add(`${r},${c}`);
    }
    this._render();
    this._updateCompletedNumbers();
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
      // Hide notes when value is set
      const notesDiv = cell.querySelector('.cell-notes');
      if (notesDiv) notesDiv.style.display = 'none';
    }
    cell.querySelector('.cell-candidates').style.display = value ? 'none' : '';
    this._updateCompletedNumbers();
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
        candDiv.style.display = 'grid';
        const cands = candidates[r][c];
        for (let n = 1; n <= 9; n++) {
          const s = candDiv.querySelector(`[data-n="${n}"]`);
          s.style.visibility = cands.has(n) ? 'visible' : 'hidden';
        }
      }
    }
  }

  showUserNotes(r, c, notes) {
    const cell = this.cells[r][c];
    const notesDiv = cell.querySelector('.cell-notes');
    if (!notesDiv) return;

    if (notes && notes.size > 0 && this.grid[r][c] === 0) {
      notesDiv.style.display = 'grid';
      cell.querySelector('.cell-value').textContent = '';
      for (let n = 1; n <= 9; n++) {
        const s = notesDiv.querySelector(`[data-n="${n}"]`);
        s.textContent = notes.has(n) ? n : '';
        s.style.visibility = notes.has(n) ? 'visible' : 'hidden';
      }
    } else {
      notesDiv.style.display = 'none';
    }
  }

  enableEditing() { this.editing = true; }
  disableEditing() { this.editing = false; }

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
        cell.classList.remove('original', 'solved', 'selected', 'error-cell', 'uncertain-cell');
        if (v !== 0) {
          cell.classList.add(this.originalCells.has(`${r},${c}`) ? 'original' : 'solved');
          candDiv.style.display = 'none';
        } else {
          candDiv.style.display = 'none';
        }
      }
    }
  }

  _onCellClick(r, c) {
    if (this.selectedCell) {
      const [pr, pc] = this.selectedCell;
      this.cells[pr][pc].classList.remove('selected');
    }
    this.selectedCell = [r, c];
    this.cells[r][c].classList.add('selected');
    this._highlightSameNumber(r, c);
  }

  _highlightSameNumber(r, c) {
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 9; j++)
        this.cells[i][j].classList.remove('same-value', 'same-peer');

    const val = this.grid[r][c];
    if (val === 0) return;

    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (i === r && j === c) continue;
        if (this.grid[i][j] === val) {
          this.cells[i][j].classList.add('same-value');
        }
      }
    }

    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 9; i++) {
      if (i !== c) this.cells[r][i].classList.add('same-peer');
      if (i !== r) this.cells[i][c].classList.add('same-peer');
    }
    for (let i = br; i < br + 3; i++)
      for (let j = bc; j < bc + 3; j++)
        if (!(i === r && j === c))
          this.cells[i][j].classList.add('same-peer');
  }

  _updateCompletedNumbers() {
    const counts = Array(10).fill(0);
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (this.grid[r][c] > 0) counts[this.grid[r][c]]++;

    const numBtns = document.querySelectorAll('.num-btn');
    numBtns.forEach(btn => {
      const n = parseInt(btn.dataset.num);
      btn.classList.toggle('completed', counts[n] >= 9);
    });
  }
}
