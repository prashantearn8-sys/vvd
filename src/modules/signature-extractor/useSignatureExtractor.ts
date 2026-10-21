/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * React hook managing the Web Worker pipeline, job cancellation, ~150ms slider debouncing,
 * ~800px preview downscaling, and full-resolution (~2500px max long side) final extraction.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  DEFAULT_PROCESSING_PARAMS,
  NormalizedCropRect,
  ProcessingParams,
  WorkerProcessResponse,
} from "./types";
import {
  createImageDataSafe,
  processSignatureBuffer,
} from "./signatureProcessor";

export const MAX_FULL_RES_DIMENSION = 2500;
export const MAX_PREVIEW_DIMENSION = 800;

interface RgbaRaster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Extracts a cropped and downscaled RGBA buffer from an ImageBitmap or HTMLCanvasElement.
 */
export function rasterizeCroppedRegion(
  source: ImageBitmap | HTMLCanvasElement,
  crop: NormalizedCropRect,
  maxLongSide: number
): RgbaRaster {
  const srcW = source.width;
  const srcH = source.height;

  const sx = Math.max(0, Math.min(srcW - 1, Math.round(crop.x * srcW)));
  const sy = Math.max(0, Math.min(srcH - 1, Math.round(crop.y * srcH)));
  const sw = Math.max(1, Math.min(srcW - sx, Math.round(crop.width * srcW)));
  const sh = Math.max(1, Math.min(srcH - sy, Math.round(crop.height * srcH)));

  const longSide = Math.max(sw, sh);
  const scale = longSide > maxLongSide ? maxLongSide / longSide : 1;
  const dstW = Math.max(1, Math.round(sw * scale));
  const dstH = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  }
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dstW, dstH);
  const imgData = ctx.getImageData(0, 0, dstW, dstH);

  return {
    data: imgData.data,
    width: dstW,
    height: dstH,
  };
}

export function useSignatureExtractor(initialParams?: Partial<ProcessingParams>) {
  const [params, setParams] = useState<ProcessingParams>(() => ({
    ...DEFAULT_PROCESSING_PARAMS,
    ...initialParams,
  }));

  const [isProcessingPreview, setIsProcessingPreview] = useState<boolean>(false);
  const [isExportingFinal, setIsExportingFinal] = useState<boolean>(false);
  const [previewImageData, setPreviewImageData] = useState<ImageData | null>(null);
  const [previewBeforeDataUrl, setPreviewBeforeDataUrl] = useState<string | null>(null);
  const [noSignatureDetected, setNoSignatureDetected] = useState<boolean>(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const latestJobIdRef = useRef<number>(0);
  const pendingResolversRef = useRef<
    Map<
      number,
      {
        resolve: (res: WorkerProcessResponse) => void;
        reject: (err: Error) => void;
      }
    >
  >(new Map());

  const previewRasterRef = useRef<RgbaRaster | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize Web Worker with graceful main-thread fallback for test environments (jsdom)
  useEffect(() => {
    if (typeof Worker !== "undefined") {
      try {
        const worker = new Worker(
          new URL("./signature.worker.ts", import.meta.url),
          { type: "module" }
        );
        worker.onmessage = (e: MessageEvent<WorkerProcessResponse>) => {
          const msg = e.data;
          const handler = pendingResolversRef.current.get(msg.jobId);
          if (handler) {
            pendingResolversRef.current.delete(msg.jobId);
            handler.resolve(msg);
          }
        };
        worker.onerror = () => {
          // Fallback to synchronous buffer processing if worker fails in restricted CSP
          workerRef.current = null;
        };
        workerRef.current = worker;
      } catch {
        workerRef.current = null;
      }
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      pendingResolversRef.current.clear();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  /**
   * Dispatches a raster buffer to the Web Worker using Transferable ArrayBuffers
   * (or runs directly if Worker is unavailable in test environment).
   */
  const runJob = useCallback(
    async (
      raster: RgbaRaster,
      jobParams: ProcessingParams,
      jobId: number
    ): Promise<WorkerProcessResponse> => {
      const worker = workerRef.current;
      if (worker) {
        // Clone buffer so we can keep previewRasterRef intact for subsequent slider adjustments
        const copyBuffer = raster.data.buffer.slice(
          raster.data.byteOffset,
          raster.data.byteOffset + raster.data.byteLength
        );
        return new Promise<WorkerProcessResponse>((resolve, reject) => {
          pendingResolversRef.current.set(jobId, { resolve, reject });
          worker.postMessage(
            {
              jobId,
              buffer: copyBuffer,
              width: raster.width,
              height: raster.height,
              params: jobParams,
            },
            [copyBuffer]
          );
        });
      }

      // Fallback execution when running in non-Worker environment (e.g. Vitest/JSDOM)
      const res = processSignatureBuffer(
        raster.data,
        raster.width,
        raster.height,
        jobParams
      );
      return {
        jobId,
        buffer: res.data.buffer.slice(
          res.data.byteOffset,
          res.data.byteOffset + res.data.byteLength
        ),
        width: res.width,
        height: res.height,
        empty: res.empty,
      };
    },
    []
  );

  /**
   * Loads the cropped preview copy (~800px long side) and triggers initial extraction.
   */
  const preparePreviewSource = useCallback(
    (source: ImageBitmap | HTMLCanvasElement, crop: NormalizedCropRect) => {
      try {
        const raster = rasterizeCroppedRegion(source, crop, MAX_PREVIEW_DIMENSION);
        previewRasterRef.current = raster;

        // Also generate a "Before" preview DataURL of the cropped region
        const c = document.createElement("canvas");
        c.width = raster.width;
        c.height = raster.height;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.putImageData(
            createImageDataSafe(raster.data, raster.width, raster.height),
            0,
            0
          );
          setPreviewBeforeDataUrl(c.toDataURL("image/jpeg", 0.88));
        }
      } catch (err) {
        setProcessingError(
          err instanceof Error ? err.message : "Failed to prepare preview image."
        );
      }
    },
    []
  );

  /**
   * Debounced (~150ms) preview processing whenever `params` change.
   * Automatically cancels/ignores stale worker jobs via monotonically increasing `latestJobIdRef`.
   */
  useEffect(() => {
    const raster = previewRasterRef.current;
    if (!raster) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const nextJobId = ++latestJobIdRef.current;
    setIsProcessingPreview(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const response = await runJob(raster, params, nextJobId);
        // Ignore stale worker completions if a newer job was queued
        if (nextJobId !== latestJobIdRef.current) return;

        if (response.error) {
          setProcessingError(response.error);
          setIsProcessingPreview(false);
          return;
        }

        if (response.empty || response.width <= 1 || response.height <= 1) {
          setNoSignatureDetected(true);
          setPreviewImageData(null);
        } else {
          setNoSignatureDetected(false);
          setProcessingError(null);
          const clamped = new Uint8ClampedArray(response.buffer);
          setPreviewImageData(
            createImageDataSafe(clamped, response.width, response.height)
          );
        }
      } catch (err) {
        if (nextJobId === latestJobIdRef.current) {
          setProcessingError(
            err instanceof Error ? err.message : "Preview processing error"
          );
        }
      } finally {
        if (nextJobId === latestJobIdRef.current) {
          setIsProcessingPreview(false);
        }
      }
    }, 150);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [params, runJob]);

  /**
   * Triggers immediate preview execution (used right after crop step transitions to editor).
   */
  const runImmediatePreview = useCallback(
    async (overrideParams?: ProcessingParams) => {
      const raster = previewRasterRef.current;
      if (!raster) return;
      const activeParams = overrideParams || params;
      const nextJobId = ++latestJobIdRef.current;
      setIsProcessingPreview(true);

      try {
        const response = await runJob(raster, activeParams, nextJobId);
        if (nextJobId !== latestJobIdRef.current) return;

        if (response.empty || response.width <= 1 || response.height <= 1) {
          setNoSignatureDetected(true);
          setPreviewImageData(null);
        } else {
          setNoSignatureDetected(false);
          setProcessingError(null);
          const clamped = new Uint8ClampedArray(response.buffer);
          setPreviewImageData(
            createImageDataSafe(clamped, response.width, response.height)
          );
        }
      } finally {
        if (nextJobId === latestJobIdRef.current) {
          setIsProcessingPreview(false);
        }
      }
    },
    [params, runJob]
  );

  /**
   * Re-runs the pipeline on the full-resolution cropped image (up to 2500px on long side)
   * and encodes a lossless transparent PNG Blob + DataURL.
   */
  const processFullResolution = useCallback(
    async (
      source: ImageBitmap | HTMLCanvasElement,
      crop: NormalizedCropRect
    ): Promise<{
      blob: Blob;
      dataUrl: string;
      width: number;
      height: number;
      imageData: ImageData;
    }> => {
      setIsExportingFinal(true);
      try {
        const fullRaster = rasterizeCroppedRegion(
          source,
          crop,
          MAX_FULL_RES_DIMENSION
        );
        const jobId = ++latestJobIdRef.current;
        const response = await runJob(fullRaster, params, jobId);

        if (response.empty || response.width <= 1 || response.height <= 1) {
          throw new Error(
            "No signature strokes detected. Try increasing Sensitivity or using darker ink."
          );
        }

        const outClamped = new Uint8ClampedArray(response.buffer);
        const outImgData = createImageDataSafe(
          outClamped,
          response.width,
          response.height
        );

        const outCanvas = document.createElement("canvas");
        outCanvas.width = response.width;
        outCanvas.height = response.height;
        const ctx = outCanvas.getContext("2d");
        if (!ctx) {
          throw new Error("Failed to create export canvas context.");
        }
        ctx.putImageData(outImgData, 0, 0);

        const dataUrl = outCanvas.toDataURL("image/png");
        const blob = await new Promise<Blob>((resolve, reject) => {
          outCanvas.toBlob((b) => {
            if (b) {
              resolve(b);
            } else {
              // Fallback for environments where toBlob returns null
              try {
                const base64 = dataUrl.split(",")[1] || "";
                const bin = atob(base64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                resolve(new Blob([bytes], { type: "image/png" }));
              } catch (e) {
                reject(e);
              }
            }
          }, "image/png");
        });

        return {
          blob,
          dataUrl,
          width: response.width,
          height: response.height,
          imageData: outImgData,
        };
      } finally {
        setIsExportingFinal(false);
      }
    },
    [params, runJob]
  );

  const resetParams = useCallback(() => {
    setParams({
      ...DEFAULT_PROCESSING_PARAMS,
      ...initialParams,
    });
  }, [initialParams]);

  return {
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
  };
}
