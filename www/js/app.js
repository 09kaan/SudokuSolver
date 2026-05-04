/**
 * Main Application Controller
 * Orchestrates image upload, OCR, grid display, solving, and game mode
 */
import { SudokuGrid } from './grid.js';
import { SudokuSolver } from './solver.js';
import { CandidateManager } from './candidates.js';
import { ImageProcessor } from './imageProcessor.js';
import { OCREngine } from './ocrEngine.js';
import { PuzzleLibrary } from './puzzles.js';

class App {
  constructor() {
    this.gridUI = new SudokuGrid('grid-container');
    this.solver = new SudokuSolver();
    this.candidateManager = new CandidateManager();
    this.imageProcessor = new ImageProcessor();
    this.ocrEngine = new OCREngine();


    this.hintHistory = [];
    this.hintIndex = -1;
    this.puzzleLoaded = false;

    // Game mode state
    this.gameMode = false;
    this.solution = null;
    this.undoStack = [];
    this.errorCount = 0;
    this.timerInterval = null;
    this.timerSeconds = 0;
    this.notesMode = false;
    this.userNotes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));

    // Track player moves for undo
    this.gridUI.onCellChange = (r, c, val) => this._onPlayerMove(r, c, val);

    this._bindEvents();
    this._updateUI();
  }

  /* ── Event Binding ──────────────────────────── */
  _bindEvents() {
    // Scan button
    const scanBtn = document.getElementById('btn-scan');
    const fileInput = document.getElementById('file-input');
    scanBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this._handleImage(file);
    });

    // Paste support
    document.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) this._handleImage(file);
          break;
        }
      }
    });

    // Buttons
    document.getElementById('btn-next-step').addEventListener('click', () => this._nextStep());
    document.getElementById('btn-solve-all').addEventListener('click', () => this._solveAll());
    document.getElementById('btn-clear').addEventListener('click', () => this._clearSolved());
    document.getElementById('btn-new').addEventListener('click', () => this._newPuzzle());
    document.getElementById('btn-back').addEventListener('click', () => this._newPuzzle());
    document.getElementById('btn-edit-toggle').addEventListener('click', () => this._toggleEdit());
    document.getElementById('btn-manual-entry').addEventListener('click', () => this._manualEntry());
    document.getElementById('btn-candidates').addEventListener('click', () => this._toggleCandidates());
    document.getElementById('btn-undo').addEventListener('click', () => this._undo());
    document.getElementById('btn-check').addEventListener('click', () => this._checkErrors());

    // Difficulty buttons
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => this._startGame(btn.dataset.difficulty));
    });

    // Hint navigation
    document.getElementById('btn-hint-prev').addEventListener('click', () => this._navHint(-1));
    document.getElementById('btn-hint-next').addEventListener('click', () => this._navHint(1));

    // Confirm modal
    document.getElementById('modal-confirm').addEventListener('click', () => this._confirmSolve());
    document.getElementById('modal-cancel').addEventListener('click', () => this._hideModal());

    // Toast close
    document.getElementById('toast-close').addEventListener('click', () => this._hideToast());
  }

  /* ── Image Handling ─────────────────────────── */
  async _handleImage(file) {
    if (!file.type.startsWith('image/')) {
      this._showToast('Please upload an image file.', 'error');
      return;
    }

    this._showLoading('Loading image...');

    const img = new Image();
    img.onload = async () => {
      // Draw to canvas for OpenCV
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Show preview
      document.getElementById('preview-img').src = img.src;
      document.getElementById('preview-area').classList.remove('hidden');

      // Wait for OpenCV
      if (typeof cv === 'undefined') {
        this._showLoading('Waiting for OpenCV.js to load...');
        await this._waitForOpenCV();
      }

      this._showLoading('Detecting Sudoku grid...');
      const result = await this.imageProcessor.process(canvas);

      if (!result.success) {
        this._hideLoading();
        this._showToast('Could not detect grid: ' + result.error, 'error');
        return;
      }

      this._showLoading('Recognizing digits...');
      const { grid, confidences } = await this.ocrEngine.recognizeGrid(result.cells, (msg) => {
        this._showLoading(msg);
      });

      this._loadPuzzle(grid);
      this._hideLoading();

      // Count detected digits and uncertain ones
      let totalDigits = 0;
      let uncertainCount = 0;
      const uncertainHighlights = [];

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] !== 0) {
            totalDigits++;
            if (confidences[r][c] < 70) {
              uncertainCount++;
              uncertainHighlights.push({ row: r, col: c, color: 'warning' });
            }
          }
        }
      }

      // Enable editing for review
      this._toggleEdit();

      if (uncertainCount > 0) {
        // Highlight uncertain cells
        this.gridUI.highlightCells(uncertainHighlights);
        this._showToast(
          `Found ${totalDigits} digits (${uncertainCount} uncertain — highlighted in orange). Please review and correct before solving.`,
          'info'
        );
      } else {
        this._showToast(`Found ${totalDigits} digits. Review and click Edit again when done.`, 'success');
      }
    };

    img.onerror = () => {
      this._hideLoading();
      this._showToast('Failed to load image.', 'error');
    };

    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.readAsDataURL(file);
  }

  _waitForOpenCV() {
    return new Promise((resolve) => {
      if (typeof cv !== 'undefined' && cv.Mat) { resolve(); return; }
      const check = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.Mat) {
          clearInterval(check);
          resolve();
        }
      }, 200);
      // Timeout after 30s
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });
  }

  /* ── Puzzle Loading ─────────────────────────── */
  _loadPuzzle(grid) {
    this.gridUI.loadPuzzle(grid);
    this.puzzleLoaded = true;
    this.hintHistory = [];
    this.hintIndex = -1;
    this.solver.resetEliminations();
    this._updateUI();
    this._showScreen('game');
  }

  _manualEntry() {
    const empty = Array.from({ length: 9 }, () => Array(9).fill(0));
    this._loadPuzzle(empty);
    this._toggleEdit();
    this._showToast('Enter the puzzle numbers by clicking on cells.', 'info');
  }

  /* ── Solving ────────────────────────────────── */
  _nextStep() {
    if (!this.puzzleLoaded) return;
    this.gridUI.disableEditing();
    document.getElementById('btn-edit-toggle').textContent = '✏️ Edit';
    document.getElementById('btn-edit-toggle').classList.remove('active');

    const grid = this.gridUI.getGrid();

    if (this.solver.isComplete(grid)) {
      this._showToast('🎉 Puzzle is already complete!', 'success');
      return;
    }

    const step = this.solver.getNextStep(grid);

    if (!step) {
      this._showToast('No valid next step found.', 'error');
      return;
    }

    if (step.type === 'error') {
      this._showToast(step.explanation, 'error');
      return;
    }

    // Break into sub-steps (sudoku.com style)
    this.currentSubSteps = this._breakIntoSubSteps(step);
    this.currentSubStepIndex = 0;
    this.pendingStep = step;
    this._valuePlaced = false;

    document.getElementById('hint-panel').classList.remove('hidden');
    this._renderSubStep();
    this._updateUI();
  }

  _breakIntoSubSteps(step) {
    const { type, cell, value, highlights } = step;

    if (type === 'naked_single' && cell) {
      const cellHL = [{ row: cell.row, col: cell.col, color: 'info' }];
      const peerHL = highlights ? highlights.filter(h => h.color !== 'success') : [];
      return [
        { text: `Look at <strong>R${cell.row+1}C${cell.col+1}</strong>. What number can go here?`, highlights: cellHL },
        { text: `All other numbers are already in its row, column, or box — only <strong>${value}</strong> is left.`, highlights: [...cellHL, ...peerHL] },
        { text: `Place <strong>${value}</strong> at R${cell.row+1}C${cell.col+1}! ✓`, highlights: [{ row: cell.row, col: cell.col, color: 'success' }], placeValue: true },
      ];
    }

    if (type === 'hidden_single' && cell) {
      const unitMatch = step.explanation.match(/in (Row \d+|Column \d+|Box \d+)/i);
      const unitName = unitMatch ? unitMatch[1] : 'this unit';
      const blockHL = highlights ? highlights.filter(h => h.color === 'info' || h.color === 'warning') : [];
      return [
        { text: `Look at <strong>${unitName}</strong>. Where can <strong>${value}</strong> go?`, highlights: [...blockHL, { row: cell.row, col: cell.col, color: 'info' }] },
        { text: `Other cells are blocked by existing <strong>${value}</strong>s nearby.`, highlights: highlights || [] },
        { text: `Only place for <strong>${value}</strong> is <strong>R${cell.row+1}C${cell.col+1}</strong>! ✓`, highlights: [{ row: cell.row, col: cell.col, color: 'success' }], placeValue: true },
      ];
    }

    if ((type === 'pointing_pair' || type === 'box_line_reduction') && highlights) {
      const label = type === 'pointing_pair' ? 'Pointing Pair' : 'Box/Line Reduction';
      const primaryHL = highlights.filter(h => h.color === 'primary');
      return [
        { text: `<strong>${label}</strong> found! Look at the highlighted cells.`, highlights: primaryHL },
        { text: step.explanation, highlights, applyElimination: true },
      ];
    }

    if (type === 'backtrack' && cell) {
      return [
        { text: `This requires advanced logic. Look at <strong>R${cell.row+1}C${cell.col+1}</strong>.`, highlights: [{ row: cell.row, col: cell.col, color: 'info' }] },
        { text: `The answer is <strong>${value}</strong>! ✓`, highlights: [{ row: cell.row, col: cell.col, color: 'success' }], placeValue: true },
      ];
    }

    return [{ text: step.explanation, highlights: highlights || [], placeValue: !!(cell && value) }];
  }

  _renderSubStep() {
    const sub = this.currentSubSteps[this.currentSubStepIndex];
    const total = this.currentSubSteps.length;
    const idx = this.currentSubStepIndex;

    document.getElementById('hint-content').innerHTML = sub.text;

    // Dots
    const dots = document.getElementById('hint-dots');
    dots.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const d = document.createElement('span');
      d.className = 'hint-dot' + (i < idx ? ' done' : '') + (i === idx ? ' active' : '');
      dots.appendChild(d);
    }

    // Arrows
    document.getElementById('btn-hint-prev').disabled = idx === 0;
    document.getElementById('btn-hint-next').disabled = idx === total - 1;

    // Highlights
    this.gridUI.clearHighlights();
    if (sub.highlights) this.gridUI.highlightCells(sub.highlights);

    // Place value on final step
    if (sub.placeValue && !this._valuePlaced && this.pendingStep?.cell) {
      this._valuePlaced = true;
      const { row, col } = this.pendingStep.cell;
      this.gridUI.setValue(row, col, this.pendingStep.value);
      this._showCandidatesWithEliminations();
      this.hintHistory.push(this.pendingStep);
      this.hintIndex = this.hintHistory.length - 1;
      const g = this.gridUI.getGrid();
      if (this.solver.isComplete(g)) {
        setTimeout(() => { this._showToast('🎉 Puzzle solved!', 'success'); document.getElementById('hint-panel').classList.add('hidden'); }, 500);
      }
    }
    if (sub.applyElimination && !this._valuePlaced) {
      this._valuePlaced = true;
      this._showCandidatesWithEliminations();
      this.hintHistory.push(this.pendingStep);
      this.hintIndex = this.hintHistory.length - 1;
    }
  }

  _solveAll() {
    if (!this.puzzleLoaded) return;
    this._showModal();
  }

  _confirmSolve() {
    this._hideModal();
    this.gridUI.disableEditing();

    const grid = this.gridUI.getGrid();
    const solved = this.solver.solveComplete(grid);

    if (!solved) {
      this._showToast('Could not solve the puzzle. It may be invalid.', 'error');
      return;
    }

    // Animate solution
    let delay = 0;
    const originals = this.gridUI.getOriginals();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!originals.has(`${r},${c}`) && grid[r][c] === 0) {
          delay += 35;
          setTimeout(() => {
            this.gridUI.setValue(r, c, solved[r][c], true);
          }, delay);
        }
      }
    }

    setTimeout(() => {
      this._showToast('🎉 Puzzle completely solved!', 'success');
      this._renderHint({
        type: 'complete',
        explanation: '<strong>Puzzle Solved!</strong> All cells have been filled using a combination of logical techniques and backtracking.',
      });
    }, delay + 200);
  }

  /* ── UI Controls ────────────────────────────── */
  _clearSolved() {
    if (!this.puzzleLoaded) return;
    const originals = this.gridUI.getOriginals();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!originals.has(`${r},${c}`)) {
          this.gridUI.setValue(r, c, 0, false);
        }
      }
    }
    this.gridUI.clearHighlights();
    this.hintHistory = [];
    this.hintIndex = -1;
    this.solver.resetEliminations();
    this._renderHint(null);
    this._showToast('Cleared all solved cells.', 'info');
  }

  _newPuzzle() {
    this.puzzleLoaded = false;
    this.hintHistory = [];
    this.hintIndex = -1;
    this.solver.resetEliminations();
    this.gridUI.clearHighlights();
    this._renderHint(null);
    this._updateUI();
    this._showScreen('home');
    document.getElementById('preview-area').classList.add('hidden');
    document.getElementById('file-input').value = '';
    document.getElementById('hint-panel').classList.add('hidden');
    // Reset game state
    this._stopTimer();
    this.gameMode = false;
    this.solution = null;
    this.undoStack = [];
    this.errorCount = 0;
  }

  /* ── Game Mode ─────────────────────────────── */
  async _startGame(difficulty) {
    this._showLoading('Loading puzzle...');

    let puzzle, solution;

    try {
      // Try API first for fresh puzzles
      const apiDiff = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Hard' }[difficulty] || 'Medium';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`https://sudoku-api.vercel.app/api/dosuku?query={newboard(limit:1,type:${apiDiff}){grids{value,solution,difficulty}}}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      const data = await res.json();
      const grid = data.newboard.grids[0];
      puzzle = grid.value;
      solution = grid.solution;
      console.log('Puzzle loaded from API ✓');
    } catch (err) {
      // Fallback to local library
      console.log('API failed, using local library:', err.message);
      const local = PuzzleLibrary.getRandom(difficulty);
      puzzle = local.puzzle;
      solution = local.solution;
    }

    this._hideLoading();
    this.solution = solution;
    this.gameMode = true;
    this.undoStack = [];
    this.errorCount = 0;
    this.notesMode = false;
    this.userNotes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));

    this._loadPuzzle(puzzle);
    this.gridUI.enableEditing();

    // Show game info
    const labels = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
    document.getElementById('game-difficulty').textContent = labels[difficulty] || difficulty;

    this._startTimer();
    this._updateGameBar();
    this._showToast('Game started!', 'success');
  }

  _onPlayerMove(r, c, val) {
    if (this.notesMode && this.gameMode && val >= 1 && val <= 9) {
      // Notes mode: toggle pencil mark, don't place value
      // Revert the setValue that grid.js already did
      this.gridUI.setValue(r, c, 0, false);

      const notes = this.userNotes[r][c];
      if (notes.has(val)) {
        notes.delete(val);
      } else {
        notes.add(val);
      }
      // Update notes display
      this.gridUI.showCandidates(this.userNotes);
      // Save to undo
      this.undoStack.push({ row: r, col: c, type: 'note', val, prevVal: 0, newVal: 0 });
      document.getElementById('btn-undo').disabled = false;
      return;
    }

    // Normal mode: place value
    this.undoStack.push({ row: r, col: c, prevVal: this.gridUI.grid[r]?.[c] === val ? 0 : this.gridUI.grid[r]?.[c], newVal: val });
    document.getElementById('btn-undo').disabled = false;

    // Clear user notes for this cell when value is placed
    if (val !== 0 && this.userNotes[r]) {
      this.userNotes[r][c] = new Set();
      // Also remove this value from notes in same row, col, box
      for (let i = 0; i < 9; i++) {
        this.userNotes[r][i].delete(val);
        this.userNotes[i][c].delete(val);
      }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let i = br; i < br + 3; i++)
        for (let j = bc; j < bc + 3; j++)
          this.userNotes[i][j].delete(val);
    }

    // Update game bar
    if (this.gameMode) {
      this._updateGameBar();

      // Check if puzzle complete
      const grid = this.gridUI.getGrid();
      if (this.solver.isComplete(grid)) {
        if (this.solution && this._isCorrect(grid)) {
          this._stopTimer();
          const mins = Math.floor(this.timerSeconds / 60);
          const secs = this.timerSeconds % 60;
          this._showToast(`🎉 Congratulations! Solved in ${mins}:${secs.toString().padStart(2, '0')} with ${this.errorCount} errors!`, 'success');
        }
      }
    }
  }

  _undo() {
    if (this.undoStack.length === 0) return;
    const { row, col, prevVal } = this.undoStack.pop();
    this.gridUI.setValue(row, col, prevVal, false);
    this.gridUI.clearHighlights();

    if (this.undoStack.length === 0) {
      document.getElementById('btn-undo').disabled = true;
    }
    if (this.gameMode) this._updateGameBar();
  }

  _checkErrors() {
    if (!this.puzzleLoaded) return;

    const grid = this.gridUI.getGrid();
    const originals = this.gridUI.getOriginals();
    let errorFound = false;
    const highlights = [];

    if (this.solution) {
      // Game mode — check against solution
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (originals.has(`${r},${c}`)) continue;
          if (grid[r][c] !== 0 && grid[r][c] !== this.solution[r][c]) {
            highlights.push({ row: r, col: c, color: 'warning' });
            errorFound = true;
          }
        }
      }
    } else {
      // Solver mode — check for conflicts
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0) continue;
          const v = grid[r][c];
          // Check row
          for (let i = 0; i < 9; i++) {
            if (i !== c && grid[r][i] === v) {
              highlights.push({ row: r, col: c, color: 'warning' });
              errorFound = true;
              break;
            }
          }
        }
      }
    }

    if (errorFound) {
      this.gridUI.highlightCells(highlights);
      this.errorCount += highlights.length;
      this._showToast(`Found ${highlights.length} error(s)!`, 'error');
    } else {
      this._showToast('✅ No errors found!', 'success');
    }
    if (this.gameMode) this._updateGameBar();
  }

  _isCorrect(grid) {
    if (!this.solution) return true;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (grid[r][c] !== this.solution[r][c]) return false;
    return true;
  }

  /* ── Timer ─────────────────────────────────── */
  _startTimer() {
    this._stopTimer();
    this.timerSeconds = 0;
    this._updateTimerDisplay();
    this.timerInterval = setInterval(() => {
      this.timerSeconds++;
      this._updateTimerDisplay();
    }, 1000);
  }

  _stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  _updateTimerDisplay() {
    const mins = Math.floor(this.timerSeconds / 60);
    const secs = this.timerSeconds % 60;
    document.getElementById('game-timer').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  _updateGameBar() {
    const grid = this.gridUI.getGrid();
    let filled = 0;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (grid[r][c] !== 0) filled++;
    document.getElementById('game-errors').textContent = `${this.errorCount} ❌`;
  }

  _toggleEdit() {
    const btn = document.getElementById('btn-edit-toggle');
    if (this.gridUI.editing) {
      this.gridUI.disableEditing();
      this.gridUI.lockAsOriginals(); // Mark current values as puzzle givens
      btn.textContent = '✏️ Edit';
      btn.classList.remove('active');
    } else {
      this.gridUI.enableEditing();
      btn.textContent = '✏️ Editing...';
      btn.classList.add('active');
    }
  }

  _toggleCandidates() {
    const btn = document.getElementById('btn-candidates');
    if (this.gameMode) {
      this.notesMode = !this.notesMode;
      btn.classList.toggle('active', this.notesMode);
      if (this.notesMode) {
        this._showToast('Notes mode ON', 'info');
      }
      this.gridUI.showCandidates(this.userNotes);
    } else {
      if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        this.gridUI._render();
      } else {
        btn.classList.add('active');
        this._showCandidatesWithEliminations();
      }
    }
  }

  /**
   * Calculate and display candidates with solver's tracked eliminations applied
   */
  _showCandidatesWithEliminations() {
    const grid = this.gridUI.getGrid();
    const cands = this.candidateManager.calculate(grid);
    // Apply solver's tracked eliminations (from pointing pairs etc.)
    this.solver._applyEliminations(cands, grid);
    this.gridUI.showCandidates(cands);
    // Activate the candidates button to show it's on
    document.getElementById('btn-candidates').classList.add('active');
  }

  /* ── Hint Display ───────────────────────────── */
  _renderHint(step) { /* handled by _renderSubStep */ }

  _navHint(dir) {
    if (!this.currentSubSteps) return;
    const newIdx = this.currentSubStepIndex + dir;
    if (newIdx < 0 || newIdx >= this.currentSubSteps.length) return;
    this.currentSubStepIndex = newIdx;
    this._renderSubStep();
  }

  /* ── Screens ───────────────────────────────── */
  _showScreen(name) {
    document.getElementById('home-screen').classList.toggle('hidden', name !== 'home');
    document.getElementById('game-screen').classList.toggle('hidden', name !== 'game');
  }

  _updateUI() {
    const btns = ['btn-next-step', 'btn-solve-all', 'btn-clear', 'btn-edit-toggle', 'btn-candidates', 'btn-check', 'btn-erase'];
    btns.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !this.puzzleLoaded;
    });
    document.getElementById('btn-undo').disabled = this.undoStack.length === 0;
  }

  /* ── Loading Overlay ────────────────────────── */
  _showLoading(msg) {
    const overlay = document.getElementById('loading-overlay');
    document.getElementById('loading-text').textContent = msg;
    overlay.classList.remove('hidden');
  }
  _hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
  }

  /* ── Modal ──────────────────────────────────── */
  _showModal() {
    document.getElementById('confirm-modal').classList.remove('hidden');
  }
  _hideModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
  }

  /* ── Toast ──────────────────────────────────── */
  _showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    const text = document.getElementById('toast-text');
    toast.className = 'toast';
    text.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 5000);
  }
  _hideToast() {
    document.getElementById('toast').classList.add('hidden');
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
