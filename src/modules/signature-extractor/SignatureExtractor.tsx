/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * <SignatureExtractor />
 * Self-contained, 100% client-side handwritten signature extraction studio.
 * Replicates the Photoshop workflow (Luminance -> Illumination Division -> Auto-Levels ->
 * Otsu/Adaptive Threshold -> Anti-Aliased Alpha Matte -> Connected-Component Despeckle ->
 * Ink Recolor -> Morphological Stroke Weight -> Tight Bounding-Box Auto-Crop).
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  Camera,
  Crop,
  Sliders,
  RotateCcw,
  Download,
  Copy,
  Check,
  AlertTriangle,
  Eye,
  Sparkles,
  X,
  ArrowRight,
  ArrowLeft,
  FileCode,
  RefreshCw,
} from "lucide-react";
import {
  NormalizedCropRect,
  SignatureExtractorProps,
} from "./types";
import {
  MAX_FULL_RES_DIMENSION,
  useSignatureExtractor,
} from "./useSignatureExtractor";

type WizardStep = "upload" | "crop" | "editor";

type DragHandle =
  | "move"
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | null;

const INK_PRESETS = [
  { id: "black", label: "Carbon Black", hex: "#000000" },
  { id: "dark_blue", label: "Archival Blue", hex: "#0A2463" },
  { id: "royal_blue", label: "Fountain Blue", hex: "#1D4ED8" },
  { id: "crimson", label: "Seal Crimson", hex: "#991B1B" },
];

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Decodes an image File using createImageBitmap with EXIF orientation ('from-image')
 * and downscales to a maximum of 2500px on the long side to respect iOS Safari canvas limits.
 */
async function decodeAndCapImageFile(
  file: File
): Promise<{ canvas: HTMLCanvasElement; bitmap: ImageBitmap | null }> {
  let bitmap: ImageBitmap | null = null;

  try {
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
    }
  } catch {
    bitmap = null;
  }

  if (bitmap) {
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (srcW <= 0 || srcH <= 0) {
      bitmap.close();
      throw new Error("CORRUPT_IMAGE: Image has invalid zero dimensions.");
    }
    const longSide = Math.max(srcW, srcH);
    const scale =
      longSide > MAX_FULL_RES_DIMENSION ? MAX_FULL_RES_DIMENSION / longSide : 1;
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("CANVAS_ERROR: Could not initialize 2D drawing context.");
    }
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    // Close raw bitmap immediately after drawing to capped canvas to free GPU memory
    bitmap.close();
    return { canvas, bitmap: null };
  }

  // Fallback for environments without createImageBitmap
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(
          new Error(
            "CORRUPT_IMAGE: Could not decode image file. Please try another JPG, PNG, or WebP photo."
          )
        );
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (srcW <= 0 || srcH <= 0) {
      throw new Error("CORRUPT_IMAGE: Image has invalid zero dimensions.");
    }
    const longSide = Math.max(srcW, srcH);
    const scale =
      longSide > MAX_FULL_RES_DIMENSION ? MAX_FULL_RES_DIMENSION / longSide : 1;
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("CANVAS_ERROR: Could not initialize 2D drawing context.");
    }
    ctx.drawImage(img, 0, 0, dstW, dstH);
    return { canvas, bitmap: null };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function SignatureExtractor({
  onComplete,
  onCancel,
  initialParams,
  initialFile,
  maxFileSizeBytes = DEFAULT_MAX_BYTES,
  compact = false,
}: SignatureExtractorProps) {
  const {
    params,
    setParams,
    resetParams,
    isProcessingPreview,
    isExportingFinal,
    previewImageData,
    previewBeforeDataUrl,
    noSignatureDetected,
    processingError,
    setProcessingError,
    preparePreviewSource,
    runImmediatePreview,
    processFullResolution,
  } = useSignatureExtractor(initialParams);

  const [step, setStep] = useState<WizardStep>("upload");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState<boolean>(false);
  const [copiedClipboard, setCopiedClipboard] = useState<boolean>(false);
  const [isTracingSvg, setIsTracingSvg] = useState<boolean>(false);

  // Full-resolution capped source canvas (max 2500px on long side)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sourceDimensions, setSourceDimensions] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  // Normalized crop rectangle (0..1)
  const [cropRect, setCropRect] = useState<NormalizedCropRect>({
    x: 0.06,
    y: 0.12,
    width: 0.88,
    height: 0.76,
  });

  // Refs for DOM elements
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Crop interaction state
  const activeHandleRef = useRef<DragHandle>(null);
  const dragOriginRef = useRef<{
    clientX: number;
    clientY: number;
    rect: NormalizedCropRect;
  }>({
    clientX: 0,
    clientY: 0,
    rect: { x: 0.06, y: 0.12, width: 0.88, height: 0.76 },
  });

  // Cleanup memory on unmount
  useEffect(() => {
    return () => {
      sourceCanvasRef.current = null;
    };
  }, []);

  // Load initialFile if provided
  useEffect(() => {
    if (initialFile) {
      handleFileSelected(initialFile);
    }
  }, [initialFile]);

  const handleFileSelected = async (file: File) => {
    setUploadError(null);
    setProcessingError(null);

    if (!file.type.startsWith("image/")) {
      setUploadError(
        "UNSUPPORTED_FORMAT: Please choose a valid image file (JPG, PNG, WebP, HEIC)."
      );
      return;
    }

    if (file.size > maxFileSizeBytes) {
      const maxMb = Math.round(maxFileSizeBytes / (1024 * 1024));
      setUploadError(
        `FILE_TOO_LARGE: Image exceeds the ${maxMb} MB limit. Please select a smaller photo.`
      );
      return;
    }

    try {
      const { canvas } = await decodeAndCapImageFile(file);
      sourceCanvasRef.current = canvas;
      setSourceDimensions({ width: canvas.width, height: canvas.height });

      const defaultCrop: NormalizedCropRect = {
        x: 0.05,
        y: 0.08,
        width: 0.9,
        height: 0.84,
      };
      setCropRect(defaultCrop);
      setStep("crop");
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : "CORRUPT_IMAGE: Failed to decode the uploaded image."
      );
    }
  };

  // Render interactive crop canvas in Step 2
  useEffect(() => {
    if (step !== "crop") return;
    const srcCanvas = sourceCanvasRef.current;
    const cropCanvas = cropCanvasRef.current;
    if (!srcCanvas || !cropCanvas) return;

    const maxDisplayW = 720;
    const maxDisplayH = 440;
    const scale = Math.min(
      1,
      maxDisplayW / srcCanvas.width,
      maxDisplayH / srcCanvas.height
    );
    const cw = Math.max(1, Math.round(srcCanvas.width * scale));
    const ch = Math.max(1, Math.round(srcCanvas.height * scale));

    if (cropCanvas.width !== cw || cropCanvas.height !== ch) {
      cropCanvas.width = cw;
      cropCanvas.height = ch;
    }

    const ctx = cropCanvas.getContext("2d");
    if (!ctx) return;

    // 1. Draw full image
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(srcCanvas, 0, 0, cw, ch);

    // 2. Dim outside crop region
    const rx = cropRect.x * cw;
    const ry = cropRect.y * ch;
    const rw = cropRect.width * cw;
    const rh = cropRect.height * ch;

    ctx.fillStyle = "rgba(9, 9, 11, 0.65)";
    ctx.fillRect(0, 0, cw, ry);
    ctx.fillRect(0, ry + rh, cw, ch - (ry + rh));
    ctx.fillRect(0, ry, rx, rh);
    ctx.fillRect(rx + rw, ry, cw - (rx + rw), rh);

    // 3. Draw crisp crop border + rule-of-thirds baseline guide
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh * 0.68);
    ctx.lineTo(rx + rw, ry + rh * 0.68);
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Corner handles
    const handleSize = 10;
    const corners = [
      [rx, ry],
      [rx + rw, ry],
      [rx, ry + rh],
      [rx + rw, ry + rh],
    ];
    ctx.fillStyle = "#10b981";
    for (const [cx, cy] of corners) {
      ctx.fillRect(
        cx - handleSize / 2,
        cy - handleSize / 2,
        handleSize,
        handleSize
      );
    }
  }, [step, cropRect, sourceDimensions]);

  // Pointer handlers for interactive crop box
  const handleCropPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    const tol = 0.045;
    const { x, y, width, height } = cropRect;

    let mode: DragHandle = null;
    if (Math.abs(nx - x) < tol && Math.abs(ny - y) < tol) mode = "nw";
    else if (Math.abs(nx - (x + width)) < tol && Math.abs(ny - y) < tol)
      mode = "ne";
    else if (Math.abs(nx - x) < tol && Math.abs(ny - (y + height)) < tol)
      mode = "sw";
    else if (
      Math.abs(nx - (x + width)) < tol &&
      Math.abs(ny - (y + height)) < tol
    )
      mode = "se";
    else if (nx >= x && nx <= x + width && ny >= y && ny <= y + height)
      mode = "move";
    else {
      // Start a new centered box around clicked point
      const nw = Math.min(0.8, width);
      const nh = Math.min(0.6, height);
      const cx = Math.max(0, Math.min(1 - nw, nx - nw / 2));
      const cy = Math.max(0, Math.min(1 - nh, ny - nh / 2));
      const updated = { x: cx, y: cy, width: nw, height: nh };
      setCropRect(updated);
      activeHandleRef.current = "move";
      dragOriginRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        rect: updated,
      };
      return;
    }

    activeHandleRef.current = mode;
    dragOriginRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      rect: { ...cropRect },
    };
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = activeHandleRef.current;
    const canvas = cropCanvasRef.current;
    if (!mode || !canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const dx = (e.clientX - dragOriginRef.current.clientX) / bounds.width;
    const dy = (e.clientY - dragOriginRef.current.clientY) / bounds.height;
    const orig = dragOriginRef.current.rect;
    const minSize = 0.08;

    if (mode === "move") {
      const nx = Math.max(0, Math.min(1 - orig.width, orig.x + dx));
      const ny = Math.max(0, Math.min(1 - orig.height, orig.y + dy));
      setCropRect({ ...orig, x: nx, y: ny });
    } else if (mode === "se") {
      const nw = Math.max(minSize, Math.min(1 - orig.x, orig.width + dx));
      const nh = Math.max(minSize, Math.min(1 - orig.y, orig.height + dy));
      setCropRect({ ...orig, width: nw, height: nh });
    } else if (mode === "nw") {
      const maxRight = orig.x + orig.width - minSize;
      const maxBottom = orig.y + orig.height - minSize;
      const nx = Math.max(0, Math.min(maxRight, orig.x + dx));
      const ny = Math.max(0, Math.min(maxBottom, orig.y + dy));
      setCropRect({
        x: nx,
        y: ny,
        width: orig.x + orig.width - nx,
        height: orig.y + orig.height - ny,
      });
    } else if (mode === "ne") {
      const maxBottom = orig.y + orig.height - minSize;
      const ny = Math.max(0, Math.min(maxBottom, orig.y + dy));
      const nw = Math.max(minSize, Math.min(1 - orig.x, orig.width + dx));
      setCropRect({
        x: orig.x,
        y: ny,
        width: nw,
        height: orig.y + orig.height - ny,
      });
    } else if (mode === "sw") {
      const maxRight = orig.x + orig.width - minSize;
      const nx = Math.max(0, Math.min(maxRight, orig.x + dx));
      const nh = Math.max(minSize, Math.min(1 - orig.y, orig.height + dy));
      setCropRect({
        x: nx,
        y: orig.y,
        width: orig.x + orig.width - nx,
        height: nh,
      });
    }
  };

  const handleCropPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    activeHandleRef.current = null;
  };

  // Proceed from Step 2 (Crop) to Step 3 (Result Editor)
  const handleConfirmCrop = async (overrideCrop?: NormalizedCropRect) => {
    const srcCanvas = sourceCanvasRef.current;
    if (!srcCanvas) return;
    const activeCrop = overrideCrop || cropRect;
    if (overrideCrop) setCropRect(overrideCrop);

    preparePreviewSource(srcCanvas, activeCrop);
    setStep("editor");
    await runImmediatePreview();
  };

  // Render previewImageData onto the Result Editor canvas in Step 3
  useEffect(() => {
    if (step !== "editor" || !previewImageData || !resultCanvasRef.current) return;
    const canvas = resultCanvasRef.current;
    canvas.width = previewImageData.width;
    canvas.height = previewImageData.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(previewImageData, 0, 0);
    }
  }, [step, previewImageData, showBefore]);

  // Final "Use Signature" action: runs full-resolution pipeline and emits SignatureResult
  const handleCompleteSignature = async () => {
    const srcCanvas = sourceCanvasRef.current;
    if (!srcCanvas) return;

    try {
      const finalOut = await processFullResolution(srcCanvas, cropRect);
      onComplete({
        blob: finalOut.blob,
        dataUrl: finalOut.dataUrl,
        width: finalOut.width,
        height: finalOut.height,
        params,
      });
    } catch (err) {
      setProcessingError(
        err instanceof Error
          ? err.message
          : "Failed to export full-resolution signature."
      );
    }
  };

  // Direct PNG Download button
  const handleDownloadPng = async () => {
    const srcCanvas = sourceCanvasRef.current;
    if (!srcCanvas) return;
    try {
      const finalOut = await processFullResolution(srcCanvas, cropRect);
      const url = URL.createObjectURL(finalOut.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `extracted_signature_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err) {
      setProcessingError(
        err instanceof Error ? err.message : "Download failed."
      );
    }
  };

  // Copy transparent PNG to system clipboard via ClipboardItem
  const handleCopyClipboard = async () => {
    const srcCanvas = sourceCanvasRef.current;
    if (!srcCanvas) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof ClipboardItem === "undefined"
    ) {
      setProcessingError(
        "CLIPBOARD_UNSUPPORTED: Your browser does not support copying binary PNGs to the clipboard."
      );
      return;
    }

    try {
      const finalOut = await processFullResolution(srcCanvas, cropRect);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": finalOut.blob }),
      ]);
      setCopiedClipboard(true);
      setTimeout(() => setCopiedClipboard(false), 2000);
    } catch {
      setProcessingError("CLIPBOARD_ERROR: Could not copy PNG to clipboard.");
    }
  };

  // Lazy-loaded SVG contour export
  const handleDownloadSvg = async () => {
    const srcCanvas = sourceCanvasRef.current;
    if (!srcCanvas) return;
    setIsTracingSvg(true);
    try {
      const finalOut = await processFullResolution(srcCanvas, cropRect);
      const { traceSignatureToSvg } = await import("./svgTracer");
      const svgString = traceSignatureToSvg(finalOut.imageData, params.inkColor);
      const svgBlob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(svgBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `extracted_signature_${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err) {
      setProcessingError(
        err instanceof Error ? err.message : "SVG vectorization failed."
      );
    } finally {
      setIsTracingSvg(false);
    }
  };

  // Map minComponentAreaRatio (0..0.001) to a clean 0..100 UI percentage
  const noiseSliderVal = Math.round(params.minComponentAreaRatio * 100000);

  return (
    <section
      className="sigx-root bg-zinc-950 border-2 border-zinc-800 text-zinc-100 font-mono rounded-xl overflow-hidden"
      aria-label="Handwritten Signature Extractor Studio"
    >
      {/* TOP STEPPER BAR */}
      <div className="bg-black border-b border-zinc-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] font-bold uppercase tracking-widest rounded">
            SIGNATURE_EXTRACTOR
          </span>
          <div
            className="flex items-center gap-1.5 text-[11px] uppercase"
            role="navigation"
            aria-label="Extraction Steps"
          >
            <span
              className={
                step === "upload"
                  ? "text-white font-bold underline underline-offset-4"
                  : "text-zinc-500"
              }
            >
              1. UPLOAD
            </span>
            <span className="text-zinc-600">→</span>
            <span
              className={
                step === "crop"
                  ? "text-white font-bold underline underline-offset-4"
                  : "text-zinc-500"
              }
            >
              2. CROP
            </span>
            <span className="text-zinc-600">→</span>
            <span
              className={
                step === "editor"
                  ? "text-white font-bold underline underline-offset-4"
                  : "text-zinc-500"
              }
            >
              3. RESULT STUDIO
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onCancel();
          }}
          aria-label="Cancel signature extraction"
          className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-[11px] uppercase flex items-center gap-1 rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-white"
        >
          <X className="w-3.5 h-3.5" />
          CANCEL
        </button>
      </div>

      {/* HIDDEN FILE INPUT */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        aria-label="Upload signature image file"
        data-testid="sigx-file-input"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileSelected(f);
          e.target.value = "";
        }}
      />

      {/* STEP 1: UPLOAD SIGNATURE IMAGE */}
      {step === "upload" && (
        <div className={compact ? "p-4 space-y-4" : "p-6 space-y-5"}>
          {uploadError && (
            <div
              role="alert"
              className="bg-red-950/50 border border-red-500/60 p-3 rounded text-xs text-red-200 flex items-start gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold uppercase">UPLOAD ERROR</p>
                <p className="text-red-300 mt-0.5">{uploadError}</p>
              </div>
            </div>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileSelected(f);
            }}
            tabIndex={0}
            role="button"
            aria-label="Drop handwritten signature photo here or click to upload"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className="border-2 border-dashed border-zinc-700 hover:border-white bg-black/60 hover:bg-zinc-900/60 transition-colors p-8 text-center cursor-pointer rounded-xl focus:outline-none focus:ring-2 focus:ring-white"
          >
            <Upload className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
            <p className="font-sans font-bold text-sm md:text-base uppercase text-white">
              DROP HANDWRITTEN SIGNATURE PHOTO OR CLICK TO BROWSE
            </p>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
              Upload a photo or scan of your signature on paper. Our local 9-step pipeline strips shadows &amp; paper into a clean transparent PNG.
            </p>

            <div
              className="flex flex-wrap items-center justify-center gap-2.5 mt-5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-white hover:bg-zinc-200 text-black font-sans font-bold text-xs uppercase flex items-center gap-1.5 rounded shadow-[3px_3px_0px_0px_#ffffff] cursor-pointer focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Upload className="w-3.5 h-3.5" />
                SELECT SIGNATURE IMAGE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: INTERACTIVE MANUAL CROP */}
      {step === "crop" && (
        <div className={compact ? "p-4 space-y-4" : "p-6 space-y-4"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-sans font-bold text-sm uppercase text-white flex items-center gap-1.5">
                <Crop className="w-4 h-4 text-zinc-300" />
                FRAME YOUR SIGNATURE REGION
              </h3>
              <p className="text-[11px] text-zinc-400">
                Drag corners to crop tightly around the signature, or skip to process the full photo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-xs uppercase flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                RE-UPLOAD
              </button>
              <button
                type="button"
                onClick={() =>
                  handleConfirmCrop({ x: 0, y: 0, width: 1, height: 1 })
                }
                data-testid="sigx-skip-crop-btn"
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-600 rounded text-zinc-200 text-xs uppercase cursor-pointer"
              >
                USE FULL IMAGE
              </button>
              <button
                type="button"
                onClick={() => handleConfirmCrop()}
                data-testid="sigx-apply-crop-btn"
                className="px-4 py-1.5 bg-white hover:bg-zinc-200 text-black font-sans font-bold text-xs uppercase flex items-center gap-1.5 rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-white"
              >
                EXTRACT SIGNATURE
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-black border border-zinc-800 rounded-lg p-4 flex items-center justify-center overflow-hidden">
            <canvas
              ref={cropCanvasRef}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              tabIndex={0}
              aria-label="Signature crop region selector. Use arrow keys to nudge crop box."
              onKeyDown={(e) => {
                const stepPct = 0.02;
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setCropRect((r) => ({ ...r, x: Math.max(0, r.x - stepPct) }));
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setCropRect((r) => ({
                    ...r,
                    x: Math.min(1 - r.width, r.x + stepPct),
                  }));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCropRect((r) => ({ ...r, y: Math.max(0, r.y - stepPct) }));
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCropRect((r) => ({
                    ...r,
                    y: Math.min(1 - r.height, r.y + stepPct),
                  }));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirmCrop();
                }
              }}
              className="max-w-full h-auto cursor-crosshair touch-none border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-white"
            />
          </div>
        </div>
      )}

      {/* STEP 3: RESULT EDITOR */}
      {step === "editor" && (
        <div
          className={
            compact
              ? "p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"
              : "p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          }
        >
          {/* LEFT: CHECKERBOARD TRANSPARENCY PROOF & BEFORE/AFTER */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase text-zinc-300">
                  TRANSPARENCY PROOF:
                </span>
                {isProcessingPreview && (
                  <span
                    role="status"
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] uppercase rounded"
                  >
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    PROCESSING...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowBefore((b) => !b)}
                  aria-pressed={showBefore}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase border rounded flex items-center gap-1 cursor-pointer ${
                    showBefore
                      ? "bg-white border-white text-black"
                      : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white"
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  {showBefore ? "SHOWING: BEFORE (ORIGINAL)" : "BEFORE / AFTER"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("crop")}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300 uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Crop className="w-3 h-3" />
                  RE-CROP
                </button>
                <button
                  type="button"
                  onClick={() => setStep("upload")}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300 uppercase cursor-pointer"
                >
                  RETAKE
                </button>
              </div>
            </div>

            {/* Checkerboard Canvas Viewport */}
            <div
              className="relative min-h-[260px] max-h-[420px] border-2 border-zinc-700 rounded-lg p-6 flex items-center justify-center overflow-auto"
              style={{
                backgroundColor: "#f8fafc",
                backgroundImage:
                  "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                backgroundSize: "20px 20px",
                backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
              }}
            >
              {noSignatureDetected ? (
                <div
                  role="alert"
                  className="bg-zinc-950/95 border-2 border-zinc-600 p-5 rounded-lg max-w-md text-center space-y-2 shadow-xl"
                >
                  <AlertTriangle className="w-7 h-7 text-zinc-300 mx-auto" />
                  <p className="font-sans font-bold text-sm uppercase text-white">
                    NO SIGNATURE DETECTED
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    The extracted alpha bounding box is empty. Try increasing the{" "}
                    <strong>Sensitivity</strong> slider on the right, using better lighting without harsh glare, or signing with a thicker dark pen.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setParams((p) => ({
                          ...p,
                          sensitivity: Math.min(100, p.sensitivity + 25),
                        }))
                      }
                      className="px-3 py-1.5 bg-white text-black font-bold text-[11px] uppercase rounded cursor-pointer"
                    >
                      BOOST SENSITIVITY (+25)
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("upload")}
                      className="px-3 py-1.5 bg-zinc-800 text-zinc-200 border border-zinc-700 text-[11px] uppercase rounded cursor-pointer"
                    >
                      RETRY UPLOAD
                    </button>
                  </div>
                </div>
              ) : showBefore && previewBeforeDataUrl ? (
                <img
                  src={previewBeforeDataUrl}
                  alt="Original cropped signature before background removal"
                  className="max-w-full max-h-[340px] object-contain shadow-md border border-zinc-400"
                />
              ) : (
                <canvas
                  ref={resultCanvasRef}
                  data-testid="sigx-result-canvas"
                  aria-label="Extracted transparent signature preview"
                  className="max-w-full max-h-[340px] w-auto h-auto object-contain"
                />
              )}
            </div>

            {processingError && (
              <div
                role="alert"
                className="bg-red-950/60 border border-red-500/60 p-3 rounded text-xs text-red-200"
              >
                {processingError}
              </div>
            )}

            {/* Secondary Export Utilities Bar (Download PNG, Copy to Clipboard, Export SVG) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  disabled={noSignatureDetected || isExportingFinal}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-700 rounded text-[11px] text-zinc-200 uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-zinc-300" />
                  DOWNLOAD PNG
                </button>
                <button
                  type="button"
                  onClick={handleCopyClipboard}
                  disabled={noSignatureDetected || isExportingFinal}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-700 rounded text-[11px] text-zinc-200 uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedClipboard ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span className="text-white">COPIED!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-300" />
                      <span>COPY TO CLIPBOARD</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSvg}
                  disabled={noSignatureDetected || isTracingSvg}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-700 rounded text-[11px] text-zinc-200 uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5 text-zinc-300" />
                  {isTracingSvg ? "TRACING SVG..." : "EXPORT SVG"}
                </button>
              </div>

              {previewImageData && (
                <span className="text-[10px] text-zinc-400 uppercase">
                  PREVIEW CROP: {previewImageData.width}×{previewImageData.height}PX
                </span>
              )}
            </div>
          </div>

          {/* RIGHT: SLIDERS, INK COLOR PICKER & PRIMARY ACTION */}
          <div className="lg:col-span-5 bg-black border border-zinc-800 p-4 space-y-4 rounded-lg">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
              <div className="flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-zinc-300" />
                <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-white">
                  EXTRACTION PARAMETERS
                </h3>
              </div>
              <button
                type="button"
                onClick={resetParams}
                aria-label="Reset extraction parameters to default"
                className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300 uppercase flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                RESET
              </button>
            </div>

            {/* 1. Sensitivity Slider (0 - 100) */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <label htmlFor="sigx-sensitivity-slider" className="text-zinc-300 font-bold uppercase">
                  INK SENSITIVITY
                </label>
                <span className="text-white font-bold">
                  {params.sensitivity}%
                </span>
              </div>
              <input
                id="sigx-sensitivity-slider"
                data-testid="sigx-sensitivity-slider"
                type="range"
                min={0}
                max={100}
                value={params.sensitivity}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    sensitivity: Number(e.target.value),
                  }))
                }
                aria-label="Ink Sensitivity"
                className="w-full accent-white cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                <span>STRICT (CLEAN PAPER)</span>
                <span>FAINT PEN STROKES</span>
              </div>
            </div>

            {/* 2. Stroke Thickness Slider (-2 to +2 px) */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <label htmlFor="sigx-thickness-slider" className="text-zinc-300 font-bold uppercase">
                  STROKE THICKNESS
                </label>
                <span className="text-white font-bold">
                  {params.thickness > 0
                    ? `+${params.thickness} PX`
                    : `${params.thickness} PX`}
                </span>
              </div>
              <input
                id="sigx-thickness-slider"
                data-testid="sigx-thickness-slider"
                type="range"
                min={-2}
                max={2}
                step={1}
                value={params.thickness}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    thickness: Number(e.target.value),
                  }))
                }
                aria-label="Stroke Thickness"
                className="w-full accent-white cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                <span>-2 PX (FINE ERODE)</span>
                <span>0 PX</span>
                <span>+2 PX (BOLD DILATE)</span>
              </div>
            </div>

            {/* 3. Noise Removal Slider (Connected-Component Minimum Area) */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <label htmlFor="sigx-noise-slider" className="text-zinc-300 font-bold uppercase">
                  NOISE &amp; SPECK REMOVAL
                </label>
                <span className="text-white font-bold">
                  {noiseSliderVal}
                </span>
              </div>
              <input
                id="sigx-noise-slider"
                data-testid="sigx-noise-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={noiseSliderVal}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    minComponentAreaRatio: Number(e.target.value) / 100000,
                  }))
                }
                aria-label="Noise and speck removal threshold"
                className="w-full accent-white cursor-pointer"
              />
            </div>

            {/* 4. Threshold Method & Morphological Close */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setParams((p) => ({
                    ...p,
                    thresholdMethod:
                      p.thresholdMethod === "otsu" ? "adaptive" : "otsu",
                  }))
                }
                className={`p-2 border rounded text-[10px] uppercase font-bold text-left cursor-pointer ${
                  params.thresholdMethod === "adaptive"
                    ? "bg-white border-white text-black"
                    : "bg-zinc-950 border-zinc-800 text-zinc-300"
                }`}
              >
                MODE:{" "}
                {params.thresholdMethod === "otsu"
                  ? "OTSU GLOBAL"
                  : "ADAPTIVE LOCAL"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setParams((p) => ({ ...p, morphClose: !p.morphClose }))
                }
                className={`p-2 border rounded text-[10px] uppercase font-bold text-left cursor-pointer ${
                  params.morphClose
                    ? "bg-white border-white text-black"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400"
                }`}
              >
                HEAL STROKES: {params.morphClose ? "ON" : "OFF"}
              </button>
            </div>

            {/* 5. Ink Color Picker */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <span className="block text-[11px] font-bold uppercase text-zinc-300">
                SIGNATURE INK COLOR
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {INK_PRESETS.map((preset) => {
                  const active =
                    params.inkColor.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setParams((p) => ({ ...p, inkColor: preset.hex }))
                      }
                      className={`p-2 border rounded flex items-center gap-2 text-left cursor-pointer ${
                        active
                          ? "bg-white border-white text-black font-bold"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-sm border border-zinc-600 shrink-0"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span className="text-[10px] uppercase truncate">
                        {preset.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-1">
                <label
                  htmlFor="sigx-custom-ink-color"
                  className="text-[10px] text-zinc-400 uppercase"
                >
                  CUSTOM INK HEX:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="sigx-custom-ink-color"
                    type="color"
                    value={params.inkColor}
                    onChange={(e) =>
                      setParams((p) => ({ ...p, inkColor: e.target.value }))
                    }
                    aria-label="Custom ink color picker"
                    className="w-6 h-6 bg-transparent border border-zinc-700 cursor-pointer"
                  />
                  <span className="text-[10px] text-zinc-300 uppercase">
                    {params.inkColor}
                  </span>
                </div>
              </div>
            </div>

            {/* PRIMARY ACTION: USE SIGNATURE */}
            <button
              type="button"
              data-testid="sigx-use-signature-btn"
              disabled={noSignatureDetected || isExportingFinal}
              onClick={handleCompleteSignature}
              className="w-full py-3 bg-white hover:bg-zinc-200 disabled:opacity-50 text-black font-sans font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 rounded shadow-[3px_3px_0px_0px_#ffffff] cursor-pointer focus:outline-none focus:ring-2 focus:ring-white"
            >
              <Sparkles className="w-4 h-4" />
              {isExportingFinal
                ? "RENDERING FULL-RES PNG..."
                : "USE SIGNATURE (TRANSPARENT PNG)"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default SignatureExtractor;
