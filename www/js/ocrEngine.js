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

    this.worker = await Tesseract.createWorker('eng', 1, {
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
          // Add white padding around cell for better OCR
          const padded = this._addPadding(cells[r][c].canvas, 10);
          const { digit, confidence } = await this._recognizeDigit(padded);
          if (digit >= 1 && digit <= 9) {
            grid[r][c] = digit;
            confidences[r][c] = confidence;
          }
        } catch (e) {
          console.warn(`OCR failed for cell [${r}][${c}]:`, e);
          confidences[r][c] = 0;
        }
      }
    }

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

    if (bestDigit >= 1 && bestConf > 10) {
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
      binaryData.data[i+1] = isForeground ? 0 : 255;
      binaryData.data[i+2] = isForeground ? 0 : 255;
      binaryData.data[i+3] = 255;

      // Inverted version
      const isInvFg = val > mean * 1.15;
      invData.data[i] = isInvFg ? 0 : 255;
      invData.data[i+1] = isInvFg ? 0 : 255;
      invData.data[i+2] = isInvFg ? 0 : 255;
      invData.data[i+3] = 255;
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
