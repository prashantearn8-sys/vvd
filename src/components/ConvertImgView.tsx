/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { RefreshCw, FolderOpen, UploadCloud } from "lucide-react";
import { ImageFormat } from "../types";
import { formatBytes, processImageClientSide, getSupportedOutputFormats, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { createTrackedObjectURL, revokeTrackedObjectURL } from "../utils/urlTracker";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";
import ModuleIconBadge from "./ModuleIconBadge";

interface ConvertImgViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
}

export default function ConvertImgView({ onSuccess, initialFile }: ConvertImgViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [targetFmt, setTargetFmt] = useState<"JPG" | "JPEG" | "PNG" | "WEBP" | "AVIF">("PNG");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [supportedFormats] = useState<("JPG" | "PNG" | "WEBP" | "JPEG" | "AVIF")[]>(() =>
    getSupportedOutputFormats()
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string>("");

  const getSourceFormat = useCallback((f: File | null): string => {
    if (!f) return "";
    const ext = f.name.split(".").pop()?.toUpperCase() || "";
    if (ext === "JPG" || ext === "JPEG" || f.type === "image/jpeg") return "JPG";
    if (ext === "PNG" || f.type === "image/png") return "PNG";
    if (ext === "WEBP" || f.type === "image/webp") return "WEBP";
    if (ext === "AVIF" || f.type === "image/avif") return "AVIF";
    return ext;
  }, []);

  const validateAndSetupFile = useCallback((selectedFile: File) => {
    const isImageMime = selectedFile.type.startsWith("image/");
    const validExts = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".avif"];
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

    // Auto select first target format that differs from source format
    const sourceFmt = getSourceFormat(selectedFile);
    const available = supportedFormats.filter((fmt) => {
      if (sourceFmt === "JPG" || sourceFmt === "JPEG") {
        return fmt !== "JPG" && fmt !== "JPEG";
      }
      return fmt !== sourceFmt;
    });

    if (available.length > 0) {
      setTargetFmt(available[0]);
    }
  }, [showToast, getSourceFormat, supportedFormats]);

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
    setIsProcessing(false);
  };

  const handleConvert = async () => {
    if (!file) return;
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

      // processImageClientSide handles #FFFFFF background for JPG/JPEG
      const res = await processImageClientSide(file, 0.90, 1.0, mimeType, 0);

      if (res && res.blob) {
        const blob = res.blob;
        const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));
        const defaultFilename = `${cleanName}_monotranscoder`;

        await saveFile("convert_img", {
          blob,
          filename: defaultFilename,
          size: blob.size,
          format: mimeType,
          originalName: sanitizeFilename(file.name),
          originalSize: file.size,
        });

        showToast("Image transcoded successfully.", "success");
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
    <section className="space-y-6 animate-fade-in" id="convert-img-view" aria-labelledby="convert-img-heading">
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 id="convert-img-heading" className="text-xl font-bold uppercase tracking-tight text-white font-sans">
            CONVERT IMAGE FORMAT // CONVERT_IMG.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Transcode images between PNG, JPG, JPEG, WebP, and AVIF in 100% offline memory.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="convert-img-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload image to convert format. Drag and drop or press enter to browse."
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
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
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
            aria-label="Select Image File to Convert"
          />
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="convert_img" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG & DROP, BROWSE, OR PASTE (CTRL+V) AN IMAGE
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Transcode effortlessly to PNG, JPG, WEBP, or AVIF format. Paste screenshots directly.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
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
        </div>
      ) : isProcessing ? (
        <ToolSkeletonLoader
          variant="convert_img"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo={`FORMAT: ${targetFmt}`}
          statusMessage={`TRANSCODING_TO_${targetFmt}...`}
        />
      ) : (
        <div className="max-w-3xl mx-auto space-y-6">
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
                  {isDragOver ? "● DROP TO REPLACE" : "● READY"}
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
                [CHANGE_FILE]
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <span className="text-zinc-400">SOURCE_FORMAT:</span>
                  <strong className="text-violet-400 font-bold uppercase">{file.type.split("/")[1] || "image"}</strong>
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
                          className={`py-2 text-xs font-mono font-bold uppercase rounded border transition-all ${
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
                      <span role="status" aria-live="polite">CONVERTING...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>CONVERT FILE NOW</span>
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
