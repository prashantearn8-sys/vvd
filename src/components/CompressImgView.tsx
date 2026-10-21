/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Image as ImageIcon, FolderOpen, Zap, Sparkles, UploadCloud } from "lucide-react";
import { ImageFormat } from "../types";
import { formatBytes, compressToTargetSizeKB, processImageClientSide, processImageLossless, normalizeSupportedEncodeFormat, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { createTrackedObjectURL, revokeTrackedObjectURL } from "../utils/urlTracker";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";

interface CompressImgViewProps {
  onSuccess: () => void;
  showToast?: (msg: string) => void;
  initialFile?: File | null;
}

function getDefaultTargetKB(fileSizeBytes: number): number {
  const fileKB = fileSizeBytes / 1024;
  if (fileKB < 200) {
    return Math.max(1, Math.round(fileKB * 0.3));
  }
  return 200;
}

export default function CompressImgView({ onSuccess, initialFile }: CompressImgViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [compressLevel, setCompressLevel] = useState<"lossless" | "light" | "balanced" | "maximum">("balanced");
  const [targetKB, setTargetKB] = useState<number>(200);
  const [useNumerical, setUseNumerical] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string>("");

  const validateAndSetupFile = useCallback((selectedFile: File) => {
    const isImageMime = selectedFile.type.startsWith("image/");
    const validExts = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".avif", ".svg"];
    const hasValidExt = validExts.some((ext) => selectedFile.name.toLowerCase().endsWith(ext));

    if (!isImageMime && !hasValidExt) {
      showToast(`Invalid file type: ${selectedFile.name}. Please select a valid image file.`, "error");
      return;
    }

    if (previewUrlRef.current) {
      revokeTrackedObjectURL(previewUrlRef.current);
    }

    setFile(selectedFile);
    const url = createTrackedObjectURL(selectedFile);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setTargetKB(getDefaultTargetKB(selectedFile.size));
  }, [showToast]);

  // Handle initialFile prop from global drop router
  useEffect(() => {
    if (initialFile) {
      validateAndSetupFile(initialFile);
    }
  }, [initialFile, validateAndSetupFile]);

  // Register global drop handler while view is active
  useEffect(() => {
    return registerDropHandler((files) => {
      const first = files[0];
      if (first) {
        validateAndSetupFile(first);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, validateAndSetupFile]);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        revokeTrackedObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
    };
  }, []);

  const handleReset = () => {
    if (previewUrlRef.current) {
      revokeTrackedObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
    setFile(null);
    setPreviewUrl("");
    setTargetKB(200);
    setIsProcessing(false);
  };

  const handleCompress = async () => {
    if (!file) return;
    setIsProcessing(true);

    try {
      await yieldFrame();

      const targetFmt: ImageFormat = normalizeSupportedEncodeFormat(file.type);
      let res;

      if (useNumerical) {
        res = await compressToTargetSizeKB(file, targetKB, targetFmt);
      } else if (compressLevel === "lossless") {
        // Lossless: strips metadata, preserves 100% resolution & visual bit integrity
        res = await processImageLossless(file, targetFmt);
      } else {
        // Quality mapping:
        // "light": LESS compression, HIGHEST quality, larger file
        // "balanced": MODERATE compression
        // "maximum": MOST compression, LOWEST quality, smallest file
        const qualityMap = { light: 0.90, balanced: 0.70, maximum: 0.45 };
        const scaleMap = { light: 1.0, balanced: 0.85, maximum: 0.55 };

        const q = qualityMap[compressLevel];
        const s = scaleMap[compressLevel];
        res = await processImageClientSide(file, q, s, targetFmt, 0);
      }

      if (res && res.blob) {
        const blob = res.blob;
        const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));
        const defaultFilename = `${cleanName}_monotranscoder`;

        await saveFile("compress_img", {
          blob,
          filename: defaultFilename,
          size: blob.size,
          format: res.format,
          originalName: sanitizeFilename(file.name),
          originalSize: file.size,
        });

        showToast("Image compression completed successfully.", "success");
        onSuccess();
      }
    } catch (err: any) {
      logger.error("Image compression error:", err);
      showToast(`Image compression failed: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const maxKB = file ? Math.max(1, Math.round(file.size / 1024)) : 1000;
  const minKB = maxKB < 20 ? 1 : 5;

  return (
    <section className="space-y-6 animate-fade-in" id="compress-img-view" aria-labelledby="compress-img-heading">
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 id="compress-img-heading" className="text-xl font-bold uppercase tracking-tight text-white font-sans">
            COMPRESS IMAGE // COMPRESS_IMG.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Optimizes image binary grids down to custom quality boundaries completely inside your client sandbox.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="compress-img-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload image to compress. Drag and drop or press enter to browse."
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              validateAndSetupFile(e.dataTransfer.files[0]);
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
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) validateAndSetupFile(f);
            }}
            accept="image/*,.jpg,.jpeg,.png,.webp,.bmp"
            className="hidden"
            aria-label="Select Image File"
          />
          <div className="mx-auto w-12 h-12 border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center text-white mb-4 rounded">
            <ImageIcon className="w-6 h-6" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG & DROP, BROWSE, OR PASTE (CTRL+V) YOUR IMAGE
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Supports JPEG, PNG, WEBP, and BMP. Paste screenshots directly from your clipboard.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
            aria-label="Select Image"
          >
            SELECT_IMAGE
          </button>
        </div>
      ) : isProcessing ? (
        <ToolSkeletonLoader
          variant="compress_img"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo={useNumerical ? `${targetKB} KB TARGET` : `${compressLevel.toUpperCase()} PRESET`}
          statusMessage="QUANTIZING_IMAGE_BITSTREAM..."
        />
      ) : (
        <div className="max-w-3xl mx-auto space-y-6">
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
                if (e.dataTransfer.files?.[0]) {
                  validateAndSetupFile(e.dataTransfer.files[0]);
                }
              }}
              className={`border-2 rounded-xl overflow-hidden bg-zinc-950 flex flex-col transition-all ${
                isDragOver ? "border-white ring-2 ring-white/50" : "border-zinc-800"
              }`}
            >
              <div className="bg-zinc-900 border-b-2 border-zinc-800 px-4 py-2.5 flex items-center justify-between text-xs font-mono font-bold text-white">
                <span>👁️ SOURCE_FILE_PREVIEW.DAT</span>
                <span className="text-[9px] text-zinc-400 font-normal uppercase">
                  {isDragOver ? "● DROP TO REPLACE" : "● QUEUED"}
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
                  <span>Drag & drop another image anywhere to replace</span>
                </div>
              </div>
            </div>
          )}

          {/* Controls & Parameters */}
          <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                <FolderOpen className="w-4 h-4" /> PARAMETERS.CFG
              </h3>
              <button
                type="button"
                onClick={handleReset}
                className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                aria-label="Change current file"
              >
                [CHANGE_FILE]
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* File Info */}
              <div className="bg-black border-2 border-zinc-800 p-4 rounded-lg space-y-2 text-xs font-mono flex flex-col justify-center">
                <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-400">FILE_NAME:</span>
                  <strong className="truncate max-w-[150px] text-emerald-400 font-bold" title={file.name}>
                    {file.name}
                  </strong>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-400">FILE_SIZE:</span>
                  <strong className="text-amber-400 font-bold">{formatBytes(file.size)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">FORMAT:</span>
                  <strong className="text-violet-400 font-bold uppercase">{file.type.split("/")[1] || "image"}</strong>
                </div>
              </div>

              {/* Slider & Actions */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                  <button
                    type="button"
                    onClick={() => setUseNumerical(true)}
                    className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded transition-colors ${
                      useNumerical ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    TARGET KB
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseNumerical(false)}
                    className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded transition-colors ${
                      !useNumerical ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    PRESET LEVEL
                  </button>
                </div>

                {useNumerical ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold font-mono text-zinc-400 uppercase">
                        TARGET WEIGHT:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="1"
                          max={maxKB}
                          value={targetKB || ""}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (e.target.value === "") {
                              setTargetKB(0);
                            } else if (!isNaN(val)) {
                              setTargetKB(Math.min(maxKB, Math.max(1, val)));
                            }
                          }}
                          onBlur={() => {
                            if (!targetKB || targetKB < 1) {
                              setTargetKB(file ? getDefaultTargetKB(file.size) : 200);
                            }
                          }}
                          className="w-20 px-2 py-0.5 text-right font-mono font-bold border-2 border-zinc-700 bg-black text-white text-xs outline-none focus:border-white rounded"
                          aria-label="Target image weight in kilobytes"
                        />
                        <span className="text-xs font-mono font-bold text-zinc-400">KB</span>
                      </div>
                    </div>

                    <input
                      type="range"
                      min={minKB}
                      max={maxKB}
                      step={maxKB < 50 ? "1" : "5"}
                      value={Math.min(maxKB, Math.max(minKB, targetKB || minKB))}
                      onChange={(e) => setTargetKB(parseInt(e.target.value))}
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
                      {(["lossless", "light", "balanced", "maximum"] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setCompressLevel(lvl)}
                          className={`py-2 text-[9px] font-mono font-bold uppercase rounded border transition-all ${
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
                      {compressLevel === "lossless" && "Lossless: Strips EXIF/metadata, 100% pixel fidelity."}
                      {compressLevel === "light" && "Light: High quality (0.90), minor compression."}
                      {compressLevel === "balanced" && "Balanced: Moderate compression (0.70)."}
                      {compressLevel === "maximum" && "Maximum: Highest compression (0.45), smallest size."}
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
                      <span role="status" aria-live="polite">COMPRESSING...</span>
                    </>
                  ) : (
                    <>
                      {compressLevel === "lossless" && !useNumerical ? (
                        <Sparkles className="w-4 h-4" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                      <span>COMPRESS FILE NOW</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
