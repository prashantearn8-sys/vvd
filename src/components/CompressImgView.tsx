/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import JSZip from "jszip";
import {
  FolderOpen,
  Zap,
  Sparkles,
  UploadCloud,
  Plus,
  Trash2,
} from "lucide-react";
import { ImageFormat } from "../types";
import {
  formatBytes,
  compressToTargetSizeKB,
  processImageClientSide,
  processImageLossless,
  normalizeSupportedEncodeFormat,
  yieldFrame,
} from "../utils/imageProcessor";
import { saveFile, BulkOutputItem } from "../utils/db";
import {
  createTrackedObjectURL,
  revokeTrackedObjectURL,
} from "../utils/urlTracker";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ModuleIconBadge from "./ModuleIconBadge";

interface CompressImgViewProps {
  onSuccess: () => void;
  showToast?: (msg: string) => void;
  initialFile?: File | null;
  initialFiles?: File[] | null;
  initialTargetKB?: number;
}

const PRESET_KB_CHIPS = [20, 50, 100, 200] as const;

function getDefaultTargetKB(fileSizeBytes: number, initialPreset?: number): number {
  if (initialPreset && initialPreset > 0) {
    return initialPreset;
  }
  const fileKB = fileSizeBytes / 1024;
  if (fileKB <= 60) {
    return 20;
  }
  if (fileKB <= 140) {
    return 50;
  }
  return 100;
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("avif")) return "avif";
  return "jpg";
}

export default function CompressImgView({
  onSuccess,
  initialFile,
  initialFiles,
  initialTargetKB,
}: CompressImgViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [compressLevel, setCompressLevel] = useState<
    "lossless" | "light" | "balanced" | "maximum"
  >("balanced");
  const [targetKB, setTargetKB] = useState<number>(initialTargetKB || 50);
  const [useNumerical, setUseNumerical] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>("COMPRESSING...");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string>("");

  const file = files[activeIndex] || null;

  useEffect(() => {
    if (initialTargetKB && initialTargetKB > 0) {
      setUseNumerical(true);
      setTargetKB(initialTargetKB);
    }
  }, [initialTargetKB]);

  const setPreviewForFile = useCallback((f: File) => {
    if (previewUrlRef.current) {
      revokeTrackedObjectURL(previewUrlRef.current);
    }
    const url = createTrackedObjectURL(f);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  const validateAndSetupFiles = useCallback(
    (incoming: File[]) => {
      const validExts = [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".bmp",
        ".gif",
        ".avif",
        ".svg",
      ];
      const valid = incoming.filter((f) => {
        const isImageMime = f.type.startsWith("image/");
        const hasValidExt = validExts.some((ext) =>
          f.name.toLowerCase().endsWith(ext)
        );
        return isImageMime || hasValidExt;
      });

      if (valid.length === 0) {
        showToast(
          "Invalid file type. Please select valid image files (JPG, PNG, WebP, AVIF, BMP).",
          "error"
        );
        return;
      }

      setFiles((prev) => {
        const next = [...prev, ...valid];
        if (prev.length === 0 && next.length > 0) {
          setActiveIndex(0);
          setPreviewForFile(next[0]);
          setTargetKB(getDefaultTargetKB(next[0].size, initialTargetKB));
        }
        return next;
      });
    },
    [showToast, initialTargetKB, setPreviewForFile]
  );

  useEffect(() => {
    if (initialFiles && initialFiles.length > 0 && files.length === 0) {
      validateAndSetupFiles(initialFiles);
    } else if (initialFile && files.length === 0) {
      validateAndSetupFiles([initialFile]);
    }
  }, [initialFile, initialFiles, files.length, validateAndSetupFiles]);

  useEffect(() => {
    return registerDropHandler((dropped) => {
      if (dropped.length > 0) {
        validateAndSetupFiles(dropped);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, validateAndSetupFiles]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        revokeTrackedObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
    };
  }, []);

  const selectQueueItem = (idx: number) => {
    if (idx < 0 || idx >= files.length) return;
    setActiveIndex(idx);
    setPreviewForFile(files[idx]);
  };

  const removeQueueItem = (idx: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) {
        if (previewUrlRef.current) {
          revokeTrackedObjectURL(previewUrlRef.current);
          previewUrlRef.current = "";
        }
        setPreviewUrl("");
        setActiveIndex(0);
      } else {
        const nextIdx = Math.min(activeIndex, next.length - 1);
        setActiveIndex(nextIdx);
        setPreviewForFile(next[nextIdx]);
      }
      return next;
    });
  };

  const handleReset = () => {
    if (previewUrlRef.current) {
      revokeTrackedObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
    setFiles([]);
    setActiveIndex(0);
    setPreviewUrl("");
    setTargetKB(initialTargetKB || 50);
    setIsProcessing(false);
  };

  const compressOneImage = async (targetFile: File) => {
    const targetFmt: ImageFormat = normalizeSupportedEncodeFormat(
      targetFile.type
    );
    if (useNumerical) {
      const effectiveMaxKB = Math.max(1, targetKB || 50);
      return await compressToTargetSizeKB(
        targetFile,
        effectiveMaxKB,
        targetFmt
      );
    }
    if (compressLevel === "lossless") {
      return await processImageLossless(targetFile, targetFmt);
    }
    const qualityMap = { light: 0.9, balanced: 0.7, maximum: 0.45 };
    const scaleMap = { light: 1.0, balanced: 0.85, maximum: 0.55 };
    return await processImageClientSide(
      targetFile,
      qualityMap[compressLevel],
      scaleMap[compressLevel],
      targetFmt,
      0
    );
  };

  const handleCompress = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);

    try {
      await yieldFrame();

      if (files.length === 1) {
        const singleFile = files[0];
        const res = await compressOneImage(singleFile);
        if (res && res.blob) {
          const blob = res.blob;
          const cleanName = sanitizeFilename(
            singleFile.name.replace(/\.[^/.]+$/, "")
          );
          const defaultFilename = `${cleanName}_monotranscoder`;

          await saveFile("compress_img", {
            blob,
            filename: defaultFilename,
            size: blob.size,
            format: res.format,
            originalName: sanitizeFilename(singleFile.name),
            originalSize: singleFile.size,
            targetKB: res.targetKB,
            minKB: res.minKB,
            hitTarget: res.hitTarget,
            statusNote: res.statusNote,
          });

          if (res.statusNote) {
            showToast(
              res.statusNote,
              res.hitTarget === false ? "info" : "success"
            );
          } else {
            showToast(
              `Compressed to ${(blob.size / 1024).toFixed(1)} KB successfully.`,
              "success"
            );
          }
          onSuccess();
        }
      } else {
        // Bulk Image Compression
        const zip = new JSZip();
        const bulkItems: BulkOutputItem[] = [];
        let totalOrigBytes = 0;

        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          totalOrigBytes += f.size;
          setProgressText(`COMPRESSING ${i + 1} / ${files.length}...`);
          await yieldFrame();
          const res = await compressOneImage(f);
          if (res && res.blob) {
            const cleanName = sanitizeFilename(f.name.replace(/\.[^/.]+$/, ""));
            const ext = extFromMime(res.format);
            const outFilename = `${cleanName}_compressed.${ext}`;
            zip.file(outFilename, res.blob);
            bulkItems.push({
              blob: res.blob,
              filename: outFilename,
              size: res.blob.size,
              format: res.format,
              originalName: f.name,
              originalSize: f.size,
            });
          }
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        await saveFile("compress_img", {
          blob: zipBlob,
          filename: `compressed_${bulkItems.length}_images.zip`,
          size: zipBlob.size,
          format: "application/zip",
          originalName: `${files.length} Images`,
          originalSize: totalOrigBytes,
          statusNote: `Bulk Compressed ${bulkItems.length} Images • Direct No-ZIP & ZIP Ready`,
          bulkItems,
        });

        showToast(
          `Compressed ${bulkItems.length} images successfully.`,
          "success"
        );
        onSuccess();
      }
    } catch (err: any) {
      logger.error("Image compression error:", err);
      showToast(`Image compression failed: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const maxKB = file ? Math.max(10, Math.round(file.size / 1024)) : 1000;
  const sliderMinKB = maxKB < 20 ? 1 : 5;

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="compress-img-view"
      aria-labelledby="compress-img-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="compress-img-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            Compress Image{initialTargetKB ? ` to ${initialTargetKB}KB` : ""} (Single &amp; Bulk)
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Binary-searches quality and dimensions in local browser memory to hit exact KB targets (20KB, 50KB, 100KB, 200KB)—supports bulk images with direct download without ZIP.
          </p>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            validateAndSetupFiles(Array.from(e.target.files));
          }
          e.target.value = "";
        }}
        accept="image/*,.jpg,.jpeg,.png,.webp,.bmp"
        multiple
        className="hidden"
        aria-label="Select Image Files"
      />

      {files.length === 0 ? (
        <div
          id="compress-img-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload images to compress. Drag and drop or press enter to browse."
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              validateAndSetupFiles(Array.from(e.dataTransfer.files));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 sm:p-12 text-center cursor-pointer transition-all ${
            isDragOver
              ? "border-white bg-zinc-900"
              : "border-zinc-700 hover:border-white hover:bg-zinc-950"
          }`}
        >
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="compress_img" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG &amp; DROP SINGLE OR BULK IMAGES, BROWSE, OR PASTE (CTRL+V)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Supports JPEG, PNG, WEBP, AVIF, and BMP. Bulk compress multiple images and download directly without ZIP or as a ZIP archive.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
            aria-label="Select Images"
          >
            SELECT IMAGES
          </button>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Bulk Image Queue Strip */}
          <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono font-bold uppercase text-zinc-300">
                IMAGE QUEUE ({files.length}{" "}
                {files.length === 1 ? "IMAGE" : "IMAGES"})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[11px] font-mono font-bold text-emerald-400 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>ADD IMAGES</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[11px] font-mono font-bold text-zinc-400 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>CLEAR ALL</span>
                </button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {files.map((f, idx) => (
                <div
                  key={`${f.name}-${idx}`}
                  onClick={() => selectQueueItem(idx)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer shrink-0 transition-all ${
                    idx === activeIndex
                      ? "border-emerald-400 bg-emerald-500/10 text-white"
                      : "border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <span className="text-xs font-mono truncate max-w-[150px]">
                    {f.name}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {formatBytes(f.size)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeQueueItem(idx);
                    }}
                    className="text-zinc-500 hover:text-red-400 ml-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Source preview */}
          {previewUrl && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  validateAndSetupFiles(Array.from(e.dataTransfer.files));
                }
              }}
              className={`border-2 rounded-xl overflow-hidden bg-zinc-950 flex flex-col transition-all ${
                isDragOver
                  ? "border-white ring-2 ring-white/50"
                  : "border-zinc-800"
              }`}
            >
              <div className="bg-zinc-900 border-b-2 border-zinc-800 px-4 py-2.5 flex items-center justify-between text-xs font-mono font-bold text-white">
                <span>
                  SOURCE IMAGE PREVIEW ({activeIndex + 1}/{files.length})
                </span>
                <span className="text-[9px] text-zinc-400 font-normal uppercase">
                  {isDragOver ? "● DROP TO ADD" : "● READY"}
                </span>
              </div>
              <div className="p-6 overflow-auto flex flex-col items-center justify-center bg-zinc-900 min-h-[250px] relative">
                <img
                  src={previewUrl}
                  alt="Preview Source"
                  className="max-w-full max-h-[300px] object-contain border border-zinc-700 p-1 bg-black shadow animate-fade-in"
                  referrerPolicy="no-referrer"
                />
                <div className="mt-3 text-[10px] font-mono text-zinc-400 flex items-center gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>
                    Drag &amp; drop more images anywhere to add to the bulk queue
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Controls & Parameters */}
          {file && (
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4" /> COMPRESSION SETTINGS
                </h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                  aria-label="Change current file"
                >
                  [CLEAR QUEUE]
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* File Info */}
                <div className="bg-black border-2 border-zinc-800 p-4 rounded-lg space-y-2 text-xs font-mono flex flex-col justify-center">
                  <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                    <span className="text-zinc-400">ACTIVE FILE:</span>
                    <strong
                      className="truncate max-w-[160px] text-emerald-400 font-bold"
                      title={file.name}
                    >
                      {file.name}
                    </strong>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                    <span className="text-zinc-400">ORIGINAL SIZE:</span>
                    <strong className="text-amber-400 font-bold">
                      {formatBytes(file.size)}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">QUEUE COUNT:</span>
                    <strong className="text-violet-400 font-bold uppercase">
                      {files.length} {files.length === 1 ? "IMAGE" : "IMAGES"}
                    </strong>
                  </div>
                </div>

                {/* Target KB / Preset Controls */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                    <button
                      type="button"
                      onClick={() => setUseNumerical(true)}
                      className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        useNumerical
                          ? "bg-white text-black"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      TARGET KB
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseNumerical(false)}
                      className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        !useNumerical
                          ? "bg-white text-black"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      PRESET LEVEL
                    </button>
                  </div>

                  {useNumerical ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-mono font-bold uppercase text-zinc-400 block">
                          QUICK PORTAL PRESETS:
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {PRESET_KB_CHIPS.map((chipKB) => {
                            const isSelected = targetKB === chipKB;
                            return (
                              <button
                                key={chipKB}
                                type="button"
                                onClick={() => setTargetKB(chipKB)}
                                className={`py-1.5 text-[11px] font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-white text-black border-white"
                                    : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                                }`}
                              >
                                {chipKB} KB
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold font-mono text-zinc-400 uppercase">
                          TARGET MAX SIZE:
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max={maxKB}
                            value={targetKB || ""}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (e.target.value === "") {
                                setTargetKB(0);
                              } else if (!isNaN(val)) {
                                setTargetKB(Math.max(1, val));
                              }
                            }}
                            onBlur={() => {
                              if (!targetKB || targetKB < 1) {
                                setTargetKB(50);
                              }
                            }}
                            className="w-20 px-2 py-0.5 text-right font-mono font-bold border-2 border-zinc-700 bg-black text-white text-xs outline-none focus:border-white rounded"
                            aria-label="Target image weight in kilobytes"
                          />
                          <span className="text-xs font-mono font-bold text-zinc-400">
                            KB
                          </span>
                        </div>
                      </div>

                      <input
                        type="range"
                        min={sliderMinKB}
                        max={maxKB}
                        step={maxKB < 50 ? "1" : "5"}
                        value={Math.min(
                          maxKB,
                          Math.max(sliderMinKB, targetKB || sliderMinKB)
                        )}
                        onChange={(e) =>
                          setTargetKB(parseInt(e.target.value, 10))
                        }
                        className="w-full accent-white h-1 bg-zinc-800 cursor-pointer"
                        aria-label="Adjust target image file size"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-xs font-bold font-mono text-zinc-400 uppercase block">
                        COMPRESSION STRENGTH:
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(
                          ["lossless", "light", "balanced", "maximum"] as const
                        ).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setCompressLevel(lvl)}
                            className={`py-2 text-[9px] font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
                              compressLevel === lvl
                                ? "bg-white text-black border-white"
                                : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-zinc-400 font-mono">
                        {compressLevel === "lossless" &&
                          "Lossless: Strips EXIF/metadata, 100% pixel fidelity."}
                        {compressLevel === "light" &&
                          "Light: High quality (0.90), minor compression."}
                        {compressLevel === "balanced" &&
                          "Balanced: Moderate compression (0.70)."}
                        {compressLevel === "maximum" &&
                          "Maximum: Highest compression (0.45), smallest size."}
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleCompress}
                    disabled={isProcessing}
                    aria-label="Compress Image Now"
                    className="w-full py-3 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                        <span role="status" aria-live="polite">
                          {progressText}
                        </span>
                      </>
                    ) : (
                      <>
                        {compressLevel === "lossless" && !useNumerical ? (
                          <Sparkles className="w-4 h-4" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )}
                        <span>
                          {files.length > 1
                            ? `BULK COMPRESS ${files.length} IMAGES`
                            : "COMPRESS IMAGE NOW"}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
