/**
 * Image Processor — OpenCV.js grid detection and cell extraction
 * Robust: tries multiple strategies for different image types
 */
export class ImageProcessor {
  constructor() {
    this.debugCanvas = null;
  }

  /**
   * Process an image and extract 81 cell canvases
   * @param {HTMLImageElement|HTMLCanvasElement} source
   * @returns {{ cells: HTMLCanvasElement[][], success: boolean, error?: string }}
   */
  async process(source) {
    if (typeof cv === 'undefined') {
      return { cells: null, success: false, error: 'OpenCV.js is not loaded yet.' };
    }

    try {
      const src = cv.imread(source);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Try multiple strategies to find the grid
      let gridMat = null;

      // Strategy 1: Contour-based (works for clean, well-defined grids)
      gridMat = this._tryContourDetection(gray, src);

      // Strategy 2: Hough lines (works for photos with perspective)
      if (!gridMat) {
        console.log('Contour detection failed, trying Hough lines...');
        gridMat = this._tryHoughLines(gray);
      }

      // Strategy 3: Assume the largest centered square area is the grid
      if (!gridMat) {
        console.log('Hough lines failed, trying center crop...');
        gridMat = this._tryCenterCrop(gray);
      }

      // Fallback: use entire image
      if (!gridMat) {
        console.log('All detection methods failed, using entire image');
        gridMat = gray.clone();
      }

      // Enhance contrast
      const enhanced = new cv.Mat();
      cv.equalizeHist(gridMat, enhanced);

      // Threshold the grid for clean cell extraction
      const gridThresh = new cv.Mat();
      cv.adaptiveThreshold(enhanced, gridThresh, 255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

      // Clean up noise with morphological operations
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
      const cleaned = new cv.Mat();
      cv.morphologyEx(gridThresh, cleaned, cv.MORPH_OPEN, kernel);

      // Extract 81 cells
      const cells = this._extractCells(enhanced, cleaned);

      // Cleanup
      src.delete(); gray.delete(); gridMat.delete();
      enhanced.delete(); gridThresh.delete(); kernel.delete(); cleaned.delete();

      return { cells, success: true };
    } catch (err) {
      console.error('Image processing error:', err);
      return { cells: null, success: false, error: err.message };
    }
  }

  /* ── Strategy 1: Contour Detection ──────────── */
  _tryContourDetection(gray, src) {
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Try multiple threshold methods
    const methods = [
      () => {
        const t = new cv.Mat();
        cv.adaptiveThreshold(blurred, t, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
        return t;
      },
      () => {
        const t = new cv.Mat();
        cv.adaptiveThreshold(blurred, t, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 15, 3);
        return t;
      },
      () => {
        const t = new cv.Mat();
        cv.threshold(blurred, t, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
        return t;
      },
    ];

    for (const makeThresh of methods) {
      const thresh = makeThresh();
      const result = this._findLargestQuad(thresh, gray, src);
      thresh.delete();
      if (result) {
        blurred.delete();
        return result;
      }
    }

    blurred.delete();
    return null;
  }

  _findLargestQuad(thresh, gray, src) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let bestContour = null;
    const imgArea = src.rows * src.cols;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // Must be at least 5% of image and roughly square-ish
      if (area < imgArea * 0.05) continue;

      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      // Try different epsilon values for approximation
      for (const eps of [0.02, 0.03, 0.05]) {
        cv.approxPolyDP(contour, approx, eps * peri, true);
        if (approx.rows === 4 && area > maxArea) {
          // Check if roughly square (aspect ratio between 0.5 and 2.0)
          const br = cv.boundingRect(approx);
          const aspect = br.width / br.height;
          if (aspect > 0.5 && aspect < 2.0) {
            maxArea = area;
            if (bestContour) bestContour.delete();
            bestContour = approx.clone();
          }
        }
      }
      approx.delete();
    }

    let result = null;
    if (bestContour && maxArea > imgArea * 0.05) {
      result = this._perspectiveTransform(gray, bestContour);
      bestContour.delete();
    }

    contours.delete();
    hierarchy.delete();
    return result;
  }

  /* ── Strategy 2: Hough Line Detection ──────── */
  _tryHoughLines(gray) {
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    const edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);

    // Dilate edges to connect broken lines
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    const dilated = new cv.Mat();
    cv.dilate(edges, dilated, kernel);

    // Find contours on the edge map
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let bestRect = null;
    const imgArea = gray.rows * gray.cols;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > maxArea && area > imgArea * 0.1) {
        maxArea = area;
        bestRect = cv.boundingRect(contour);
      }
    }

    let result = null;
    if (bestRect) {
      // Check aspect ratio
      const aspect = bestRect.width / bestRect.height;
      if (aspect > 0.6 && aspect < 1.7) {
        // Use the bounding rect as the grid area
        const roi = gray.roi(bestRect);
        const size = 900;
        result = new cv.Mat();
        cv.resize(roi, result, new cv.Size(size, size));
        roi.delete();
      }
    }

    blurred.delete(); edges.delete(); kernel.delete();
    dilated.delete(); contours.delete(); hierarchy.delete();
    return result;
  }

  /* ── Strategy 3: Center Crop ───────────────── */
  _tryCenterCrop(gray) {
    const h = gray.rows;
    const w = gray.cols;

    // Find the largest square centered in the image
    const minDim = Math.min(h, w);
    const gridSize = Math.floor(minDim * 0.85); // Assume grid is ~85% of min dimension
    const cx = Math.floor((w - gridSize) / 2);
    const cy = Math.floor((h - gridSize) / 2);

    if (gridSize < 100) return null;

    const roi = gray.roi(new cv.Rect(cx, cy, gridSize, gridSize));
    const result = new cv.Mat();
    cv.resize(roi, result, new cv.Size(900, 900));
    roi.delete();
    return result;
  }

  /* ── Perspective Transform ─────────────────── */
  _perspectiveTransform(gray, corners) {
    const pts = [];
    for (let i = 0; i < 4; i++) {
      pts.push({ x: corners.data32S[i * 2], y: corners.data32S[i * 2 + 1] });
    }
    const ordered = this._orderPoints(pts);

    const size = 900;
    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2,
      [ordered[0].x, ordered[0].y, ordered[1].x, ordered[1].y,
       ordered[2].x, ordered[2].y, ordered[3].x, ordered[3].y]);
    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2,
      [0, 0, size, 0, size, size, 0, size]);

    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    const warped = new cv.Mat();
    cv.warpPerspective(gray, warped, M, new cv.Size(size, size));

    srcPts.delete(); dstPts.delete(); M.delete();
    return warped;
  }

  _orderPoints(pts) {
    const sorted = [...pts];
    sorted.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const tl = sorted[0];
    const br = sorted[3];
    sorted.sort((a, b) => (a.y - a.x) - (b.y - b.x));
    const tr = sorted[0];
    const bl = sorted[3];
    return [tl, tr, br, bl];
  }

  /* ── Cell Extraction ───────────────────────── */
  _extractCells(gridGray, gridThresh) {
    const h = gridGray.rows;
    const w = gridGray.cols;
    const cellH = Math.floor(h / 9);
    const cellW = Math.floor(w / 9);
    const cells = [];

    for (let r = 0; r < 9; r++) {
      cells[r] = [];
      for (let c = 0; c < 9; c++) {
        const x = c * cellW;
        const y = r * cellH;
        // 15% margin to avoid grid lines
        const margin = Math.floor(Math.min(cellW, cellH) * 0.15);
        const rect = new cv.Rect(
          x + margin, y + margin,
          cellW - 2 * margin, cellH - 2 * margin
        );

        const cellMat = gridGray.roi(rect);

        // Enhance contrast per cell
        const enhanced = new cv.Mat();
        cv.equalizeHist(cellMat, enhanced);

        // Center-crop: middle 60% to avoid edge noise
        const cropX = Math.floor(enhanced.cols * 0.15);
        const cropY = Math.floor(enhanced.rows * 0.15);
        const cropW = enhanced.cols - 2 * cropX;
        const cropH = enhanced.rows - 2 * cropY;
        const centerCrop = enhanced.roi(new cv.Rect(cropX, cropY, cropW, cropH));

        // Resize to consistent size
        const resized = new cv.Mat();
        cv.resize(centerCrop, resized, new cv.Size(56, 56), 0, 0, cv.INTER_AREA);

        const canvas = document.createElement('canvas');
        cv.imshow(canvas, resized);
        cells[r][c] = {
          canvas,
          isEmpty: this._isCellEmpty(gridThresh, rect),
        };
        cellMat.delete(); enhanced.delete();
        centerCrop.delete(); resized.delete();
      }
    }
    return cells;
  }

  _isCellEmpty(threshMat, rect) {
    const cellMat = threshMat.roi(rect);
    const h = cellMat.rows;
    const w = cellMat.cols;
    // Check center 50% region
    const cx = Math.floor(w * 0.25);
    const cy = Math.floor(h * 0.25);
    const cw = Math.floor(w * 0.5);
    const ch = Math.floor(h * 0.5);
    const center = cellMat.roi(new cv.Rect(cx, cy, cw, ch));
    const nonZero = cv.countNonZero(center);
    const total = cw * ch;
    center.delete();
    cellMat.delete();
    return (nonZero / total) < 0.05; // Less than 5% filled = empty
  }
}
