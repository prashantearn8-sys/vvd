/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure TypeScript 9-step handwritten signature extraction pipeline.
 * Zero per-pixel object allocations; operates strictly on flat TypedArrays
 * (Float32Array, Uint8ClampedArray, Uint8Array, Int32Array) and separable running-sum filters.
 */

import {
  DEFAULT_PROCESSING_PARAMS,
  ProcessingParams,
} from "./types";

export interface RawProcessedSignature {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  empty: boolean;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

/**
 * Parses a CSS hex color ('#RRGGBB' or '#RGB') into [R, G, B] integers (0-255).
 */
export function parseHexColor(hex: string): [number, number, number] {
  const clean = (hex || "#000000").replace(/^#/, "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  const num = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(num)) return [0, 0, 0];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Step 1: Grayscale conversion using standard Rec. 601 luminance:
 * L = 0.299 * R + 0.587 * G + 0.114 * B
 * Pre-multiplies transparent pixels onto white paper (255) so existing transparent inputs work seamlessly.
 */
export function computeGrayscaleLuminance(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Float32Array {
  const total = width * height;
  const gray = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const idx4 = i << 2;
    const a = rgba[idx4 + 3];
    if (a === 255) {
      gray[i] =
        0.299 * rgba[idx4] +
        0.587 * rgba[idx4 + 1] +
        0.114 * rgba[idx4 + 2];
    } else if (a === 0) {
      gray[i] = 255;
    } else {
      const af = a / 255;
      const invA = 255 * (1 - af);
      const r = rgba[idx4] * af + invA;
      const g = rgba[idx4 + 1] * af + invA;
      const b = rgba[idx4 + 2] * af + invA;
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  return gray;
}

/**
 * Separable O(1)-per-pixel running-sum 2D box blur on Float32Array.
 * Used for both Step 2 (background illumination estimation) and Step 4 (adaptive local mean).
 */
export function separableBoxBlurFloat32(
  src: Float32Array,
  width: number,
  height: number,
  radius: number
): Float32Array {
  const total = width * height;
  if (radius <= 0 || width <= 1 || height <= 1) {
    return new Float32Array(src);
  }
  const r = Math.min(radius, Math.max(1, Math.min(width - 1, height - 1)));
  const horiz = new Float32Array(total);
  const dst = new Float32Array(total);

  // Pass 1: Horizontal running sum per row with clamped edge replication
  const windowSize = 2 * r + 1;
  const invWindow = 1 / windowSize;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = src[rowOffset] * (r + 1);
    for (let x = 1; x <= r; x++) {
      sum += src[rowOffset + Math.min(width - 1, x)];
    }
    for (let x = 0; x < width; x++) {
      horiz[rowOffset + x] = sum * invWindow;
      const addIdx = Math.min(width - 1, x + r + 1);
      const subIdx = Math.max(0, x - r);
      sum += src[rowOffset + addIdx] - src[rowOffset + subIdx];
    }
  }

  // Pass 2: Vertical running sum per column with clamped edge replication
  for (let x = 0; x < width; x++) {
    let sum = horiz[x] * (r + 1);
    for (let y = 1; y <= r; y++) {
      sum += horiz[Math.min(height - 1, y) * width + x];
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum * invWindow;
      const addY = Math.min(height - 1, y + r + 1);
      const subY = Math.max(0, y - r);
      sum += horiz[addY * width + x] - horiz[subY * width + x];
    }
  }

  return dst;
}

/**
 * Step 2: Shadow & illumination normalization.
 * Estimates uneven paper lighting via a large separable box blur (radius ~6.5% of image width),
 * then divides: normalized = (gray / background) * 255.
 */
export function normalizeIllumination(
  gray: Float32Array,
  width: number,
  height: number
): Float32Array {
  const radius = Math.max(6, Math.round(Math.max(width, height) * 0.065));
  const bg = separableBoxBlurFloat32(gray, width, height, radius);
  const total = width * height;
  const normalized = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const denom = bg[i] < 1 ? 1 : bg[i];
    const val = (gray[i] / denom) * 255;
    normalized[i] = val > 255 ? 255 : val < 0 ? 0 : val;
  }
  return normalized;
}

/**
 * Step 3: Auto-levels.
 * Builds a 256-bin histogram, clips 1% at both ends, and stretches linearly to 0-255.
 */
export function autoLevelsStretch(
  normalized: Float32Array,
  width: number,
  height: number
): Uint8ClampedArray {
  const total = width * height;
  const hist = new Int32Array(256);

  for (let i = 0; i < total; i++) {
    const bin = Math.max(0, Math.min(255, Math.round(normalized[i])));
    hist[bin]++;
  }

  const clipCount = Math.floor(total * 0.01);
  let low = 0;
  let accumLow = 0;
  while (low < 254 && accumLow + hist[low] <= clipCount) {
    accumLow += hist[low];
    low++;
  }

  let high = 255;
  let accumHigh = 0;
  while (high > low + 1 && accumHigh + hist[high] <= clipCount) {
    accumHigh += hist[high];
    high--;
  }

  // Ensure a healthy dynamic range even on very clean synthetic paper
  if (high - low < 20) {
    low = Math.max(0, Math.min(low, 200));
    high = Math.max(low + 20, 255);
  }

  const out = new Uint8ClampedArray(total);
  const range = high - low;
  const scale = 255 / range;

  for (let i = 0; i < total; i++) {
    const v = (normalized[i] - low) * scale;
    out[i] = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
  }

  return out;
}

/**
 * Computes Otsu's global threshold on a 0-255 grayscale buffer.
 */
export function computeOtsuThreshold(leveled: Uint8ClampedArray): number {
  const total = leveled.length;
  if (total === 0) return 180;

  const hist = new Int32Array(256);
  for (let i = 0; i < total; i++) {
    hist[leveled[i]]++;
  }

  let sumAll = 0;
  for (let t = 0; t < 256; t++) {
    sumAll += t * hist[t];
  }

  let sumB = 0;
  let wB = 0;
  let maxVariance = -1;
  let bestThreshold = 185;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const diff = mB - mF;
    const variance = wB * wF * diff * diff;
    if (variance > maxVariance) {
      maxVariance = variance;
      bestThreshold = t;
    }
  }

  // Clamp Otsu threshold so uniform backgrounds don't produce extreme thresholds
  return Math.max(115, Math.min(238, bestThreshold));
}

/**
 * Steps 4 & 5: Thresholding (Otsu or Adaptive Local-Mean) + Soft anti-aliased alpha channel:
 * alpha = clamp((tHigh - gray) / (tHigh - tLow)) * 255
 */
export function computeSoftAlphaMask(
  leveled: Uint8ClampedArray,
  width: number,
  height: number,
  params: Pick<ProcessingParams, "sensitivity" | "thresholdMethod">
): Uint8ClampedArray {
  const total = width * height;
  const alpha = new Uint8ClampedArray(total);
  const sensShift = (params.sensitivity - 50) * 1.15;

  if (params.thresholdMethod === "adaptive") {
    const floatIn = new Float32Array(total);
    for (let i = 0; i < total; i++) floatIn[i] = leveled[i];
    const localRadius = Math.max(8, Math.round(Math.min(width, height) * 0.035));
    const localMean = separableBoxBlurFloat32(floatIn, width, height, localRadius);

    // Offset required below local mean to qualify as ink
    const baseDelta = Math.max(6, 26 - sensShift * 0.45);
    const softBand = 24;

    for (let i = 0; i < total; i++) {
      const tHigh = Math.max(25, Math.min(250, localMean[i] - baseDelta));
      const tLow = Math.max(0, tHigh - softBand);
      const g = leveled[i];
      if (g >= tHigh) {
        alpha[i] = 0;
      } else if (g <= tLow) {
        alpha[i] = 255;
      } else {
        alpha[i] = Math.round(((tHigh - g) / (tHigh - tLow)) * 255);
      }
    }
  } else {
    const otsu = computeOtsuThreshold(leveled);
    const shifted = Math.max(40, Math.min(248, otsu + sensShift));
    const tHigh = Math.min(252, shifted + 10);
    const tLow = Math.max(0, Math.min(tHigh - 8, shifted - 28));
    const invSpan = 1 / Math.max(1, tHigh - tLow);

    for (let i = 0; i < total; i++) {
      const g = leveled[i];
      if (g >= tHigh) {
        alpha[i] = 0;
      } else if (g <= tLow) {
        alpha[i] = 255;
      } else {
        alpha[i] = Math.round((tHigh - g) * invSpan * 255);
      }
    }
  }

  return alpha;
}

/**
 * Separable 3x3 morphological dilation (maximum filter) on an alpha buffer.
 */
export function dilateAlpha3x3(
  alpha: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const total = width * height;
  const horiz = new Uint8ClampedArray(total);
  const dst = new Uint8ClampedArray(total);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let maxV = alpha[row + x];
      if (x > 0 && alpha[row + x - 1] > maxV) maxV = alpha[row + x - 1];
      if (x < width - 1 && alpha[row + x + 1] > maxV) maxV = alpha[row + x + 1];
      horiz[row + x] = maxV;
    }
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let maxV = horiz[row + x];
      if (y > 0 && horiz[row - width + x] > maxV) maxV = horiz[row - width + x];
      if (y < height - 1 && horiz[row + width + x] > maxV) maxV = horiz[row + width + x];
      dst[row + x] = maxV;
    }
  }

  return dst;
}

/**
 * Separable 3x3 morphological erosion (minimum filter) on an alpha buffer.
 */
export function erodeAlpha3x3(
  alpha: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const total = width * height;
  const horiz = new Uint8ClampedArray(total);
  const dst = new Uint8ClampedArray(total);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let minV = alpha[row + x];
      if (x > 0 && alpha[row + x - 1] < minV) minV = alpha[row + x - 1];
      if (x < width - 1 && alpha[row + x + 1] < minV) minV = alpha[row + x + 1];
      horiz[row + x] = minV;
    }
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let minV = horiz[row + x];
      if (y > 0 && horiz[row - width + x] < minV) minV = horiz[row - width + x];
      if (y < height - 1 && horiz[row + width + x] < minV) minV = horiz[row + width + x];
      dst[row + x] = minV;
    }
  }

  return dst;
}

/**
 * Step 6: Noise cleanup via two-pass 8-connected component labeling with flat Union-Find.
 * Removes connected components smaller than minArea (default 0.01% of total pixels).
 * Optionally applies a morphological close first to rejoin broken thin pen strokes.
 */
export function cleanNoiseConnectedComponents(
  alphaIn: Uint8ClampedArray,
  width: number,
  height: number,
  minComponentAreaRatio: number,
  morphClose: boolean
): Uint8ClampedArray {
  let alpha = alphaIn;
  if (morphClose) {
    alpha = erodeAlpha3x3(dilateAlpha3x3(alpha, width, height), width, height);
  }

  const total = width * height;
  const minArea = Math.max(2, Math.round(total * Math.max(0, minComponentAreaRatio)));
  if (minArea <= 1) {
    return new Uint8ClampedArray(alpha);
  }

  const labels = new Int32Array(total);
  // Maximum possible labels is total / 2 + 2
  const maxLabels = Math.ceil(total / 2) + 4;
  const parent = new Int32Array(maxLabels);
  let nextLabel = 1;

  const findRoot = (x: number): number => {
    let root = x;
    while (parent[root] !== root) {
      root = parent[root];
    }
    let curr = x;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  };

  const unionLabels = (a: number, b: number) => {
    const rootA = findRoot(a);
    const rootB = findRoot(b);
    if (rootA !== rootB) {
      if (rootA < rootB) parent[rootB] = rootA;
      else parent[rootA] = rootB;
    }
  };

  const FG_THRESHOLD = 18;

  // Pass 1: Assign provisional labels and record equivalences (8-connectivity)
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const prevRow = (y - 1) * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (alpha[idx] < FG_THRESHOLD) continue;

      let n1 = 0;
      let n2 = 0;
      let n3 = 0;
      let n4 = 0;

      if (x > 0) n1 = labels[idx - 1];
      if (y > 0) {
        if (x > 0) n2 = labels[prevRow + x - 1];
        n3 = labels[prevRow + x];
        if (x < width - 1) n4 = labels[prevRow + x + 1];
      }

      let minLbl = 0;
      if (n1 > 0) minLbl = n1;
      if (n2 > 0 && (minLbl === 0 || n2 < minLbl)) minLbl = n2;
      if (n3 > 0 && (minLbl === 0 || n3 < minLbl)) minLbl = n3;
      if (n4 > 0 && (minLbl === 0 || n4 < minLbl)) minLbl = n4;

      if (minLbl === 0) {
        const lbl = nextLabel < maxLabels ? nextLabel++ : maxLabels - 1;
        parent[lbl] = lbl;
        labels[idx] = lbl;
      } else {
        labels[idx] = minLbl;
        if (n1 > 0 && n1 !== minLbl) unionLabels(minLbl, n1);
        if (n2 > 0 && n2 !== minLbl) unionLabels(minLbl, n2);
        if (n3 > 0 && n3 !== minLbl) unionLabels(minLbl, n3);
        if (n4 > 0 && n4 !== minLbl) unionLabels(minLbl, n4);
      }
    }
  }

  // Flatten union-find trees and accumulate component pixel counts
  const compArea = new Int32Array(nextLabel);
  for (let i = 1; i < nextLabel; i++) {
    parent[i] = findRoot(i);
  }
  for (let idx = 0; idx < total; idx++) {
    const lbl = labels[idx];
    if (lbl > 0) {
      const root = parent[lbl];
      labels[idx] = root;
      compArea[root]++;
    }
  }

  // Pass 2: Zero out components below minArea
  const cleaned = new Uint8ClampedArray(alpha);
  for (let idx = 0; idx < total; idx++) {
    const lbl = labels[idx];
    if (lbl === 0 || compArea[lbl] < minArea) {
      cleaned[idx] = 0;
    }
  }

  return cleaned;
}

/**
 * Step 8: Adjust stroke thickness (-2 to +2 px) via dilation or erosion on the alpha channel.
 */
export function adjustStrokeThickness(
  alphaIn: Uint8ClampedArray,
  width: number,
  height: number,
  thickness: number
): Uint8ClampedArray {
  const steps = Math.max(-2, Math.min(2, Math.round(thickness)));
  if (steps === 0) return alphaIn;

  let curr = alphaIn;
  if (steps > 0) {
    for (let s = 0; s < steps; s++) {
      curr = dilateAlpha3x3(curr, width, height);
    }
  } else {
    const count = -steps;
    for (let s = 0; s < count; s++) {
      curr = erodeAlpha3x3(curr, width, height);
    }
  }
  return curr;
}

/**
 * Complete 9-step pure TypeScript buffer pipeline.
 * Operates on a flat RGBA Uint8ClampedArray so it can run inside a Web Worker or on the main thread.
 */
export function processSignatureBuffer(
  rgbaBuffer: Uint8ClampedArray,
  width: number,
  height: number,
  partialParams?: Partial<ProcessingParams>
): RawProcessedSignature {
  const params: ProcessingParams = {
    ...DEFAULT_PROCESSING_PARAMS,
    ...partialParams,
  };

  if (width <= 0 || height <= 0 || rgbaBuffer.length < width * height * 4) {
    return {
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
      empty: true,
      boundingBox: null,
    };
  }

  // Step 1: Grayscale luminance
  const gray = computeGrayscaleLuminance(rgbaBuffer, width, height);

  // Step 2: Shadow / local illumination normalization
  const normalized = normalizeIllumination(gray, width, height);

  // Step 3: Auto-levels (clip 1% at both ends, stretch to 0-255)
  const leveled = autoLevelsStretch(normalized, width, height);

  // Steps 4 & 5: Thresholding (Otsu or Adaptive) + Soft anti-aliased alpha channel
  const softAlpha = computeSoftAlphaMask(leveled, width, height, params);

  // Step 6: Connected-component noise cleanup (+ optional morphological close)
  const denoisedAlpha = cleanNoiseConnectedComponents(
    softAlpha,
    width,
    height,
    params.minComponentAreaRatio,
    params.morphClose
  );

  // Step 8: Stroke thickness (-2 to +2 px) via dilation or erosion on the alpha channel
  const finalAlpha = adjustStrokeThickness(
    denoisedAlpha,
    width,
    height,
    params.thickness
  );

  // Step 9: Find tight bounding box of alpha > 10
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (finalAlpha[row + x] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
      empty: true,
      boundingBox: null,
    };
  }

  // Step 7: Ink color applied to all output pixels while keeping computed alpha
  const [inkR, inkG, inkB] = parseHexColor(params.inkColor);

  if (!params.autoCrop) {
    const fullOut = new Uint8ClampedArray(width * height * 4);
    const total = width * height;
    for (let i = 0; i < total; i++) {
      const a = finalAlpha[i];
      if (a > 0) {
        const idx4 = i << 2;
        fullOut[idx4] = inkR;
        fullOut[idx4 + 1] = inkG;
        fullOut[idx4 + 2] = inkB;
        fullOut[idx4 + 3] = a;
      }
    }
    return {
      data: fullOut,
      width,
      height,
      empty: false,
      boundingBox: { minX, minY, maxX, maxY },
    };
  }

  const pad = Math.max(0, Math.round(params.padding));
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const outW = cropW + pad * 2;
  const outH = cropH + pad * 2;
  const outData = new Uint8ClampedArray(outW * outH * 4);

  for (let y = 0; y < cropH; y++) {
    const srcRow = (minY + y) * width + minX;
    const dstRow = (y + pad) * outW + pad;
    for (let x = 0; x < cropW; x++) {
      const a = finalAlpha[srcRow + x];
      if (a > 0) {
        const dstIdx4 = (dstRow + x) << 2;
        outData[dstIdx4] = inkR;
        outData[dstIdx4 + 1] = inkG;
        outData[dstIdx4 + 2] = inkB;
        outData[dstIdx4 + 3] = a;
      }
    }
  }

  return {
    data: outData,
    width: outW,
    height: outH,
    empty: false,
    boundingBox: { minX, minY, maxX, maxY },
  };
}

/**
 * Helper to construct a standard ImageData instance in both browser and jsdom/node test environments.
 */
export function createImageDataSafe(
  data: Uint8ClampedArray,
  width: number,
  height: number
): ImageData {
  if (typeof ImageData !== "undefined") {
    return new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height);
  }
  return {
    data,
    width,
    height,
    colorSpace: "srgb",
  } as ImageData;
}

/**
 * Extracts raw RGBA ImageData from an ImageBitmap or ImageData instance.
 */
function extractImageData(source: ImageBitmap | ImageData): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  if ("data" in source && source.data instanceof Uint8ClampedArray) {
    return {
      data: source.data,
      width: source.width,
      height: source.height,
    };
  }

  const bmp = source as ImageBitmap;
  const w = bmp.width;
  const h = bmp.height;

  if (typeof OffscreenCanvas !== "undefined") {
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext("2d");
    if (!ctx) throw new Error("Failed to acquire OffscreenCanvas 2D context");
    ctx.drawImage(bmp, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    return { data: imgData.data, width: w, height: h };
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire HTMLCanvasElement 2D context");
  ctx.drawImage(bmp, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  return { data: imgData.data, width: w, height: h };
}

/**
 * PUBLIC HEADLESS API:
 * processSignature(imageBitmap, params): Promise<ImageData>
 * Reusable across the application without mounting the SignatureExtractor UI.
 */
export async function processSignature(
  imageBitmap: ImageBitmap | ImageData,
  params?: Partial<ProcessingParams>
): Promise<ImageData> {
  const { data, width, height } = extractImageData(imageBitmap);
  const result = processSignatureBuffer(data, width, height, params);
  if (result.empty) {
    throw new Error(
      "NO_SIGNATURE_DETECTED: No dark signature strokes were detected. Try increasing sensitivity, using better lighting, or signing with a darker pen."
    );
  }
  return createImageDataSafe(result.data, result.width, result.height);
}
