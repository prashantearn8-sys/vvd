/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import JSZip from "jszip";
import {
  RefreshCw,
  FolderOpen,
  UploadCloud,
  Plus,
  Trash2,
} from "lucide-react";
import { ImageFormat } from "../types";
import {
  formatBytes,
  processImageClientSide,
  getSupportedOutputFormats,
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

interface ConvertImgViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
  initialFiles?: File[] | null;
}

export default function ConvertImgView({
  onSuccess,
  initialFile,
  initialFiles,
}: ConvertImgViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [targetFmt, setTargetFmt] = useState<
    "JPG" | "JPEG" | "PNG" | "WEBP" | "AVIF"
  >("PNG");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>("CONVERTING...");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [supportedFormats] = useState<
    ("JPG" | "PNG" | "WEBP" | "JPEG" | "AVIF")[]
  >(() => getSupportedOutputFormats());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string>("");

  const file = files[activeIndex] || null;

  const getSourceFormat = useCallback((f: File | null): string => {
    if (!f) return "";
    const ext = f.name.split(".").pop()?.toUpperCase() || "";
    if (ext === "JPG" || ext === "JPEG" || f.type === "image/jpeg")
      return "JPG";
    if (ext === "PNG" || f.type === "image/png") return "PNG";
    if (ext === "WEBP" || f.type === "image/webp") return "WEBP";
    if (ext === "AVIF" || f.type === "image/avif") return "AVIF";
    return ext;
  }, []);

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
          "Invalid file type. Please select valid image files.",
          "error"
        );
        return;
      }

      setFiles((prev) => {
        const next = [...prev, ...valid];
        if (prev.length === 0 && next.length > 0) {
          setActiveIndex(0);
          setPreviewForFile(next[0]);
          const sourceFmt = getSourceFormat(next[0]);
          const available = supportedFormats.filter((fmt) => {
            if (sourceFmt === "JPG" || sourceFmt === "JPEG") {
              return fmt !== "JPG" && fmt !== "JPEG";
            }
            return fmt !== sourceFmt;
          });
          if (available.length > 0) {
            setTargetFmt(available[0]);
          }
        }
        return next;
      });
    },
    [showToast, getSourceFormat, supportedFormats, setPreviewForFile]
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
    setIsProcessing(false);
  };

  const handleConvert = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);

    try {
      await yieldFrame();

      const formatMap: Record<string, ImageFormat> = {
        JPG: "image/jpeg",
        JPEG: "image/jpeg",
        PNG: "image/png",
        WEBP: "image/webp",
        AVIF: "image/avif",
      };
      const mimeType = formatMap[targetFmt] || "image/jpeg";
      const outExt = targetFmt.toLowerCase() === "jpeg" ? "jpg" : targetFmt.toLowerCase();

      if (files.length === 1) {
        const singleFile = files[0];
        const res = await processImageClientSide(
          singleFile,
          0.9,
          1.0,
          mimeType,
          0
        );
        if (res && res.blob) {
          const blob = res.blob;
          const cleanName = sanitizeFilename(
            singleFile.name.replace(/\.[^/.]+$/, "")
          );
          const defaultFilename = `${cleanName}_monotranscoder`;

          await saveFile("convert_img", {
            blob,
            filename: defaultFilename,
            size: blob.size,
            format: mimeType,
            originalName: sanitizeFilename(singleFile.name),
            originalSize: singleFile.size,
          });

          showToast("Image transcoded successfully.", "success");
          onSuccess();
        }
      } else {
        const zip = new JSZip();
        const bulkItems: BulkOutputItem[] = [];
        let totalOrigBytes = 0;

        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          totalOrigBytes += f.size;
          setProgressText(`CONVERTING ${i + 1} / ${files.length}...`);
          await yieldFrame();
          const res = await processImageClientSide(f, 0.9, 1.0, mimeType, 0);
          if (res && res.blob) {
            const cleanName = sanitizeFilename(f.name.replace(/\.[^/.]+$/, ""));
            const outFilename = `${cleanName}_converted.${outExt}`;
            zip.file(outFilename, res.blob);
            bulkItems.push({
              blob: res.blob,
              filename: outFilename,
              size: res.blob.size,
              format: mimeType,
              originalName: f.name,
              originalSize: f.size,
            });
          }
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        await saveFile("convert_img", {
          blob: zipBlob,
          filename: `converted_${bulkItems.length}_images_${outExt}.zip`,
          size: zipBlob.size,
          format: "application/zip",
          originalName: `${files.length} Images`,
          originalSize: totalOrigBytes,
          statusNote: `Bulk Converted ${bulkItems.length} Images to ${targetFmt} • Direct No-ZIP & ZIP Ready`,
          bulkItems,
        });

        showToast(
          `Converted ${bulkItems.length} images to ${targetFmt} successfully.`,
          "success"
        );
        onSuccess();
      }
    } catch (err: any) {
      logger.error("Image conversion error:", err);
      showToast(`Failed to transcode image: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="convert-img-view"
      aria-labelledby="convert-img-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="convert-img-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            CONVERT IMAGE FORMAT (SINGLE &amp; BULK) // CONVERT_IMG.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Transcode single or bulk images between PNG, JPG, JPEG, WebP, and AVIF in 100% offline memory—with direct download without ZIP.
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
        aria-label="Select Image Files to Convert"
      />

      {files.length === 0 ? (
        <div
          id="convert-img-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload images to convert format. Drag and drop or press enter to browse."
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
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            isDragOver
              ? "border-white bg-zinc-900"
              : "border-zinc-700 hover:border-white hover:bg-zinc-950"
          }`}
        >
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="convert_img" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG &amp; DROP SINGLE OR BULK IMAGES, BROWSE, OR PASTE (CTRL+V)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Batch transcode multiple images effortlessly to PNG, JPG, WEBP, or AVIF format—download individually without ZIP or as a ZIP archive.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
              aria-label="Select Images"
            >
              SELECT_IMAGES
            </button>
          </div>
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
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[11px] font-mono font-bold text-cyan-400 flex items-center gap-1 cursor-pointer"
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
                      ? "border-cyan-400 bg-cyan-500/10 text-white"
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
                  👁️ SOURCE_FILE_PREVIEW.DAT ({activeIndex + 1}/{files.length})
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

          {file && (
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4" /> CONVERT_SETTINGS.CFG
                </h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                  aria-label="Change current file"
                >
                  [CLEAR_QUEUE]
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-black border-2 border-zinc-800 p-4 rounded-lg space-y-2 text-xs font-mono flex flex-col justify-center">
                  <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                    <span className="text-zinc-400">ACTIVE_FILE:</span>
                    <strong
                      className="truncate max-w-[150px] text-emerald-400 font-bold"
                      title={file.name}
                    >
                      {file.name}
                    </strong>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                    <span className="text-zinc-400">ORIGINAL_SIZE:</span>
                    <strong className="text-amber-400 font-bold">
                      {formatBytes(file.size)}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">QUEUE_COUNT:</span>
                    <strong className="text-violet-400 font-bold uppercase">
                      {files.length} {files.length === 1 ? "IMAGE" : "IMAGES"}
                    </strong>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold font-mono text-zinc-400 uppercase block mb-2">
                      SELECT TARGET FORMAT:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {supportedFormats
                        .filter((fmt) => {
                          if (files.length > 1) return true;
                          const sourceFmt = getSourceFormat(file);
                          if (sourceFmt === "JPG" || sourceFmt === "JPEG") {
                            return fmt !== "JPG" && fmt !== "JPEG";
                          }
                          return fmt.toUpperCase() !== sourceFmt;
                        })
                        .map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setTargetFmt(fmt)}
                            className={`py-2 text-xs font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
                              targetFmt === fmt
                                ? "bg-white text-black border-white"
                                : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                            }`}
                            aria-label={`Convert to ${fmt}`}
                          >
                            {fmt}
                          </button>
                        ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={isProcessing}
                    aria-label="Convert Image Now"
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
                        <RefreshCw className="w-4 h-4" />
                        <span>
                          {files.length > 1
                            ? `BULK CONVERT ${files.length} IMAGES`
                            : "CONVERT FILE NOW"}
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
