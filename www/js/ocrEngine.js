/**
 * OCR Engine — Tesseract.js digit recognition
 */
export class OCREngine {
  constructor() {
    this.worker = null;
    this.ready = false;
  }

  async initialize(onProgress) {
    if (this.ready) return;

    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract.js is not loaded.');
    }

    if (onProgress) onProgress('Initializing OCR engine...');

    const tesseractBase = new URL('vendor/tesseract/', document.baseURI).href;
    this.worker = await Tesseract.createWorker('eng', 1, {
      workerPath: new URL('worker.min.js', tesseractBase).href,
      corePath: new URL('core/', tesseractBase).href,
      langPath: new URL('lang/', tesseractBase).href,
      logger: (m) => {
        if (m.status && onProgress) onProgress(m.status);
      },
    });

    await this.worker.setParameters({
      tessedit_char_whitelist: '123456789',
      tessedit_pageseg_mode: '10', // Single character
    });

    this.ready = true;
    if (onProgress) onProgress('OCR engine ready.');
  }

  /**
   * Recognize digits from cell data
   * @param {Array} cells - 9x9 array of { canvas, isEmpty }
   * @param {Function} onProgress - Progress callback
   * @returns {{ grid: number[][], confidences: number[][] }}
   */
  async recognizeGrid(cells, onProgress) {
    if (!this.ready) await this.initialize(onProgress);

    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    const confidences = Array.from({ length: 9 }, () => Array(9).fill(100));
    let processed = 0;
    const total = 81;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        processed++;

        if (onProgress) {
          onProgress(`Recognizing digit ${processed}/${total}...`);
        }

        try {
          // Crop center 60% to remove grid lines, then add padding
          const cropped = this._centerCrop(cells[r][c].canvas, 0.20);
          // Check if cell is truly empty (very few dark pixels)
          if (this._isCellEmpty(cropped)) {
            grid[r][c] = 0;
            confidences[r][c] = 100;
          } else {
            const padded = this._addPadding(cropped, 12);
            const { digit, confidence } = await this._recognizeDigit(padded);
            if (digit >= 1 && digit <= 9) {
              grid[r][c] = digit;
              confidences[r][c] = confidence;
            }
          }
        } catch (e) {
          console.warn(`OCR failed for cell [${r}][${c}]:`, e);
          confidences[r][c] = 0;
        }
      }
    }

    // Post-scan validation: remove duplicate digits that break Sudoku rules
    this._validateAndFixGrid(grid, confidences);

    return { grid, confidences };
  }

  _addPadding(canvas, pad) {
    const c = document.createElement('canvas');
    c.width = canvas.width + pad * 2;
    c.height = canvas.height + pad * 2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, pad, pad);
    return c;
  }

  async _recognizeDigit(canvas) {
    // Try multiple preprocessing approaches, pick best result
    const attempts = this._preprocessCell(canvas);
    let bestDigit = 0;
    let bestConf = 0;

    for (const attemptCanvas of attempts) {
      try {
        const { data } = await this.worker.recognize(attemptCanvas);
        const text = data.text.trim();
        const num = parseInt(text, 10);
        if (num >= 1 && num <= 9 && data.confidence > bestConf) {
          bestDigit = num;
          bestConf = data.confidence;
        }
      } catch (e) { /* skip */ }
    }

    if (bestDigit >= 1 && bestConf > 40) {
      return { digit: bestDigit, confidence: bestConf };
    }
    return { digit: 0, confidence: 0 };
  }

  /**
   * Create multiple preprocessed versions of a cell for better OCR
   */
  _preprocessCell(srcCanvas) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const results = [];

    // Attempt 1: Original grayscale (as-is)
    results.push(srcCanvas);

    // Attempt 2: High contrast binary (OTSU-like threshold)
    const ctx2 = this._createCanvas(w, h);
    const imgData = srcCanvas.getContext('2d').getImageData(0, 0, w, h);
    const pixels = imgData.data;

    // Calculate mean brightness
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      sum += pixels[i]; // grayscale, R=G=B
    }
    const mean = sum / (pixels.length / 4);

    // Binary: black text on white background
    const binaryData = ctx2.createImageData(w, h);
    const invData = this._createCanvas(w, h).createImageData(w, h);
    for (let i = 0; i < pixels.length; i += 4) {
      const val = pixels[i];
      // If pixel is darker than mean → it's text → make it black
      const isForeground = val < mean * 0.85;
      binaryData.data[i] = isForeground ? 0 : 255;
      binaryData.data[i + 1] = isForeground ? 0 : 255;
      binaryData.data[i + 2] = isForeground ? 0 : 255;
      binaryData.data[i + 3] = 255;

      // Inverted version
      const isInvFg = val > mean * 1.15;
      invData.data[i] = isInvFg ? 0 : 255;
      invData.data[i + 1] = isInvFg ? 0 : 255;
      invData.data[i + 2] = isInvFg ? 0 : 255;
      invData.data[i + 3] = 255;
    }

    // Attempt 2: Black text on white
    const c2 = document.createElement('canvas');
    c2.width = w; c2.height = h;
    c2.getContext('2d').putImageData(binaryData, 0, 0);
    results.push(c2);

    // Attempt 3: Inverted (for light text on dark background)
    const c3 = document.createElement('canvas');
    c3.width = w; c3.height = h;
    c3.getContext('2d').putImageData(invData, 0, 0);
    results.push(c3);

    return results;
  }

  /**
   * Crop center portion of cell to remove grid lines
   * @param {HTMLCanvasElement} canvas
   * @param {number} margin - fraction to remove from each edge (0.20 = 20%)
   */
  _centerCrop(canvas, margin) {
    const w = canvas.width, h = canvas.height;
    const mx = Math.floor(w * margin), my = Math.floor(h * margin);
    const cw = w - mx * 2, ch = h - my * 2;
    if (cw < 5 || ch < 5) return canvas;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    c.getContext('2d').drawImage(canvas, mx, my, cw, ch, 0, 0, cw, ch);
    return c;
  }

  /**
   * Check if a cell is empty by counting dark pixels
   */
  _isCellEmpty(canvas) {
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0, total = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (brightness < 128) dark++;
    }
    // If less than 5% of pixels are dark, cell is empty
    return (dark / total) < 0.05;
  }

  /**
   * Validate scanned grid and remove low-confidence duplicates
   */
  _validateAndFixGrid(grid, confidences) {
    // Check rows, cols, boxes for duplicate digits — remove the lower confidence one
    for (let i = 0; i < 9; i++) {
      // Check row
      this._removeDuplicates(grid, confidences,
        Array.from({ length: 9 }, (_, c) => [i, c]));
      // Check col
      this._removeDuplicates(grid, confidences,
        Array.from({ length: 9 }, (_, r) => [r, i]));
    }
    // Check boxes
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const cells = [];
        for (let r = br * 3; r < br * 3 + 3; r++)
          for (let c = bc * 3; c < bc * 3 + 3; c++)
            cells.push([r, c]);
        this._removeDuplicates(grid, confidences, cells);
      }
    }
  }

  _removeDuplicates(grid, confidences, cells) {
    const seen = new Map(); // digit -> [r, c, confidence]
    for (const [r, c] of cells) {
      const v = grid[r][c];
      if (v === 0) continue;
      if (seen.has(v)) {
        // Duplicate! Remove the one with lower confidence
        const [pr, pc, pconf] = seen.get(v);
        if (confidences[r][c] < pconf) {
          grid[r][c] = 0; // remove current (lower confidence)
        } else {
          grid[pr][pc] = 0; // remove previous (lower confidence)
          seen.set(v, [r, c, confidences[r][c]]);
        }
      } else {
        seen.set(v, [r, c, confidences[r][c]]);
      }
    }
  }

  _createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c.getContext('2d');
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.ready = false;
    }
  }
}
