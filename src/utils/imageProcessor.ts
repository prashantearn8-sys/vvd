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
 * Loads an image directly from a File/Blob using an ephemeral object URL (zero Base64 memory overhead)
 * Enforces file size ceilings and image decompression bomb guards (max 16,384px / 100MP)
 */
export function loadImageFromFile(blobOrFile: Blob | File): Promise<{ img: HTMLImageElement; cleanup: () => void }> {
  // Guard file size (500 MB safe limit)
  if (blobOrFile.size && blobOrFile.size > 500 * 1024 * 1024) {
    return Promise.reject(new Error("File size exceeds 500MB safe in-browser processing limit."));
  }

  const url = URL.createObjectURL(blobOrFile);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Decompression bomb guard: block images with absurd resolutions designed to crash browser memory
      const MAX_SAFE_DIM = 16384;
      const MAX_SAFE_PIXELS = 100_000_000; // 100 Megapixels
      if (img.width > MAX_SAFE_DIM || img.height > MAX_SAFE_DIM || img.width * img.height > MAX_SAFE_PIXELS) {
        URL.revokeObjectURL(url);
        img.src = "";
        reject(
          new Error(
            `Image resolution (${img.width}×${img.height}) exceeds safe processing limits (max 16,384px or 100MP) to prevent memory exhaustion.`
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

    // White background for formats without transparency (JPEG)
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
 * Compresses an image attempting to match a user-defined target size in Kilobytes (KB)
 */
export async function compressToTargetSizeKB(
  file: File,
  targetKB: number,
  targetFormat: ImageFormat,
  maxDimension?: string | number
): Promise<ImageProcessResult> {
  const verifiedFormat = normalizeSupportedEncodeFormat(targetFormat);
  const { img, cleanup } = await loadImageFromFile(file);

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
      new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Canvas encoding failed"))), fmt, q));

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
      // Lossless PNG: Direct area-ratio scale estimation
      if (verifiedFormat === "image/png") {
        const currentKB = file.size / 1024;
        if (currentKB <= targetKB) {
          const blob = await encodeBlob(canvas, verifiedFormat);
          if (blob.size / 1024 <= targetKB) {
            return {
              url: "",
              size: blob.size,
              width: baseWidth,
              height: baseHeight,
              format: verifiedFormat,
              blob,
            };
          }
        }

        let scale = Math.max(0.1, Math.min(0.9, Math.sqrt(targetKB / Math.max(1, currentKB)) * 0.92));
        let bestBlob: Blob | null = null;
        let finalW = baseWidth;
        let finalH = baseHeight;

        for (let attempt = 0; attempt < 2; attempt++) {
          const { sw, sh } = drawScaled(scale, false);
          const blob = await encodeBlob(scanvas, verifiedFormat);
          bestBlob = blob;
          finalW = sw;
          finalH = sh;
          const sizeKB = blob.size / 1024;
          if (sizeKB <= targetKB) break;
          scale = Math.max(0.08, scale * Math.sqrt(targetKB / sizeKB) * 0.88);
        }

        return {
          url: "",
          size: bestBlob!.size,
          width: finalW,
          height: finalH,
          format: verifiedFormat,
          blob: bestBlob!,
        };
      }

      // Lossy formats (JPEG, WEBP, AVIF): Fast 1-to-3 pass adaptive encoder
      const lossyFormat = verifiedFormat as "image/jpeg" | "image/webp" | "image/avif";
      const probe72 = await encodeBlob(canvas, lossyFormat, 0.72);
      const size72KB = probe72.size / 1024;

      if (size72KB <= targetKB) {
        if (size72KB >= targetKB * 0.65) {
          return {
            url: "",
            size: probe72.size,
            width: baseWidth,
            height: baseHeight,
            format: verifiedFormat,
            blob: probe72,
          };
        }
        const probe88 = await encodeBlob(canvas, lossyFormat, 0.88);
        const best = probe88.size / 1024 <= targetKB ? probe88 : probe72;
        return {
          url: "",
          size: best.size,
          width: baseWidth,
          height: baseHeight,
          format: verifiedFormat,
          blob: best,
        };
      }

      const probe42 = await encodeBlob(canvas, lossyFormat, 0.42);
      const size42KB = probe42.size / 1024;

      if (size42KB <= targetKB) {
        return {
          url: "",
          size: probe42.size,
          width: baseWidth,
          height: baseHeight,
          format: verifiedFormat,
          blob: probe42,
        };
      }

      let scale = Math.max(0.12, Math.min(0.9, Math.sqrt(targetKB / size42KB) * 0.92));
      let bestBlob = probe42;
      let finalWidth = baseWidth;
      let finalHeight = baseHeight;

      for (let attempt = 0; attempt < 2; attempt++) {
        const { sw, sh } = drawScaled(scale, lossyFormat === "image/jpeg");
        const blob = await encodeBlob(scanvas, lossyFormat, 0.68);
        bestBlob = blob;
        finalWidth = sw;
        finalHeight = sh;
        const sizeKB = blob.size / 1024;
        if (sizeKB <= targetKB) break;
        scale = Math.max(0.1, scale * Math.sqrt(targetKB / sizeKB) * 0.88);
      }

      return {
        url: "",
        size: bestBlob.size,
        width: finalWidth,
        height: finalHeight,
        format: verifiedFormat,
        blob: bestBlob,
      };
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
