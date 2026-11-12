/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Square,
  Undo2,
  Trash2,
  Eye,
  Plus,
  FolderOpen,
  Zap,
  Layers,
} from "lucide-react";
import { PDFDocument, PDFName } from "pdf-lib";
import JSZip from "jszip";
import { saveFile } from "../utils/db";
import { loadPdfJsLibrary } from "../utils/pdfProcessor";
import { useFileDrop } from "../context/FileDropContext";
import { useToast } from "../context/ToastContext";
import ModuleIconBadge from "./ModuleIconBadge";

interface WatermarkRemoverViewProps {
  mode?: "pdf" | "image";
  toolKey?: string;
  onSuccess: () => void;
  askPassword?: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
  initialFiles?: File[] | null;
}

interface MaskBox {
  id: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  w: number; // normalized 0..1
  h: number; // normalized 0..1
  pageIndex: number | "all";
}

interface BrushStroke {
  id: string;
  points: { x: number; y: number }[]; // normalized 0..1
  size: number; // normalized brush width relative to image width
  pageIndex: number | "all";
}

type RemovalMode = "document_clean" | "inpaint_patch" | "hybrid";
type DrawTool = "box" | "brush";

/**
 * Strip watermark annotations, stamp annotations, and PieceInfo/Watermark XObjects
 * from a PDF using pdf-lib before rasterization.
 */
async function stripPdfAnnotationWatermarks(arrayBuffer: ArrayBuffer): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const annotsRef = page.node.get(PDFName.of("Annots"));
      if (annotsRef) {
        const annots = pdfDoc.context.lookup(annotsRef);
        if (annots && "asArray" in annots && typeof annots.asArray === "function") {
          const arr = annots.asArray();
          const kept: any[] = [];
          for (const ref of arr) {
            const annot = pdfDoc.context.lookup(ref);
            if (annot && "get" in annot && typeof annot.get === "function") {
              const subtype = annot.get(PDFName.of("Subtype"))?.toString();
              if (
                subtype === "/Watermark" ||
                subtype === "/Stamp" ||
                subtype === "/FreeText"
              ) {
                continue;
              }
            }
            kept.push(ref);
          }
          if (kept.length !== arr.length) {
            page.node.set(PDFName.of("Annots"), pdfDoc.context.obj(kept));
          }
        }
      }
      page.node.delete(PDFName.of("PieceInfo"));
    }
    return await pdfDoc.save();
  } catch {
    return new Uint8Array(arrayBuffer);
  }
}

/**
 * High-precision local paper background estimator (32x32 grid of 85th-percentile brightest local pixels).
 * Captures subtle lighting gradients, scan shadows, or cream paper tones so cleaned regions blend seamlessly.
 */
function buildLocalBackgroundGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  gridSize: number = 32
) {
  const cols = Math.max(1, Math.ceil(width / gridSize));
  const rows = Math.max(1, Math.ceil(height / gridSize));
  const bgR = new Float32Array(cols * rows);
  const bgG = new Float32Array(cols * rows);
  const bgB = new Float32Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    const y0 = r * gridSize;
    const y1 = Math.min(height, y0 + gridSize);
    for (let c = 0; c < cols; c++) {
      const x0 = c * gridSize;
      const x1 = Math.min(width, x0 + gridSize);
      const samples: { lum: number; r: number; g: number; b: number }[] = [];
      const step = Math.max(1, Math.floor((x1 - x0) / 8));
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) {
          const idx = (y * width + x) * 4;
          const pr = data[idx];
          const pg = data[idx + 1];
          const pb = data[idx + 2];
          const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
          samples.push({ lum, r: pr, g: pg, b: pb });
        }
      }
      samples.sort((a, b) => a.lum - b.lum);
      const pickIdx = Math.min(samples.length - 1, Math.floor(samples.length * 0.85));
      const picked = samples[pickIdx] || { r: 255, g: 255, b: 255 };
      const cellIdx = r * cols + c;
      bgR[cellIdx] = picked.r;
      bgG[cellIdx] = picked.g;
      bgB[cellIdx] = picked.b;
    }
  }

  return {
    sample(x: number, y: number): [number, number, number] {
      const gx = Math.min(cols - 1, Math.max(0, (x + 0.5) / gridSize - 0.5));
      const gy = Math.min(rows - 1, Math.max(0, (y + 0.5) / gridSize - 0.5));
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const x1 = Math.min(cols - 1, x0 + 1);
      const y1 = Math.min(rows - 1, y0 + 1);
      const fx = gx - x0;
      const fy = gy - y0;

      const i00 = y0 * cols + x0;
      const i10 = y0 * cols + x1;
      const i01 = y1 * cols + x0;
      const i11 = y1 * cols + x1;

      const r =
        bgR[i00] * (1 - fx) * (1 - fy) +
        bgR[i10] * fx * (1 - fy) +
        bgR[i01] * (1 - fx) * fy +
        bgR[i11] * fx * fy;
      const g =
        bgG[i00] * (1 - fx) * (1 - fy) +
        bgG[i10] * fx * (1 - fy) +
        bgG[i01] * (1 - fx) * fy +
        bgG[i11] * fx * fy;
      const b =
        bgB[i00] * (1 - fx) * (1 - fy) +
        bgB[i10] * fx * (1 - fy) +
        bgB[i01] * (1 - fx) * fy +
        bgB[i11] * fx * fy;
      return [r, g, b];
    },
  };
}

/**
 * Dilate binary mask by `radius` pixels to automatically catch anti-aliased fringes and JPEG compression halos
 * around watermark edges, and compute a smooth feather weight (0..1) near the outer boundary.
 */
function dilateAndFeatherMask(
  rawMask: Uint8Array,
  width: number,
  height: number,
  dilateRadius: number = 4
): { mask: Uint8Array; distToEdge: Float32Array } {
  const dilated = new Uint8Array(width * height);
  const distToOutside = new Float32Array(width * height);
  const INF = 1e6;

  const distToMask = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    distToMask[i] = rawMask[i] === 1 ? 0 : INF;
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      let d = distToMask[idx];
      if (x > 0) d = Math.min(d, distToMask[idx - 1] + 1);
      if (y > 0) d = Math.min(d, distToMask[idx - width] + 1);
      if (x > 0 && y > 0) d = Math.min(d, distToMask[idx - width - 1] + 1.414);
      if (x < width - 1 && y > 0) d = Math.min(d, distToMask[idx - width + 1] + 1.414);
      distToMask[idx] = d;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    const row = y * width;
    for (let x = width - 1; x >= 0; x--) {
      const idx = row + x;
      let d = distToMask[idx];
      if (x < width - 1) d = Math.min(d, distToMask[idx + 1] + 1);
      if (y < height - 1) d = Math.min(d, distToMask[idx + width] + 1);
      if (x < width - 1 && y < height - 1) d = Math.min(d, distToMask[idx + width + 1] + 1.414);
      if (x > 0 && y < height - 1) d = Math.min(d, distToMask[idx + width - 1] + 1.414);
      distToMask[idx] = d;
      if (d <= dilateRadius) {
        dilated[idx] = 1;
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    distToOutside[i] = dilated[i] === 1 ? INF : 0;
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      let d = distToOutside[idx];
      if (x > 0) d = Math.min(d, distToOutside[idx - 1] + 1);
      if (y > 0) d = Math.min(d, distToOutside[idx - width] + 1);
      distToOutside[idx] = d;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    const row = y * width;
    for (let x = width - 1; x >= 0; x--) {
      const idx = row + x;
      let d = distToOutside[idx];
      if (x < width - 1) d = Math.min(d, distToOutside[idx + 1] + 1);
      if (y < height - 1) d = Math.min(d, distToOutside[idx + width] + 1);
      distToOutside[idx] = d;
    }
  }

  return { mask: dilated, distToEdge: distToOutside };
}

/**
 * Multi-Scale Patch & Gradient-Guided Seamless Inpainting + Micro-Texture Synthesis.
 */
function inpaintMaskedRegions(
  imageData: ImageData,
  rawMask: Uint8Array,
  preserveDarkText: boolean,
  darkTextCutoff: number
) {
  const { width, height, data } = imageData;
  const originalCopy = new Uint8ClampedArray(data);

  const { mask, distToEdge } = dilateAndFeatherMask(rawMask, width, height, 4);

  if (preserveDarkText) {
    for (let i = 0; i < width * height; i++) {
      if (mask[i] === 1) {
        const idx = i * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC - minC;
        if (lum < darkTextCutoff && sat < 42) {
          mask[i] = 0;
        }
      }
    }
  }

  const state = new Uint8Array(width * height);
  const boundaryQueue: number[] = [];

  for (let i = 0; i < width * height; i++) {
    state[i] = mask[i] === 1 ? 1 : 0;
  }

  const dirs8 = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];

  const sampleRing: [number, number, number][] = [];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx === 0 && dy === 0) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 3.2) {
        sampleRing.push([dx, dy, dist]);
      }
    }
  }

  const cleanExemplars: number[] = [];

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (state[idx] === 1) {
        let touchesKnown = false;
        for (let d = 0; d < 8; d++) {
          const nx = x + dirs8[d][0];
          const ny = y + dirs8[d][1];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (state[nIdx] === 0) {
              touchesKnown = true;
              break;
            }
          }
        }
        if (touchesKnown) {
          state[idx] = 2;
          boundaryQueue.push(idx);
        }
      } else if (distToEdge[idx] === 0) {
        for (let d = 0; d < 4; d++) {
          const nx = x + dirs8[d][0] * 4;
          const ny = y + dirs8[d][1] * 4;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (mask[ny * width + nx] === 1) {
              cleanExemplars.push(idx);
              break;
            }
          }
        }
      }
    }
  }

  const filledPixels: number[] = [];
  let head = 0;

  while (head < boundaryQueue.length) {
    const idx = boundaryQueue[head++];
    const x = idx % width;
    const y = (idx - x) / width;

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let totalWeight = 0;

    for (let s = 0; s < sampleRing.length; s++) {
      const dx = sampleRing[s][0];
      const dy = sampleRing[s][1];
      const dist = sampleRing[s][2];
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (state[nIdx] === 0) {
          const pIdx = nIdx * 4;
          let r = data[pIdx];
          let g = data[pIdx + 1];
          let b = data[pIdx + 2];

          const bx = nx + Math.sign(dx);
          const by = ny + Math.sign(dy);
          if (bx >= 0 && bx < width && by >= 0 && by < height) {
            const bIdx = by * width + bx;
            if (state[bIdx] === 0) {
              const bpIdx = bIdx * 4;
              r = Math.min(255, Math.max(0, r + (r - data[bpIdx]) * 0.35));
              g = Math.min(255, Math.max(0, g + (g - data[bpIdx + 1]) * 0.35));
              b = Math.min(255, Math.max(0, b + (b - data[bpIdx + 2]) * 0.35));
            }
          }

          const originBoost = mask[nIdx] === 0 ? 1.8 : 1.0;
          const weight = originBoost / (dist * dist * dist);
          sumR += r * weight;
          sumG += g * weight;
          sumB += b * weight;
          totalWeight += weight;
        }
      }
    }

    if (totalWeight > 0) {
      const pIdx = idx * 4;
      data[pIdx] = Math.round(sumR / totalWeight);
      data[pIdx + 1] = Math.round(sumG / totalWeight);
      data[pIdx + 2] = Math.round(sumB / totalWeight);
    }

    state[idx] = 0;
    filledPixels.push(idx);

    for (let d = 0; d < 8; d++) {
      const nx = x + dirs8[d][0];
      const ny = y + dirs8[d][1];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (state[nIdx] === 1) {
          state[nIdx] = 2;
          boundaryQueue.push(nIdx);
        }
      }
    }
  }

  const scratch = new Uint8ClampedArray(filledPixels.length * 3);
  const smoothingPasses = 6;
  for (let pass = 0; pass < smoothingPasses; pass++) {
    for (let i = 0; i < filledPixels.length; i++) {
      const idx = filledPixels[i];
      const x = idx % width;
      const y = (idx - x) / width;
      const pIdx = idx * 4;

      let rSum = data[pIdx] * 2;
      let gSum = data[pIdx + 1] * 2;
      let bSum = data[pIdx + 2] * 2;
      let wSum = 2;

      for (let d = 0; d < 8; d++) {
        const nx = x + dirs8[d][0];
        const ny = y + dirs8[d][1];
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = (ny * width + nx) * 4;
          const w = d < 4 ? 1.0 : 0.7;
          rSum += data[nIdx] * w;
          gSum += data[nIdx + 1] * w;
          bSum += data[nIdx + 2] * w;
          wSum += w;
        }
      }
      scratch[i * 3] = Math.round(rSum / wSum);
      scratch[i * 3 + 1] = Math.round(gSum / wSum);
      scratch[i * 3 + 2] = Math.round(bSum / wSum);
    }

    for (let i = 0; i < filledPixels.length; i++) {
      const pIdx = filledPixels[i] * 4;
      data[pIdx] = scratch[i * 3];
      data[pIdx + 1] = scratch[i * 3 + 1];
      data[pIdx + 2] = scratch[i * 3 + 2];
    }
  }

  if (cleanExemplars.length > 0) {
    for (let i = 0; i < filledPixels.length; i++) {
      const idx = filledPixels[i];
      const x = idx % width;
      const y = (idx - x) / width;
      const pIdx = idx * 4;

      const donorIdx =
        cleanExemplars[(((x * 73856093) ^ (y * 19349663)) >>> 0) % cleanExemplars.length];
      const dx = donorIdx % width;
      const dy = (donorIdx - dx) / width;

      let mR = 0,
        mG = 0,
        mB = 0,
        cnt = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const sx = dx + ox;
          const sy = dy + oy;
          if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
            const sIdx = (sy * width + sx) * 4;
            mR += originalCopy[sIdx];
            mG += originalCopy[sIdx + 1];
            mB += originalCopy[sIdx + 2];
            cnt++;
          }
        }
      }
      const dPIdx = donorIdx * 4;
      const detailR = (originalCopy[dPIdx] - mR / cnt) * 0.65;
      const detailG = (originalCopy[dPIdx + 1] - mG / cnt) * 0.65;
      const detailB = (originalCopy[dPIdx + 2] - mB / cnt) * 0.65;

      let outR = Math.min(255, Math.max(0, Math.round(data[pIdx] + detailR)));
      let outG = Math.min(255, Math.max(0, Math.round(data[pIdx + 1] + detailG)));
      let outB = Math.min(255, Math.max(0, Math.round(data[pIdx + 2] + detailB)));

      const dEdge = distToEdge[idx];
      if (dEdge < 3.0 && rawMask[idx] === 0) {
        const alpha = 0.5 - 0.5 * Math.cos((Math.PI * dEdge) / 3.0);
        outR = Math.round(originalCopy[pIdx] * (1 - alpha) + outR * alpha);
        outG = Math.round(originalCopy[pIdx + 1] * (1 - alpha) + outG * alpha);
        outB = Math.round(originalCopy[pIdx + 2] * (1 - alpha) + outB * alpha);
      }

      data[pIdx] = outR;
      data[pIdx + 1] = outG;
      data[pIdx + 2] = outB;
    }
  }
}

/**
 * Core zero-trace watermark removal engine for a single canvas.
 */
function applyWatermarkRemovalToCanvas(
  sourceCanvas: HTMLCanvasElement,
  pageIdx: number,
  removalMode: RemovalMode,
  lightnessCutoff: number,
  darkTextCutoff: number,
  tintTolerance: number,
  preserveDarkText: boolean,
  maskBoxes: MaskBox[],
  brushStrokes: BrushStroke[]
): HTMLCanvasElement {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext("2d")!;
  ctx.drawImage(sourceCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const { data } = imgData;

  const activeBoxes = maskBoxes.filter(
    (b) => b.pageIndex === "all" || b.pageIndex === pageIdx
  );
  const activeStrokes = brushStrokes.filter(
    (s) => s.pageIndex === "all" || s.pageIndex === pageIdx
  );
  const hasUserMasks = activeBoxes.length > 0 || activeStrokes.length > 0;

  const userMask = new Uint8Array(width * height);
  if (hasUserMasks) {
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const mCtx = maskCanvas.getContext("2d")!;
    mCtx.fillStyle = "#000000";
    mCtx.fillRect(0, 0, width, height);
    mCtx.fillStyle = "#ffffff";
    mCtx.strokeStyle = "#ffffff";
    mCtx.lineCap = "round";
    mCtx.lineJoin = "round";

    for (const box of activeBoxes) {
      const rx = Math.round(box.x * width);
      const ry = Math.round(box.y * height);
      const rw = Math.round(box.w * width);
      const rh = Math.round(box.h * height);
      mCtx.fillRect(rx, ry, rw, rh);
    }

    for (const stroke of activeStrokes) {
      if (stroke.points.length === 0) continue;
      mCtx.lineWidth = Math.max(4, stroke.size * width);
      mCtx.beginPath();
      mCtx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
      for (let i = 1; i < stroke.points.length; i++) {
        mCtx.lineTo(stroke.points[i].x * width, stroke.points[i].y * height);
      }
      if (stroke.points.length === 1) {
        mCtx.arc(
          stroke.points[0].x * width,
          stroke.points[0].y * height,
          (stroke.size * width) / 2,
          0,
          Math.PI * 2
        );
        mCtx.fill();
      } else {
        mCtx.stroke();
      }
    }

    const mData = mCtx.getImageData(0, 0, width, height).data;
    for (let i = 0; i < width * height; i++) {
      if (mData[i * 4] > 128) {
        userMask[i] = 1;
      }
    }
  }

  // Step 1: Adaptive Document Descreening + Reverse Alpha Unblending
  if (removalMode === "document_clean" || removalMode === "hybrid") {
    const bgGrid = buildLocalBackgroundGrid(data, width, height, 32);
    const { mask: dilatedUserMask } = hasUserMasks
      ? dilateAndFeatherMask(userMask, width, height, 4)
      : { mask: userMask };

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const i = row + x;
        if (
          hasUserMasks &&
          removalMode === "document_clean" &&
          dilatedUserMask[i] === 0
        ) {
          continue;
        }

        const idx = i * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC - minC;

        const [bgR, bgG, bgB] = bgGrid.sample(x, y);
        const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

        const insideBox = hasUserMasks && dilatedUserMask[i] === 1;
        const effectiveLightCutoff = insideBox
          ? Math.max(115, lightnessCutoff - 30)
          : lightnessCutoff;

        if (preserveDarkText && lum < darkTextCutoff && sat < 45) {
          const normInk = Math.max(0, (lum - 18) / Math.max(1, darkTextCutoff - 18));
          const contrastCurve = Math.pow(normInk, 1.35);
          data[idx] = Math.round(bgR * contrastCurve);
          data[idx + 1] = Math.round(bgG * contrastCurve);
          data[idx + 2] = Math.round(bgB * contrastCurve);
          continue;
        }

        const isLightGrayWatermark =
          lum >= effectiveLightCutoff && sat <= 42;
        const isColoredStampWatermark =
          lum >= Math.max(95, effectiveLightCutoff - 55) &&
          sat > 14 &&
          sat <= tintTolerance + (insideBox ? 45 : 0);

        if (isLightGrayWatermark || isColoredStampWatermark) {
          data[idx] = Math.round(bgR);
          data[idx + 1] = Math.round(bgG);
          data[idx + 2] = Math.round(bgB);
        } else if (lum > darkTextCutoff && lum < effectiveLightCutoff) {
          const t = (lum - darkTextCutoff) / Math.max(1, effectiveLightCutoff - darkTextCutoff);
          const smoothT = t * t * (3 - 2 * t);
          const targetLum = lum * (1 - smoothT) + bgLum * smoothT;
          const scale = targetLum / Math.max(1, bgLum);
          data[idx] = Math.min(255, Math.round(bgR * scale));
          data[idx + 1] = Math.min(255, Math.round(bgG * scale));
          data[idx + 2] = Math.min(255, Math.round(bgB * scale));
        }
      }
    }
  }

  // Step 2: Multi-Scale Seamless Patch & Texture Inpainting for Photo/Logo Watermarks
  if ((removalMode === "inpaint_patch" || removalMode === "hybrid") && hasUserMasks) {
    inpaintMaskedRegions(imgData, userMask, preserveDarkText, darkTextCutoff);
  }

  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

export default function WatermarkRemoverView({
  mode = "pdf",
  toolKey = "pdf_watermark_remover",
  onSuccess,
  askPassword,
  initialFile,
  initialFiles,
}: WatermarkRemoverViewProps) {
  const isImageMode = mode === "image";
  const { registerDropHandler } = useFileDrop();
  const { showToast } = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [fileType, setFileType] = useState<"pdf" | "image" | null>(null);

  const [pageCanvases, setPageCanvases] = useState<HTMLCanvasElement[]>([]);
  const [pageNames, setPageNames] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(0);

  // Removal settings
  const [removalMode, setRemovalMode] = useState<RemovalMode>(
    isImageMode ? "inpaint_patch" : "hybrid"
  );
  const [drawTool, setDrawTool] = useState<DrawTool>("box");
  const [applyToAllPages, setApplyToAllPages] = useState<boolean>(true);
  const [preserveDarkText, setPreserveDarkText] = useState<boolean>(!isImageMode);

  // Threshold sliders
  const [lightnessCutoff, setLightnessCutoff] = useState<number>(175);
  const [darkTextCutoff, setDarkTextCutoff] = useState<number>(115);
  const [tintTolerance, setTintTolerance] = useState<number>(85);
  const [brushSize, setBrushSize] = useState<number>(0.035);

  // Interactive selections
  const [maskBoxes, setMaskBoxes] = useState<MaskBox[]>([]);
  const [brushStrokes, setBrushStrokes] = useState<BrushStroke[]>([]);

  // Live preview state
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>("");
  const [processingProgress, setProcessingProgress] = useState<number>(0);

  // Pointer drawing state
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const decodeImageFileToCanvas = async (imgFile: File): Promise<HTMLCanvasElement> => {
    const imgUrl = URL.createObjectURL(imgFile);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(`Failed to decode image: ${imgFile.name}`));
        el.src = imgUrl;
      });
      const canvas = document.createElement("canvas");
      const maxDim = 2400;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      return canvas;
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  };

  // Load PDF or single/bulk images into high-res offscreen canvases
  const handleFilesSelect = useCallback(
    async (selectedFiles: File[], append: boolean = false) => {
      if (!selectedFiles.length) return;
      setIsLoadingFile(true);

      try {
        const pdfFile = !isImageMode
          ? selectedFiles.find(
              (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
            )
          : undefined;

        const imageFiles = selectedFiles.filter(
          (f) =>
            f.type.startsWith("image/") ||
            /\.(png|jpe?g|webp|avif|bmp)$/i.test(f.name)
        );

        if (!isImageMode && pdfFile && !append) {
          setFiles([pdfFile]);
          setFileType("pdf");
          setMaskBoxes([]);
          setBrushStrokes([]);
          setCurrentPage(0);

          const rawBuf = await pdfFile.arrayBuffer();
          const strippedBytes = await stripPdfAnnotationWatermarks(rawBuf);
          const pdfjsLib = await loadPdfJsLibrary();

          let pdfDoc: any;
          try {
            pdfDoc = await pdfjsLib.getDocument({ data: strippedBytes.slice(0) }).promise;
          } catch (err: any) {
            if (err?.name === "PasswordException" && askPassword) {
              const pwd = await askPassword("required");
              if (!pwd) throw new Error("Password required to open encrypted PDF.");
              pdfDoc = await pdfjsLib.getDocument({
                data: strippedBytes.slice(0),
                password: pwd,
              }).promise;
            } else {
              throw err;
            }
          }

          const canvases: HTMLCanvasElement[] = [];
          const names: string[] = [];
          const numPages = pdfDoc.numPages;

          for (let i = 1; i <= numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            canvases.push(canvas);
            names.push(`Page ${i}`);
          }

          setPageCanvases(canvases);
          setPageNames(names);
          setRemovalMode("hybrid");
          setPreserveDarkText(true);
        } else if (imageFiles.length > 0) {
          const newCanvases: HTMLCanvasElement[] = [];
          const newNames: string[] = [];

          for (const imgFile of imageFiles) {
            const c = await decodeImageFileToCanvas(imgFile);
            newCanvases.push(c);
            newNames.push(imgFile.name);
          }

          if (append && fileType === "image") {
            setFiles((prev) => [...prev, ...imageFiles]);
            setPageCanvases((prev) => [...prev, ...newCanvases]);
            setPageNames((prev) => [...prev, ...newNames]);
          } else {
            setFiles(imageFiles);
            setFileType("image");
            setMaskBoxes([]);
            setBrushStrokes([]);
            setCurrentPage(0);
            setPageCanvases(newCanvases);
            setPageNames(newNames);
            setRemovalMode(isImageMode ? "inpaint_patch" : "hybrid");
            setPreserveDarkText(!isImageMode);
          }
        } else {
          showToast(
            isImageMode
              ? "Unsupported format. Please upload one or more JPG, PNG, WebP, or AVIF images."
              : "Unsupported format. Please upload a PDF document.",
            "error"
          );
        }
      } catch (err: any) {
        showToast(err?.message || "Failed to load file.", "error");
      } finally {
        setIsLoadingFile(false);
      }
    },
    [askPassword, fileType, isImageMode, showToast]
  );

  useEffect(() => {
    return registerDropHandler((droppedFiles) => {
      if (droppedFiles.length > 0) {
        handleFilesSelect(droppedFiles, fileType === "image" && isImageMode);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, handleFilesSelect, fileType, isImageMode]);

  useEffect(() => {
    if (initialFiles && initialFiles.length > 0 && files.length === 0) {
      handleFilesSelect(initialFiles, false);
    } else if (initialFile && files.length === 0) {
      handleFilesSelect([initialFile], false);
    }
  }, [initialFile, initialFiles, files.length, handleFilesSelect]);

  // Keep existing boxes/strokes synced when toggling "Apply to All Pages/Images" vs "Manual Per Page/Image"
  const handleToggleApplyScope = (applyAll: boolean) => {
    setApplyToAllPages(applyAll);
    if (applyAll) {
      setMaskBoxes((prev) =>
        prev.map((b) => (b.pageIndex === currentPage ? { ...b, pageIndex: "all" } : b))
      );
      setBrushStrokes((prev) =>
        prev.map((s) => (s.pageIndex === currentPage ? { ...s, pageIndex: "all" } : s))
      );
    } else {
      setMaskBoxes((prev) =>
        prev.map((b) => (b.pageIndex === "all" ? { ...b, pageIndex: currentPage } : b))
      );
      setBrushStrokes((prev) =>
        prev.map((s) => (s.pageIndex === "all" ? { ...s, pageIndex: currentPage } : s))
      );
    }
  };

  // Render live cleaned preview for currentPage
  useEffect(() => {
    const srcCanvas = pageCanvases[currentPage];
    const destCanvas = previewCanvasRef.current;
    if (!srcCanvas || !destCanvas) return;

    destCanvas.width = srcCanvas.width;
    destCanvas.height = srcCanvas.height;
    const ctx = destCanvas.getContext("2d")!;

    if (showOriginal) {
      ctx.drawImage(srcCanvas, 0, 0);
      return;
    }

    const cleaned = applyWatermarkRemovalToCanvas(
      srcCanvas,
      currentPage,
      removalMode,
      lightnessCutoff,
      darkTextCutoff,
      tintTolerance,
      preserveDarkText,
      maskBoxes,
      brushStrokes
    );
    ctx.drawImage(cleaned, 0, 0);
  }, [
    pageCanvases,
    currentPage,
    showOriginal,
    removalMode,
    lightnessCutoff,
    darkTextCutoff,
    tintTolerance,
    preserveDarkText,
    maskBoxes,
    brushStrokes,
  ]);

  // Render interactive selection overlay (boxes + brush strokes)
  useEffect(() => {
    const srcCanvas = pageCanvases[currentPage];
    const overlay = overlayCanvasRef.current;
    if (!srcCanvas || !overlay) return;

    overlay.width = srcCanvas.width;
    overlay.height = srcCanvas.height;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const w = overlay.width;
    const h = overlay.height;

    const activeBoxes = maskBoxes.filter(
      (b) => b.pageIndex === "all" || b.pageIndex === currentPage
    );
    for (const box of activeBoxes) {
      const rx = box.x * w;
      const ry = box.y * h;
      const rw = box.w * w;
      const rh = box.h * h;
      ctx.save();
      ctx.strokeStyle = box.pageIndex === "all" ? "#10b981" : "#f43f5e";
      ctx.lineWidth = Math.max(2, w * 0.0025);
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle =
        box.pageIndex === "all"
          ? "rgba(16, 185, 129, 0.14)"
          : "rgba(244, 63, 94, 0.14)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
    }

    if (currentBox) {
      ctx.save();
      ctx.strokeStyle = applyToAllPages ? "#10b981" : "#f43f5e";
      ctx.lineWidth = Math.max(2, w * 0.003);
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        currentBox.x * w,
        currentBox.y * h,
        currentBox.w * w,
        currentBox.h * h
      );
      ctx.fillStyle = applyToAllPages
        ? "rgba(16, 185, 129, 0.2)"
        : "rgba(244, 63, 94, 0.2)";
      ctx.fillRect(
        currentBox.x * w,
        currentBox.y * h,
        currentBox.w * w,
        currentBox.h * h
      );
      ctx.restore();
    }

    const activeStrokes = brushStrokes.filter(
      (s) => s.pageIndex === "all" || s.pageIndex === currentPage
    );
    for (const stroke of activeStrokes) {
      if (stroke.points.length === 0) continue;
      ctx.save();
      ctx.strokeStyle =
        stroke.pageIndex === "all"
          ? "rgba(16, 185, 129, 0.42)"
          : "rgba(244, 63, 94, 0.42)";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(4, stroke.size * w);
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (currentStroke.length > 0) {
      ctx.save();
      ctx.strokeStyle = applyToAllPages
        ? "rgba(16, 185, 129, 0.58)"
        : "rgba(244, 63, 94, 0.58)";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(4, brushSize * w);
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x * w, currentStroke[0].y * h);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x * w, currentStroke[i].y * h);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [
    pageCanvases,
    currentPage,
    maskBoxes,
    currentBox,
    brushStrokes,
    currentStroke,
    brushSize,
    applyToAllPages,
  ]);

  const getNormalizedCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getNormalizedCoords(e);
    setIsDrawing(true);
    if (drawTool === "box") {
      setDragStart(pt);
      setCurrentBox({ x: pt.x, y: pt.y, w: 0, h: 0 });
    } else {
      setCurrentStroke([pt]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pt = getNormalizedCoords(e);
    if (drawTool === "box" && dragStart) {
      const x = Math.min(dragStart.x, pt.x);
      const y = Math.min(dragStart.y, pt.y);
      const w = Math.abs(pt.x - dragStart.x);
      const h = Math.abs(pt.y - dragStart.y);
      setCurrentBox({ x, y, w, h });
    } else if (drawTool === "brush") {
      setCurrentStroke((prev) => [...prev, pt]);
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (drawTool === "box" && currentBox) {
      if (currentBox.w > 0.008 && currentBox.h > 0.008) {
        setMaskBoxes((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            ...currentBox,
            pageIndex: applyToAllPages ? "all" : currentPage,
          },
        ]);
      }
      setCurrentBox(null);
      setDragStart(null);
    } else if (drawTool === "brush" && currentStroke.length > 0) {
      setBrushStrokes((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          points: currentStroke,
          size: brushSize,
          pageIndex: applyToAllPages ? "all" : currentPage,
        },
      ]);
      setCurrentStroke([]);
    }
  };

  const handleUndoMask = () => {
    if (brushStrokes.length > 0) {
      setBrushStrokes((prev) => prev.slice(0, -1));
    } else if (maskBoxes.length > 0) {
      setMaskBoxes((prev) => prev.slice(0, -1));
    }
  };

  const handleClearMasks = () => {
    setMaskBoxes([]);
    setBrushStrokes([]);
  };

  const handleClearCurrentPageMasks = () => {
    setMaskBoxes((prev) => prev.filter((b) => b.pageIndex !== currentPage));
    setBrushStrokes((prev) => prev.filter((s) => s.pageIndex !== currentPage));
  };

  const handleExportCleaned = async () => {
    if (!files.length || pageCanvases.length === 0) return;
    setIsProcessing(true);
    setProcessingProgress(5);
    setProcessingStep("INITIALIZING ZERO-TRACE WATERMARK REMOVAL ENGINE...");

    try {
      const cleanedPreviews: string[] = [];
      const originalPreviews: string[] = [];
      const maxPreviewItems = Math.min(pageCanvases.length, 12);

      if (fileType === "pdf") {
        const outPdf = await PDFDocument.create();
        const total = pageCanvases.length;

        for (let i = 0; i < total; i++) {
          setProcessingStep(`CLEANING & RECONSTRUCTING PAGE ${i + 1} OF ${total}...`);
          setProcessingProgress(Math.round(10 + ((i + 1) / total) * 80));
          await new Promise((r) => setTimeout(r, 15));

          const cleanedCanvas = applyWatermarkRemovalToCanvas(
            pageCanvases[i],
            i,
            removalMode,
            lightnessCutoff,
            darkTextCutoff,
            tintTolerance,
            preserveDarkText,
            maskBoxes,
            brushStrokes
          );

          const jpegDataUrl = cleanedCanvas.toDataURL("image/jpeg", 0.94);
          if (i < maxPreviewItems) {
            cleanedPreviews.push(jpegDataUrl);
            originalPreviews.push(pageCanvases[i].toDataURL("image/jpeg", 0.85));
          }

          const jpegBytes = await fetch(jpegDataUrl).then((res) => res.arrayBuffer());
          const embeddedJpg = await outPdf.embedJpg(jpegBytes);

          const pageWidthPt = cleanedCanvas.width / 2.0;
          const pageHeightPt = cleanedCanvas.height / 2.0;
          const page = outPdf.addPage([pageWidthPt, pageHeightPt]);
          page.drawImage(embeddedJpg, {
            x: 0,
            y: 0,
            width: pageWidthPt,
            height: pageHeightPt,
          });
        }

        setProcessingStep("PACKAGING CLEANED PDF DOCUMENT...");
        setProcessingProgress(95);
        const finalPdfBytes = await outPdf.save();
        const blob = new Blob([finalPdfBytes as any], { type: "application/pdf" });
        const baseName = files[0].name.replace(/\.[^/.]+$/, "");

        await saveFile(toolKey, {
          blob,
          filename: `${baseName}_clean.pdf`,
          size: blob.size,
          format: "application/pdf",
          originalName: files[0].name,
          originalSize: files[0].size,
          previewPages: cleanedPreviews,
          originalPreviewPages: originalPreviews,
        });
      } else if (pageCanvases.length === 1) {
        // Single image export
        setProcessingStep("INPAINTING & SYNTHESIZING MICRO-TEXTURE...");
        setProcessingProgress(55);
        await new Promise((r) => setTimeout(r, 30));

        const cleanedCanvas = applyWatermarkRemovalToCanvas(
          pageCanvases[0],
          0,
          removalMode,
          lightnessCutoff,
          darkTextCutoff,
          tintTolerance,
          preserveDarkText,
          maskBoxes,
          brushStrokes
        );

        cleanedPreviews.push(cleanedCanvas.toDataURL("image/jpeg", 0.94));
        originalPreviews.push(pageCanvases[0].toDataURL("image/jpeg", 0.88));

        const outMime = files[0].type === "image/png" ? "image/png" : "image/jpeg";
        const outExt = outMime === "image/png" ? "png" : "jpg";
        const blob = await new Promise<Blob>((resolve, reject) => {
          cleanedCanvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
            outMime,
            0.96
          );
        });

        const baseName = files[0].name.replace(/\.[^/.]+$/, "");
        await saveFile(toolKey, {
          blob,
          filename: `${baseName}_clean.${outExt}`,
          size: blob.size,
          format: outMime,
          originalName: files[0].name,
          originalSize: files[0].size,
          previewPages: cleanedPreviews,
          originalPreviewPages: originalPreviews,
        });
      } else {
        // Bulk Images -> Export as ZIP archive + store cleaned previews for Download screen
        const zip = new JSZip();
        const total = pageCanvases.length;
        let totalOriginalBytes = 0;

        for (let i = 0; i < total; i++) {
          setProcessingStep(
            `CLEANING IMAGE ${i + 1} OF ${total} (${pageNames[i] || `Image ${i + 1}`})...`
          );
          setProcessingProgress(Math.round(10 + ((i + 1) / total) * 80));
          await new Promise((r) => setTimeout(r, 15));

          const srcFile = files[i] || files[0];
          totalOriginalBytes += srcFile?.size || 0;

          const cleanedCanvas = applyWatermarkRemovalToCanvas(
            pageCanvases[i],
            i,
            removalMode,
            lightnessCutoff,
            darkTextCutoff,
            tintTolerance,
            preserveDarkText,
            maskBoxes,
            brushStrokes
          );

          if (i < maxPreviewItems) {
            cleanedPreviews.push(cleanedCanvas.toDataURL("image/jpeg", 0.92));
            originalPreviews.push(pageCanvases[i].toDataURL("image/jpeg", 0.85));
          }

          const isPng = srcFile?.type === "image/png" || /\.png$/i.test(srcFile?.name || "");
          const outMime = isPng ? "image/png" : "image/jpeg";
          const outExt = isPng ? "png" : "jpg";

          const imgBlob = await new Promise<Blob>((resolve, reject) => {
            cleanedCanvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("Image export failed"))),
              outMime,
              0.96
            );
          });

          const rawName = (pageNames[i] || `image_${i + 1}`).replace(/\.[^/.]+$/, "");
          zip.file(`${rawName}_clean.${outExt}`, imgBlob);
        }

        setProcessingStep("PACKAGING BULK CLEANED IMAGES INTO ZIP ARCHIVE...");
        setProcessingProgress(95);
        const zipBlob = await zip.generateAsync({ type: "blob" });

        await saveFile(toolKey, {
          blob: zipBlob,
          filename: `watermark_removed_${total}_images.zip`,
          size: zipBlob.size,
          format: "application/zip",
          originalName: `${total} Images (Bulk)`,
          originalSize: totalOriginalBytes,
          previewPages: cleanedPreviews,
          originalPreviewPages: originalPreviews,
        });
      }

      setProcessingProgress(100);
      showToast(
        isImageMode
          ? "Image watermark removal complete."
          : "PDF watermark removal complete.",
        "success"
      );
      onSuccess();
    } catch (err: any) {
      showToast(err?.message || "Failed to export cleaned file.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const itemUnitLabel = fileType === "image" ? "IMAGE" : "PAGE";
  const currentMaskCount =
    maskBoxes.filter((b) => b.pageIndex === "all" || b.pageIndex === currentPage).length +
    brushStrokes.filter((s) => s.pageIndex === "all" || s.pageIndex === currentPage).length;

  return (
    <section
      className="space-y-6 animate-fade-in"
      id={isImageMode ? "image-watermark-remover-view" : "pdf-watermark-remover-view"}
      aria-labelledby="watermark-remover-heading"
    >
      {/* Unified Header matching all other MONO-TRANSCODER tools */}
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="watermark-remover-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            {isImageMode
              ? "IMAGE WATERMARK REMOVER // IMG_WATERMARK_ERASER.PRG"
              : "PDF WATERMARK REMOVER // PDF_WATERMARK_ERASER.PRG"}
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            {isImageMode
              ? "Upload single or bulk images. Mark watermarks on one image and select Apply to All (same coordinates, exported as ZIP) or manually erase on every image with zero-trace inpainting."
              : "Erase diagonal stamps, background logos, and text watermarks across PDF pages using Apply to All (same coordinates) or manual per-page selection in 100% local memory."}
          </p>
        </div>
      </div>

      {/* Upload Dropzone matching ConvertImgView & WatermarkPdfView */}
      {pageCanvases.length === 0 ? (
        <div
          id="watermark-remover-drag-drop"
          role="button"
          tabIndex={0}
          aria-label={
            isImageMode
              ? "Upload single or bulk images to remove watermark"
              : "Upload PDF file to remove watermark"
          }
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            const dropped = Array.from(e.dataTransfer.files || []);
            if (dropped.length > 0) handleFilesSelect(dropped, false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 sm:p-12 text-center cursor-pointer transition-all ${
            isDraggingOver
              ? "border-white bg-zinc-900"
              : "border-zinc-700 hover:border-white hover:bg-zinc-950"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple={isImageMode}
            accept={
              isImageMode
                ? "image/png,image/jpeg,image/webp,image/avif"
                : ".pdf,application/pdf"
            }
            className="hidden"
            onChange={(e) => {
              const selected = Array.from(e.target.files || []);
              if (selected.length > 0) handleFilesSelect(selected, false);
            }}
          />

          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge
              view={isImageMode ? "image_watermark_remover" : "pdf_watermark_remover"}
              size="lg"
            />
          </div>

          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            {isLoadingFile
              ? isImageMode
                ? "DECODING IMAGES INTO STUDIO..."
                : "DECODING PDF PAGES INTO STUDIO..."
              : isImageMode
              ? "DRAG & DROP, BROWSE, OR PASTE SINGLE OR BULK IMAGES"
              : "DRAG AND DROP OR BROWSE PDF DOCUMENT (.PDF)"}
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-md mx-auto mb-4 uppercase">
            {isImageMode
              ? "Supports single or bulk JPG, PNG, WebP, and AVIF photos. Bulk uploads export as a single .ZIP archive."
              : "Erase diagonal text stamps, repeating watermarks, and seals across all PDF pages locally."}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
          >
            {isImageMode ? "SELECT_IMAGES" : "SELECT_PDF_FILE"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Interactive Canvas & Page/Image Navigator */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDrawTool("box")}
                  className={`px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold uppercase border transition-all cursor-pointer flex items-center gap-1.5 ${
                    drawTool === "box"
                      ? "bg-white text-black border-white"
                      : "bg-black text-zinc-300 border-zinc-700 hover:border-white"
                  }`}
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>BOX MASK</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawTool("brush")}
                  className={`px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold uppercase border transition-all cursor-pointer flex items-center gap-1.5 ${
                    drawTool === "brush"
                      ? "bg-white text-black border-white"
                      : "bg-black text-zinc-300 border-zinc-700 hover:border-white"
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>BRUSH</span>
                </button>
                <button
                  type="button"
                  onClick={handleUndoMask}
                  disabled={maskBoxes.length === 0 && brushStrokes.length === 0}
                  className="px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold uppercase bg-black text-zinc-300 border border-zinc-700 hover:border-white disabled:opacity-35 cursor-pointer flex items-center gap-1"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>UNDO</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearCurrentPageMasks}
                  disabled={currentMaskCount === 0}
                  className="px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold uppercase bg-black text-zinc-300 border border-zinc-700 hover:border-white disabled:opacity-35 cursor-pointer"
                >
                  CLEAR {itemUnitLabel}
                </button>
                <button
                  type="button"
                  onClick={handleClearMasks}
                  disabled={maskBoxes.length === 0 && brushStrokes.length === 0}
                  className="px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold uppercase bg-black text-zinc-300 border border-zinc-700 hover:border-red-500 hover:text-red-400 disabled:opacity-35 cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>CLEAR ALL</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onMouseDown={() => setShowOriginal(true)}
                  onMouseUp={() => setShowOriginal(false)}
                  onMouseLeave={() => setShowOriginal(false)}
                  onTouchStart={() => setShowOriginal(true)}
                  onTouchEnd={() => setShowOriginal(false)}
                  className={`px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold uppercase border select-none cursor-pointer flex items-center gap-1.5 ${
                    showOriginal
                      ? "bg-amber-400 text-black border-amber-300"
                      : "bg-black text-zinc-300 border-zinc-700 hover:border-white"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>HOLD TO COMPARE</span>
                </button>

                {fileType === "image" && (
                  <>
                    <input
                      ref={appendFileInputRef}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      className="hidden"
                      onChange={(e) => {
                        const added = Array.from(e.target.files || []);
                        if (added.length > 0) handleFilesSelect(added, true);
                        e.currentTarget.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => appendFileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold uppercase bg-black text-emerald-400 border border-zinc-700 hover:border-emerald-400 cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>ADD IMAGES</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setPageCanvases([]);
                    setPageNames([]);
                    setMaskBoxes([]);
                    setBrushStrokes([]);
                  }}
                  className="px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold uppercase bg-zinc-900 text-zinc-200 border border-zinc-700 hover:border-white cursor-pointer flex items-center gap-1"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>CHANGE</span>
                </button>
              </div>
            </div>

            {/* Scope Selector Bar: Apply to All (Same Coordinates) vs Manual Per Page/Image */}
            {pageCanvases.length > 1 && (
              <div className="bg-black border border-zinc-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-mono text-xs font-bold uppercase text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      COORDINATE MODE ({pageCanvases.length} {itemUnitLabel}S LOADED)
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400 block mt-0.5">
                    {applyToAllPages
                      ? `Apply to All: Mark on 1 ${itemUnitLabel.toLowerCase()} to remove watermark from ALL ${pageCanvases.length} ${itemUnitLabel.toLowerCase()}s at the exact same coordinates.`
                      : `Manual Mode: Draw independent watermark positions on each ${itemUnitLabel.toLowerCase()}.`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleApplyScope(true)}
                    className={`px-2.5 py-1.5 rounded font-mono text-[11px] font-bold uppercase border cursor-pointer transition-colors ${
                      applyToAllPages
                        ? "bg-white text-black border-white"
                        : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-white"
                    }`}
                  >
                    APPLY TO ALL (SAME COORDS)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleApplyScope(false)}
                    className={`px-2.5 py-1.5 rounded font-mono text-[11px] font-bold uppercase border cursor-pointer transition-colors ${
                      !applyToAllPages
                        ? "bg-white text-black border-white"
                        : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-white"
                    }`}
                  >
                    MANUAL EVERY {itemUnitLabel}
                  </button>
                </div>
              </div>
            )}

            {/* Interactive Canvas Viewport */}
            <div className="bg-black border border-zinc-800 rounded-lg p-3 sm:p-4 flex flex-col items-center justify-center min-h-[340px] sm:min-h-[440px] relative overflow-auto">
              <div className="relative inline-block shadow-2xl border border-zinc-700 max-w-full">
                <canvas
                  ref={previewCanvasRef}
                  className="block max-w-full max-h-[60vh] w-auto h-auto select-none"
                />
                <canvas
                  ref={overlayCanvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between w-full font-mono text-[11px] text-zinc-400 px-1 gap-2">
                <span>
                  {drawTool === "box"
                    ? "DRAG A BOX OVER ANY WATERMARK, LOGO, OR STAMP TO ERASE IT"
                    : "PAINT DIRECTLY OVER DIAGONAL TEXT OR IRREGULAR WATERMARKS"}
                </span>
                <span className="font-bold uppercase text-emerald-400">
                  {showOriginal
                    ? "VIEWING: ORIGINAL INPUT"
                    : "VIEWING: LIVE ZERO-TRACE OUTPUT"}
                </span>
              </div>
            </div>

            {/* Multi-Page / Bulk Image Pagination Strip */}
            {pageCanvases.length > 1 && (
              <div className="bg-black border border-zinc-800 rounded-lg p-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded font-mono text-xs font-bold uppercase text-white disabled:opacity-35 hover:border-white cursor-pointer flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>PREV {itemUnitLabel}</span>
                  </button>
                  <div className="text-center">
                    <span className="font-mono text-xs font-bold uppercase text-white block">
                      {itemUnitLabel} {currentPage + 1} / {pageCanvases.length}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400 truncate max-w-[220px] block">
                      {pageNames[currentPage]}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={currentPage === pageCanvases.length - 1}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(pageCanvases.length - 1, p + 1))
                    }
                    className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded font-mono text-xs font-bold uppercase text-white disabled:opacity-35 hover:border-white cursor-pointer flex items-center gap-1"
                  >
                    <span>NEXT {itemUnitLabel}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick Page/Image Selector Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {pageCanvases.map((_, idx) => {
                    const hasManualMask =
                      maskBoxes.some((b) => b.pageIndex === idx) ||
                      brushStrokes.some((s) => s.pageIndex === idx);
                    const hasGlobalMask =
                      maskBoxes.some((b) => b.pageIndex === "all") ||
                      brushStrokes.some((s) => s.pageIndex === "all");
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCurrentPage(idx)}
                        className={`px-2.5 py-1 rounded font-mono text-[11px] font-bold border shrink-0 cursor-pointer transition-colors ${
                          currentPage === idx
                            ? "bg-white text-black border-white"
                            : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-white"
                        }`}
                      >
                        #{idx + 1}
                        {(hasManualMask || hasGlobalMask) && (
                          <span className="ml-1 text-[9px] text-emerald-400">●</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Removal Engine Controls */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-5">
              <div className="border-b border-zinc-800 pb-3">
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                  WATERMARK REMOVAL PARAMETERS
                </h2>
              </div>

              {/* Engine Mode Selector */}
              <div className="space-y-2">
                <label className="font-mono text-[11px] font-bold uppercase text-zinc-400 block">
                  1. REMOVAL ENGINE MODE
                </label>
                <button
                  type="button"
                  onClick={() => setRemovalMode("hybrid")}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all cursor-pointer ${
                    removalMode === "hybrid"
                      ? "bg-white text-black border-white"
                      : "bg-black text-zinc-200 border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div className="font-mono text-xs font-bold uppercase">
                    HYBRID ZERO-TRACE (RECOMMENDED)
                  </div>
                  <div className="font-mono text-[11px] opacity-75 mt-0.5">
                    Adaptive background reconstruction + micro-texture patch synthesis inside drawn masks.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRemovalMode("document_clean")}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all cursor-pointer ${
                    removalMode === "document_clean"
                      ? "bg-white text-black border-white"
                      : "bg-black text-zinc-200 border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div className="font-mono text-xs font-bold uppercase">
                    DOCUMENT TEXT &amp; STAMP DESCREEN
                  </div>
                  <div className="font-mono text-[11px] opacity-75 mt-0.5">
                    Erases diagonal gray/colored stamps while reverse-unblending overlapping dark text.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRemovalMode("inpaint_patch")}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all cursor-pointer ${
                    removalMode === "inpaint_patch"
                      ? "bg-white text-black border-white"
                      : "bg-black text-zinc-200 border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div className="font-mono text-xs font-bold uppercase">
                    SEAMLESS PHOTO &amp; TEXTURE INPAINT
                  </div>
                  <div className="font-mono text-[11px] opacity-75 mt-0.5">
                    Reconstructs photo backgrounds and natural grain exclusively inside your drawn boxes/strokes.
                  </div>
                </button>
              </div>

              {/* Sliders */}
              {(removalMode === "document_clean" || removalMode === "hybrid") && (
                <div className="space-y-4 border-t border-zinc-800 pt-4">
                  <div>
                    <div className="flex justify-between font-mono text-xs text-zinc-300 mb-1">
                      <span className="font-bold uppercase">WATERMARK LIGHTNESS CUTOFF</span>
                      <span className="text-white font-bold">{lightnessCutoff}</span>
                    </div>
                    <input
                      type="range"
                      min={115}
                      max={240}
                      value={lightnessCutoff}
                      onChange={(e) => setLightnessCutoff(Number(e.target.value))}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                    <p className="font-mono text-[10px] text-zinc-400 mt-1">
                      Lower values erase darker watermarks; higher values target faint gray stamps.
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between font-mono text-xs text-zinc-300 mb-1">
                      <span className="font-bold uppercase">COLOR STAMP TOLERANCE</span>
                      <span className="text-white font-bold">{tintTolerance}</span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={180}
                      value={tintTolerance}
                      onChange={(e) => setTintTolerance(Number(e.target.value))}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                    <p className="font-mono text-[10px] text-zinc-400 mt-1">
                      Targets red, blue, or tinted CONFIDENTIAL / DRAFT ink stamps.
                    </p>
                  </div>
                </div>
              )}

              {drawTool === "brush" && (
                <div className="border-t border-zinc-800 pt-4">
                  <div className="flex justify-between font-mono text-xs text-zinc-300 mb-1">
                    <span className="font-bold uppercase">ERASER BRUSH SIZE</span>
                    <span className="text-white font-bold">{Math.round(brushSize * 1000)} PX</span>
                  </div>
                  <input
                    type="range"
                    min={0.01}
                    max={0.1}
                    step={0.005}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>
              )}

              {/* Checkboxes */}
              <div className="border-t border-zinc-800 pt-4 space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer font-mono text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    checked={preserveDarkText}
                    onChange={(e) => setPreserveDarkText(e.target.checked)}
                    className="mt-0.5 accent-emerald-400 w-4 h-4"
                  />
                  <span>
                    <strong className="uppercase block text-white">
                      PRESERVE OVERLAPPING DARK TEXT
                    </strong>
                    <span className="text-[11px] text-zinc-400">
                      Protects black/dark body text when a watermark crosses over paragraphs.
                    </span>
                  </span>
                </label>

                {preserveDarkText && (
                  <div className="pl-6">
                    <div className="flex justify-between font-mono text-[11px] text-zinc-300 mb-1">
                      <span className="font-bold uppercase">TEXT PROTECTION THRESHOLD</span>
                      <span className="text-white font-bold">{darkTextCutoff}</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={165}
                      value={darkTextCutoff}
                      onChange={(e) => setDarkTextCutoff(Number(e.target.value))}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                  </div>
                )}

                {pageCanvases.length > 1 && (
                  <label className="flex items-start gap-2.5 cursor-pointer font-mono text-xs text-zinc-200">
                    <input
                      type="checkbox"
                      checked={applyToAllPages}
                      onChange={(e) => handleToggleApplyScope(e.target.checked)}
                      className="mt-0.5 accent-emerald-400 w-4 h-4"
                    />
                    <span>
                      <strong className="uppercase block text-white">
                        APPLY TO ALL {pageCanvases.length} {itemUnitLabel}S (SAME COORDINATES)
                      </strong>
                      <span className="text-[11px] text-zinc-400">
                        Uncheck to manually draw separate watermark positions on each {itemUnitLabel.toLowerCase()}.
                      </span>
                    </span>
                  </label>
                )}
              </div>

              {/* Active Selection Summary */}
              <div className="bg-black border border-zinc-800 rounded-lg p-3.5 font-mono text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">LOADED_{itemUnitLabel}S:</span>
                  <strong className="text-white">{pageCanvases.length}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">ACTIVE_MASKS:</span>
                  <strong className="text-emerald-400">{currentMaskCount}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">COORDINATE_MODE:</span>
                  <strong className="text-sky-400">
                    {applyToAllPages ? `ALL ${itemUnitLabel}S SYNCED` : `MANUAL PER ${itemUnitLabel}`}
                  </strong>
                </div>
                {fileType === "image" && pageCanvases.length > 1 && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">BULK_OUTPUT:</span>
                    <strong className="text-amber-400">ZIP ARCHIVE (.ZIP)</strong>
                  </div>
                )}
              </div>

              {isProcessing && (
                <div className="space-y-1.5">
                  <div className="flex justify-between font-mono text-[11px] text-zinc-300">
                    <span>{processingStep}</span>
                    <span>{processingProgress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-black border border-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-150"
                      style={{ width: `${processingProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Export Action Button matching all other views */}
            <button
              type="button"
              onClick={handleExportCleaned}
              disabled={isProcessing}
              className="w-full py-3.5 px-4 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[2px_2px_0px_0px_#ffffff] sm:shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded-lg transition-all min-h-[44px] disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>
                {isProcessing
                  ? `ERASING WATERMARK (${processingProgress}%)...`
                  : fileType === "pdf"
                  ? `REMOVE WATERMARK & EXPORT PDF (${pageCanvases.length} ${
                      pageCanvases.length === 1 ? "PAGE" : "PAGES"
                    })`
                  : pageCanvases.length > 1
                  ? `REMOVE WATERMARKS & EXPORT ZIP (${pageCanvases.length} IMAGES)`
                  : "REMOVE WATERMARK & EXPORT IMAGE"}
              </span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
