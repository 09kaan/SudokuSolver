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
        if (cells[r][c].isEmpty) continue;

        if (onProgress) {
          onProgress(`Recognizing digit ${processed}/${total}...`);
        }

        try {
          const { digit, confidence } = await this._recognizeDigit(cells[r][c].canvas);
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

  async _recognizeDigit(canvas) {
    const { data } = await this.worker.recognize(canvas);
    const text = data.text.trim();
    const num = parseInt(text, 10);
    if (num >= 1 && num <= 9 && data.confidence > 20) {
      return { digit: num, confidence: data.confidence };
    }
    return { digit: 0, confidence: 0 };
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.ready = false;
    }
  }
}
