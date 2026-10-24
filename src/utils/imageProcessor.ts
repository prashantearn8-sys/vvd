/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImageFormat, ImageProcessResult } from "../types";

const formatSupportCache = new Map<string, boolean>();

/**
 * Tests whether the current browser can natively encode the specified MIME type via HTMLCanvasElement.
 * Browsers silently fall back to image/png when an unsupported format (like image/bmp or image/avif on older engines) is requested.
 */
export function isFormatEncodeSupported(mimeType: string): boolean {
  if (mimeType === "image/png" || mimeType === "image/jpeg") {
    return true;
  }
  if (formatSupportCache.has(mimeType)) {
    return formatSupportCache.get(mimeType)!;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const dataUrl = canvas.toDataURL(mimeType);
    const supported = dataUrl.startsWith(`data:${mimeType}`);
    canvas.width = 0;
    canvas.height = 0;
    formatSupportCache.set(mimeType, supported);
    return supported;
  } catch {
    formatSupportCache.set(mimeType, false);
    return false;
  }
}

/**
 * Returns the list of upper-case format labels that the user's browser genuinely supports encoding.
 */
export function getSupportedOutputFormats(): ("JPG" | "PNG" | "WEBP" | "JPEG" | "AVIF")[] {
  const formats: ("JPG" | "PNG" | "WEBP" | "JPEG" | "AVIF")[] = ["JPG", "PNG"];
  if (isFormatEncodeSupported("image/webp")) {
    formats.push("WEBP");
  }
  formats.push("JPEG");
  if (isFormatEncodeSupported("image/avif")) {
    formats.push("AVIF");
  }
  return formats;
}

/**
 * Normalizes any input file MIME type into a verified browser-encodable ImageFormat.
 */
export function normalizeSupportedEncodeFormat(mimeType?: string): ImageFormat {
  if (mimeType === "image/png") return "image/png";
  if (mimeType === "image/webp" && isFormatEncodeSupported("image/webp")) return "image/webp";
  if (mimeType === "image/avif" && isFormatEncodeSupported("image/avif")) return "image/avif";
  return "image/jpeg";
}

/**
 * Loads an image directly from a File/Blob using an ephemeral object URL (zero Base64 memory overhead).
 * Enforces mobile-safe canvas resolution limits (max 8,192px per side or 25 Megapixels) and a 150MB file guard.
 */
export function loadImageFromFile(blobOrFile: Blob | File): Promise<{ img: HTMLImageElement; cleanup: () => void }> {
  if (blobOrFile.size && blobOrFile.size > 150 * 1024 * 1024) {
    return Promise.reject(
      new Error("Image file exceeds the 150MB safe browser memory limit.")
    );
  }

  const url = URL.createObjectURL(blobOrFile);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Mobile-safe canvas limit: iOS Safari & mid-range Android devices cap canvas area around 16.7–25MP
      const MAX_SAFE_DIM = 8192;
      const MAX_SAFE_PIXELS = 25_000_000; // 25 Megapixels
      if (
        img.width > MAX_SAFE_DIM ||
        img.height > MAX_SAFE_DIM ||
        img.width * img.height > MAX_SAFE_PIXELS
      ) {
        URL.revokeObjectURL(url);
        img.src = "";
        reject(
          new Error(
            `Image resolution (${img.width}×${img.height}) exceeds mobile-safe browser canvas limits (max 8,192px or 25MP).`
          )
        );
        return;
      }

      resolve({
        img,
        cleanup: () => {
          URL.revokeObjectURL(url);
          img.src = "";
        },
      });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      img.src = "";
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Process image on canvas to compress, strip metadata, and/or convert format.
 * Includes explicit canvas memory release, format verification, and zero-copy pipelines.
 */
export async function processImageClientSide(
  file: File,
  quality: number,
  scale: number,
  targetFormat: ImageFormat,
  rotation = 0,
  maxDimension?: string | number
): Promise<ImageProcessResult> {
  if (!isFormatEncodeSupported(targetFormat)) {
    throw new Error(`Your browser does not natively support encoding ${targetFormat}. Please choose JPG, PNG, or WebP.`);
  }

  const { img, cleanup } = await loadImageFromFile(file);

  try {
    let finalScale = scale;
    if (maxDimension && maxDimension !== "original") {
      const maxDim = typeof maxDimension === "string" ? parseInt(maxDimension) : maxDimension;
      if (!isNaN(maxDim)) {
        const currentMax = Math.max(img.width, img.height);
        if (currentMax > maxDim) {
          finalScale = (maxDim / currentMax) * scale;
        }
      }
    }

    const angleRad = (rotation * Math.PI) / 180;
    const is90or270 = Math.abs(rotation % 180) === 90;

    const targetWidth = Math.max(1, is90or270 ? Math.round(img.height * finalScale) : Math.round(img.width * finalScale));
    const targetHeight = Math.max(1, is90or270 ? Math.round(img.width * finalScale) : Math.round(img.height * finalScale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not retrieve 2D context from canvas");
    }

    if (targetFormat === "image/jpeg") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.translate(targetWidth / 2, targetHeight / 2);
    ctx.rotate(angleRad);

    const drawWidth = Math.max(1, Math.round(img.width * finalScale));
    const drawHeight = Math.max(1, Math.round(img.height * finalScale));

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

    const result = await new Promise<ImageProcessResult>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas export failed"));
            return;
          }
          if (blob.type && blob.type !== targetFormat) {
            reject(new Error(`Browser could not encode ${targetFormat} (fell back to ${blob.type}).`));
            return;
          }

          resolve({
            url: "",
            size: blob.size,
            width: targetWidth,
            height: targetHeight,
            format: targetFormat,
            blob,
          });
        },
        targetFormat,
        targetFormat === "image/png" ? undefined : quality
      );
    });

    canvas.width = 0;
    canvas.height = 0;

    return result;
  } finally {
    cleanup();
  }
}

/**
 * Lossless image compression: strips EXIF/GPS/ICC metadata while preserving 100% resolution & visual bit integrity
 */
export async function processImageLossless(
  file: File,
  targetFormat?: ImageFormat
): Promise<ImageProcessResult> {
  const { img, cleanup } = await loadImageFromFile(file);

  try {
    const targetWidth = img.width;
    const targetHeight = img.height;

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not retrieve 2D context from canvas");
    }

    const fmt = normalizeSupportedEncodeFormat(targetFormat || file.type || "image/png");

    if (fmt === "image/jpeg") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const result = await new Promise<ImageProcessResult>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Lossless canvas export failed"));
            return;
          }

          resolve({
            url: "",
            size: blob.size,
            width: targetWidth,
            height: targetHeight,
            format: fmt,
            blob,
          });
        },
        fmt,
        fmt === "image/png" ? undefined : 1.0
      );
    });

    canvas.width = 0;
    canvas.height = 0;

    return result;
  } finally {
    cleanup();
  }
}

/**
 * Compresses an image to match a user-defined target size in Kilobytes (KB),
 * or within a [minKB, targetKB] portal window.
 *
 * Strategy:
 * 1. Binary-searches quality (7 steps across [0.08, 0.96]) at full resolution, aiming for 90–100% of targetKB (or [minKB, targetKB]).
 * 2. If even low quality exceeds targetKB, scales dimensions progressively using area-ratio estimation and binary-searches quality at the scaled dimensions.
 * 3. Reports exact achieved KB vs target KB (`hitTarget` + `statusNote`).
 */
export async function compressToTargetSizeKB(
  file: File,
  targetKB: number,
  targetFormat: ImageFormat,
  maxDimension?: string | number,
  minKB?: number
): Promise<ImageProcessResult> {
  const verifiedFormat = normalizeSupportedEncodeFormat(targetFormat);
  const { img, cleanup } = await loadImageFromFile(file);

  const safeMaxKB = Math.max(1, targetKB);
  const hasMinWindow = typeof minKB === "number" && minKB > 0 && minKB < safeMaxKB;
  const lowerBoundKB = hasMinWindow ? minKB! : safeMaxKB * 0.9;

  const buildResult = (
    blob: Blob,
    width: number,
    height: number,
    fmt: ImageFormat
  ): ImageProcessResult => {
    const achievedKB = Number((blob.size / 1024).toFixed(1));
    const withinMax = blob.size <= safeMaxKB * 1024;
    const withinMin = !hasMinWindow || blob.size >= minKB! * 1024;
    const hitTarget = withinMax && withinMin;

    let statusNote: string;
    if (hasMinWindow) {
      if (hitTarget) {
        statusNote = `Achieved ${achievedKB} KB / Target ${minKB}–${safeMaxKB} KB window`;
      } else if (!withinMax) {
        statusNote = `Achieved ${achievedKB} KB (exceeds ${safeMaxKB} KB max limit — try a lower resolution or JPG/WebP format)`;
      } else {
        statusNote = `Achieved ${achievedKB} KB (below ${minKB} KB minimum — source image is already highly compact)`;
      }
    } else {
      const pct = Math.round((achievedKB / safeMaxKB) * 100);
      if (withinMax) {
        statusNote = `Achieved ${achievedKB} KB / Target ${safeMaxKB} KB (${pct}%)`;
      } else {
        statusNote = `Achieved ${achievedKB} KB / Target ${safeMaxKB} KB (minimum possible size for this format & resolution)`;
      }
    }

    return {
      url: "",
      size: blob.size,
      width,
      height,
      format: fmt,
      blob,
      targetKB: safeMaxKB,
      minKB: hasMinWindow ? minKB : undefined,
      hitTarget,
      statusNote,
    };
  };

  try {
    let initialScale = 1.0;
    if (maxDimension && maxDimension !== "original") {
      const maxDim = typeof maxDimension === "string" ? parseInt(maxDimension) : maxDimension;
      if (!isNaN(maxDim)) {
        const currentMax = Math.max(img.width, img.height);
        if (currentMax > maxDim) {
          initialScale = maxDim / currentMax;
        }
      }
    }

    const baseWidth = Math.max(1, Math.round(img.width * initialScale));
    const baseHeight = Math.max(1, Math.round(img.height * initialScale));

    const canvas = document.createElement("canvas");
    canvas.width = baseWidth;
    canvas.height = baseHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not retrieve 2D context from canvas");
    }

    if (verifiedFormat === "image/jpeg") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, baseWidth, baseHeight);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, baseWidth, baseHeight);

    const encodeBlob = (c: HTMLCanvasElement, fmt: string, q?: number): Promise<Blob> =>
      new Promise((res, rej) =>
        c.toBlob(
          (b) => {
            if (!b) {
              rej(new Error("Canvas encoding failed"));
              return;
            }
            if (b.type && b.type !== fmt) {
              rej(new Error(`Browser could not encode ${fmt} (fell back to ${b.type}).`));
              return;
            }
            res(b);
          },
          fmt,
          q
        )
      );

    const scanvas = document.createElement("canvas");
    const sctx = scanvas.getContext("2d");

    const drawScaled = (scale: number, fillWhite: boolean) => {
      const sw = Math.max(1, Math.round(baseWidth * scale));
      const sh = Math.max(1, Math.round(baseHeight * scale));
      scanvas.width = sw;
      scanvas.height = sh;
      if (sctx) {
        if (fillWhite) {
          sctx.fillStyle = "#FFFFFF";
          sctx.fillRect(0, 0, sw, sh);
        }
        sctx.imageSmoothingEnabled = true;
        sctx.imageSmoothingQuality = "high";
        sctx.drawImage(canvas, 0, 0, baseWidth, baseHeight, 0, 0, sw, sh);
      }
      return { sw, sh };
    };

    try {
      // Lossless PNG: binary-search dimension scale since PNG ignores the quality parameter
      if (verifiedFormat === "image/png") {
        const fullBlob = await encodeBlob(canvas, verifiedFormat);
        const fullKB = fullBlob.size / 1024;
        if (fullKB <= safeMaxKB && (!hasMinWindow || fullKB >= minKB!)) {
          return buildResult(fullBlob, baseWidth, baseHeight, verifiedFormat);
        }

        let lowScale = 0.08;
        let highScale = fullKB > safeMaxKB ? 1.0 : 1.6;
        let bestUnder: { blob: Blob; w: number; h: number } | null =
          fullKB <= safeMaxKB ? { blob: fullBlob, w: baseWidth, h: baseHeight } : null;
        let smallest: { blob: Blob; w: number; h: number } = {
          blob: fullBlob,
          w: baseWidth,
          h: baseHeight,
        };

        for (let step = 0; step < 6; step++) {
          const midScale = (lowScale + highScale) / 2;
          const { sw, sh } = drawScaled(midScale, false);
          const blob = await encodeBlob(scanvas, verifiedFormat);
          const sizeKB = blob.size / 1024;

          if (blob.size < smallest.blob.size) {
            smallest = { blob, w: sw, h: sh };
          }

          if (sizeKB <= safeMaxKB) {
            if (!bestUnder || blob.size > bestUnder.blob.size) {
              bestUnder = { blob, w: sw, h: sh };
            }
            if (sizeKB >= lowerBoundKB) {
              return buildResult(blob, sw, sh, verifiedFormat);
            }
            lowScale = midScale;
          } else {
            highScale = midScale;
          }
        }

        const chosen = bestUnder || smallest;
        return buildResult(chosen.blob, chosen.w, chosen.h, verifiedFormat);
      }

      // Lossy formats (JPEG, WEBP, AVIF):
      // Helper that binary-searches quality on a given canvas in 7 steps
      const lossyFormat = verifiedFormat as "image/jpeg" | "image/webp" | "image/avif";

      const binarySearchQualityOnCanvas = async (
        targetCanvas: HTMLCanvasElement,
        steps = 7
      ): Promise<{
        bestUnder: Blob | null;
        smallest: Blob;
        largest: Blob;
      }> => {
        let lowQ = 0.08;
        let highQ = 0.96;
        let bestUnder: Blob | null = null;
        let smallest: Blob | null = null;
        let largest: Blob | null = null;

        for (let i = 0; i < steps; i++) {
          const midQ = Number(((lowQ + highQ) / 2).toFixed(4));
          const blob = await encodeBlob(targetCanvas, lossyFormat, midQ);
          const sizeKB = blob.size / 1024;

          if (!smallest || blob.size < smallest.size) smallest = blob;
          if (!largest || blob.size > largest.size) largest = blob;

          if (sizeKB <= safeMaxKB) {
            if (!bestUnder || blob.size > bestUnder.size) {
              bestUnder = blob;
            }
            // If we landed inside the sweet spot [90%..100% of targetKB] (or [minKB..targetKB]), we can stop early if close to upper bound
            if (sizeKB >= Math.max(lowerBoundKB, safeMaxKB * 0.93)) {
              break;
            }
            lowQ = midQ;
          } else {
            highQ = midQ;
          }
        }

        return {
          bestUnder,
          smallest: smallest!,
          largest: largest!,
        };
      };

      // Step 1: Binary-search quality at 100% base dimensions
      const fullResSearch = await binarySearchQualityOnCanvas(canvas, 7);

      // Case A: Full resolution found a match under safeMaxKB that also satisfies lowerBoundKB (or no downscaling needed)
      if (fullResSearch.bestUnder) {
        const bestKB = fullResSearch.bestUnder.size / 1024;
        if (bestKB >= lowerBoundKB) {
          return buildResult(fullResSearch.bestUnder, baseWidth, baseHeight, verifiedFormat);
        }
        // If bestUnder at q ~ 0.96 is still below lowerBoundKB, check if q = 0.99 or slight upscale helps when minKB is required
        if (hasMinWindow && bestKB < minKB!) {
          const q99 = await encodeBlob(canvas, lossyFormat, 0.99);
          if (q99.size / 1024 <= safeMaxKB && q99.size > fullResSearch.bestUnder.size) {
            if (q99.size / 1024 >= minKB!) {
              return buildResult(q99, baseWidth, baseHeight, verifiedFormat);
            }
            // Try gentle upscale (up to 1.75x) if portal requires a minimum KB floor
            const upscaleRatio = Math.min(1.75, Math.sqrt(minKB! / Math.max(1, q99.size / 1024)) * 1.05);
            if (upscaleRatio > 1.05) {
              const { sw, sh } = drawScaled(upscaleRatio, lossyFormat === "image/jpeg");
              const upSearch = await binarySearchQualityOnCanvas(scanvas, 5);
              if (upSearch.bestUnder && upSearch.bestUnder.size > q99.size) {
                return buildResult(upSearch.bestUnder, sw, sh, verifiedFormat);
              }
            }
            return buildResult(q99, baseWidth, baseHeight, verifiedFormat);
          }
        }
        // Otherwise bestUnder at full resolution (highest quality <= targetKB) is optimal
        return buildResult(fullResSearch.bestUnder, baseWidth, baseHeight, verifiedFormat);
      }

      // Case B: Even lowest quality (q ~ 0.08) at full resolution exceeded safeMaxKB.
      // Progressively scale down dimensions and binary-search quality at the scaled resolution.
      let currentScale = Math.max(
        0.1,
        Math.min(0.88, Math.sqrt(safeMaxKB / Math.max(1, fullResSearch.smallest.size / 1024)) * 0.95)
      );
      let bestScaled: { blob: Blob; w: number; h: number } | null = null;
      let smallestScaled: { blob: Blob; w: number; h: number } = {
        blob: fullResSearch.smallest,
        w: baseWidth,
        h: baseHeight,
      };

      for (let scaleAttempt = 0; scaleAttempt < 4; scaleAttempt++) {
        const { sw, sh } = drawScaled(currentScale, lossyFormat === "image/jpeg");
        // Probe moderate quality (0.55) first to check if this scale can reach targetKB
        const probeMid = await encodeBlob(scanvas, lossyFormat, 0.55);
        const probeMidKB = probeMid.size / 1024;

        if (probeMid.size < smallestScaled.blob.size) {
          smallestScaled = { blob: probeMid, w: sw, h: sh };
        }

        if (probeMidKB <= safeMaxKB * 1.35) {
          // Run binary search on quality at this scaled dimension to land at 90–100% of targetKB
          const scaledSearch = await binarySearchQualityOnCanvas(scanvas, 6);
          if (scaledSearch.smallest.size < smallestScaled.blob.size) {
            smallestScaled = { blob: scaledSearch.smallest, w: sw, h: sh };
          }
          if (scaledSearch.bestUnder) {
            bestScaled = { blob: scaledSearch.bestUnder, w: sw, h: sh };
            const achievedKB = scaledSearch.bestUnder.size / 1024;
            if (achievedKB >= lowerBoundKB) {
              return buildResult(scaledSearch.bestUnder, sw, sh, verifiedFormat);
            }
            break;
          }
        }

        // Still over targetKB: step scale down proportionally
        const refKB = Math.max(1, smallestScaled.blob.size / 1024);
        currentScale = Math.max(0.08, currentScale * Math.sqrt(safeMaxKB / refKB) * 0.85);
      }

      const finalChoice = bestScaled || smallestScaled;
      return buildResult(finalChoice.blob, finalChoice.w, finalChoice.h, verifiedFormat);
    } finally {
      scanvas.width = 0;
      scanvas.height = 0;
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    cleanup();
  }
}

/**
 * Yields a single macrotask tick (~1ms) so React can flush UI state without blocking processing
 */
export function yieldFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Utility to format file sizes elegantly
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
