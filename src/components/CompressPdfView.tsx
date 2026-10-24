/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { FileText, FolderOpen, Zap, ShieldCheck, UploadCloud } from "lucide-react";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { compressPdfDocument } from "../utils/pdfProcessor";
import { createTrackedObjectURL, revokeTrackedObjectURL } from "../utils/urlTracker";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";
import ModuleIconBadge from "./ModuleIconBadge";

interface CompressPdfViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

function getDefaultTargetKB(fileSizeBytes: number): number {
  const fileKB = fileSizeBytes / 1024;
  if (fileKB < 200) {
    return Math.max(1, Math.round(fileKB * 0.3));
  }
  return 200;
}

export default function CompressPdfView({ onSuccess, askPassword, initialFile }: CompressPdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const [file, setFile] = useState<File | null>(null);
  const [, setPreviewUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Target size and compression level controls (default Target KB is 200 KB)
  const [useNumerical, setUseNumerical] = useState<boolean>(true);
  const [targetKB, setTargetKB] = useState<number>(200);
  const [compressLevel, setCompressLevel] = useState<"light" | "balanced" | "maximum">("balanced");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string>("");
  const lastProgressUpdateRef = useRef<number>(0);

  const maxKB = file ? Math.max(1, Math.round(file.size / 1024)) : 1000;
  const minKB = maxKB < 20 ? 1 : 10;

  const validateAndSetupFile = useCallback((selectedFile: File) => {
    const isPdfMime = selectedFile.type === "application/pdf";
    const hasPdfExt = selectedFile.name.toLowerCase().endsWith(".pdf");

    if (!isPdfMime && !hasPdfExt) {
      showToast(`Invalid file type: ${selectedFile.name}. Please select a valid PDF document (.pdf).`, "error");
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
    setProgressMsg("");
  };

  const handleCompress = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgressMsg("INITIALIZING_OPTIMIZATION_PIPELINE...");
    lastProgressUpdateRef.current = 0;

    try {
      await yieldFrame();

      // Stream & object pruning options are automatically applied in the background
      const result = await compressPdfDocument(file, {
        level: compressLevel,
        targetKB: useNumerical ? targetKB : undefined,
        allowDownsample: true,
        stripJavaScript: true,
        stripThumbnails: true,
        stripEmbeddedFiles: true,
        stripMetadata: true,
        stripAnnotations: false,
        stripStructuralTags: compressLevel === "maximum",
        onProgress: (prog, msg) => {
          const now = performance.now();
          if (prog === 100 || now - lastProgressUpdateRef.current >= 150) {
            lastProgressUpdateRef.current = now;
            setProgressMsg(msg);
          }
        },
        askPassword,
      });

      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));
      const defaultFilename = `${cleanName}_monotranscoder`;

      await saveFile("compress_pdf", {
        blob: result.blob,
        filename: defaultFilename,
        size: result.size,
        format: "application/pdf",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast("PDF document optimized successfully.", "success");
      onSuccess();
    } catch (err: any) {
      logger.error("PDF compression error:", err);
      showToast(`PDF compression failed: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section className="space-y-6 animate-fade-in" id="compress-pdf-view" aria-labelledby="compress-pdf-heading">
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 id="compress-pdf-heading" className="text-xl font-bold uppercase tracking-tight text-white font-sans">
            COMPRESS PDF DOCUMENT // COMPRESS_PDF.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Deflate Level 9 stream recompression, automatic object pruning, and smart scan/image optimization.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="compress-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF document to compress. Drag and drop or press enter to browse."
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
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            isDragOver ? "border-white bg-zinc-900/60" : "border-zinc-800 hover:border-zinc-500 bg-zinc-950/40"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && validateAndSetupFile(e.target.files[0])}
          />
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="compress_pdf" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE YOUR TARGET PDF
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-md mx-auto mb-4 uppercase">
            Automatic stream deflation and object pruning. Preserves links, bookmarks &amp; page numbers.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
            aria-label="Select PDF File"
          >
            SELECT_PDF
          </button>
        </div>
      ) : isProcessing ? (
        <ToolSkeletonLoader
          variant="compress_pdf"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo={useNumerical ? `${targetKB} KB TARGET` : `${compressLevel.toUpperCase()} LEVEL`}
          statusMessage={progressMsg || "DEFLATING_PDF_OBJECT_STREAMS..."}
        />
      ) : (
        <div className="max-w-3xl mx-auto space-y-6">
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
            className={`bg-zinc-950 border-2 rounded-xl p-6 space-y-6 transition-all ${
              isDragOver ? "border-white ring-2 ring-white/50 bg-zinc-900" : "border-zinc-800"
            }`}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                <FolderOpen className="w-4 h-4" /> OPTIMIZATION_SETTINGS.CFG
              </h3>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400">
                  <UploadCloud className="w-3 h-3" /> Drop PDF to replace
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                  aria-label="Change PDF file"
                >
                  [CHANGE_FILE]
                </button>
              </div>
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
                  <span className="text-zinc-400">ORIGINAL_SIZE:</span>
                  <strong className="text-amber-400 font-bold">{formatBytes(file.size)}</strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">PIPELINE:</span>
                  <strong className="text-violet-400 font-bold uppercase">
                    AUTO HYBRID (STREAM + RASTER)
                  </strong>
                </div>
              </div>

              {/* Slider & Compression Controls */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                  <button
                    type="button"
                    onClick={() => setUseNumerical(true)}
                    className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      useNumerical ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    TARGET KB
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseNumerical(false)}
                    className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded transition-colors cursor-pointer ${
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
                          aria-label="Target PDF weight in kilobytes"
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
                      aria-label="Adjust target PDF file size"
                    />

                    <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                      <span>{minKB} KB (MAX COMPRESSION)</span>
                      <span>{maxKB} KB (ORIGINAL)</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-bold font-mono text-zinc-400 uppercase block">
                      COMPRESSION STRENGTH:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setCompressLevel("light")}
                        className={`py-2 px-2 border rounded font-mono text-[11px] font-bold uppercase transition-all cursor-pointer ${
                          compressLevel === "light"
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white"
                        }`}
                      >
                        LOW
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompressLevel("balanced")}
                        className={`py-2 px-2 border rounded font-mono text-[11px] font-bold uppercase transition-all cursor-pointer ${
                          compressLevel === "balanced"
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white"
                        }`}
                      >
                        BALANCED
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompressLevel("maximum")}
                        className={`py-2 px-2 border rounded font-mono text-[11px] font-bold uppercase transition-all cursor-pointer ${
                          compressLevel === "maximum"
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white"
                        }`}
                      >
                        EXTREME
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-zinc-500">
                      {compressLevel === "maximum"
                        ? "Aggressive stream deflate (Level 9) + high-ratio scan/image downsampling."
                        : compressLevel === "balanced"
                        ? "Balanced Deflate Level 9 + moderate image downsampling (150 DPI)."
                        : "Gentle Deflate Level 9 optimization preserving maximum visual fidelity."}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 bg-black p-2.5 rounded border border-zinc-800">
                <ShieldCheck className="w-4 h-4 text-white shrink-0" />
                <span>
                  Automatic Hybrid Optimization: Compares lossless stream deflation &amp; object pruning against resampled page bitmaps and keeps whichever output is smaller.
                </span>
              </div>

              <button
                type="button"
                onClick={handleCompress}
                disabled={isProcessing}
                aria-label="Optimize PDF Document Now"
                className="w-full py-3 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>OPTIMIZE PDF DOCUMENT NOW</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
