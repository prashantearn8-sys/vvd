/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Image as ImageIcon, RotateCw, Trash2, ArrowUp, ArrowDown, Plus, Zap, UploadCloud, ClipboardPaste } from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import { formatBytes, loadImageFromFile, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { createTrackedObjectURL, revokeTrackedObjectURL } from "../utils/urlTracker";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";

interface ImageToPdfViewProps {
  onSuccess: () => void;
  initialFiles?: File[] | null;
}

interface ImageItem {
  file: File;
  url: string;
  rotation: number;
}

export default function ImageToPdfView({ onSuccess, initialFiles }: ImageToPdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler, pasteFromClipboard } = useFileDrop();
  const [items, setItems] = useState<ImageItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      items.forEach((it) => revokeTrackedObjectURL(it.url));
    };
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const validExts = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".avif"];
    const newItems: ImageItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const isImg = f.type.startsWith("image/") || validExts.some((ext) => f.name.toLowerCase().endsWith(ext));
      if (isImg) {
        const url = createTrackedObjectURL(f);
        newItems.push({ file: f, url, rotation: 0 });
      } else {
        showToast(`Skipping unsupported file: ${f.name}`, "error");
      }
    }

    if (newItems.length > 0) {
      setItems((prev) => [...prev, ...newItems]);
      showToast(`Added ${newItems.length} image(s) to PDF queue.`, "success");
    }
  }, [showToast]);

  // Handle initialFiles prop from global drop router
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      addFiles(initialFiles);
    }
  }, [initialFiles, addFiles]);

  // Register global drop handler while view is active
  useEffect(() => {
    return registerDropHandler((files) => {
      if (files.length > 0) {
        addFiles(files);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, addFiles]);

  const handleRotate = (index: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, rotation: (item.rotation + 90) % 360 } : item))
    );
  };

  const handleRemove = (index: number) => {
    setItems((prev) => {
      const itemToRemove = prev[index];
      if (itemToRemove) {
        revokeTrackedObjectURL(itemToRemove.url);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    setItems((prev) => {
      const copy = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= copy.length) return prev;
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleReset = () => {
    items.forEach((it) => revokeTrackedObjectURL(it.url));
    setItems([]);
    setIsProcessing(false);
  };

  const handleCompilePdf = async () => {
    if (items.length === 0) return;
    setIsProcessing(true);

    try {
      await yieldFrame();

      const pdfDoc = await PDFDocument.create();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      try {
        for (let idx = 0; idx < items.length; idx++) {
          const { file, rotation } = items[idx];
          const lowerName = file.name.toLowerCase();
          const isJpeg = file.type === "image/jpeg" || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg");
          const isPng = file.type === "image/png" || lowerName.endsWith(".png");

          // Zero-canvas fast path: directly embed raw JPEG or PNG bytes (including 90/180/270 rotation)
          if (isJpeg || isPng) {
            try {
              const rawBytes = await file.arrayBuffer();
              const embeddedImage = isJpeg
                ? await pdfDoc.embedJpg(rawBytes)
                : await pdfDoc.embedPng(rawBytes);
              const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
              page.drawImage(embeddedImage, {
                x: 0,
                y: 0,
                width: embeddedImage.width,
                height: embeddedImage.height,
              });
              if (rotation % 360 !== 0) {
                page.setRotation(degrees(rotation % 360));
              }
              continue;
            } catch {
              // Fallback to canvas path if image header is non-standard
            }
          }

          const { img, cleanup } = await loadImageFromFile(file);
          try {
            const is90or270 = Math.abs(rotation % 180) === 90;
            const canvasWidth = is90or270 ? img.height : img.width;
            const canvasHeight = is90or270 ? img.width : img.height;

            canvas.width = canvasWidth;
            canvas.height = canvasHeight;

            if (ctx) {
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
              ctx.translate(canvasWidth / 2, canvasHeight / 2);
              ctx.rotate((rotation * Math.PI) / 180);
              ctx.drawImage(img, -img.width / 2, -img.height / 2);
            }

            const jpgBlob: Blob = await new Promise((res, rej) =>
              canvas.toBlob((b) => (b ? res(b) : rej(new Error("Canvas export failed"))), "image/jpeg", 0.90)
            );
            const jpgBytes = await jpgBlob.arrayBuffer();
            const embeddedImage = await pdfDoc.embedJpg(jpgBytes);

            const page = pdfDoc.addPage([canvasWidth, canvasHeight]);
            page.drawImage(embeddedImage, {
              x: 0,
              y: 0,
              width: canvasWidth,
              height: canvasHeight,
            });
          } finally {
            cleanup();
          }
        }
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }

      const pdfBytes = await pdfDoc.save({ useObjectStreams: false, objectsPerTick: Infinity });
      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const firstCleanName = sanitizeFilename(items[0]?.file.name.replace(/\.[^/.]+$/, "") || "compiled_images");
      const defaultFilename = `${firstCleanName}_monotranscoder`;

      let totalOriginalSize = 0;
      items.forEach((it) => (totalOriginalSize += it.file.size));

      await saveFile("image_to_pdf", {
        blob: pdfBlob,
        filename: defaultFilename,
        size: pdfBlob.size,
        format: "application/pdf",
        originalName: `${items.length} images compiled`,
        originalSize: totalOriginalSize,
      });

      showToast(`Successfully converted ${items.length} image(s) to PDF.`, "success");
      onSuccess();
    } catch (err: any) {
      logger.error("Image to PDF compilation error:", err);
      showToast(`Compilation failed: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="space-y-6 animate-fade-in" id="image-to-pdf-view" aria-labelledby="image-to-pdf-heading">
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 id="image-to-pdf-heading" className="text-xl font-bold uppercase tracking-tight text-white font-sans">
            IMAGE TO PDF CONVERTER // IMAGE_TO_PDF.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Combine multiple JPG, PNG, WEBP, or BMP images into a single multi-page PDF document.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-mono font-bold text-zinc-400 hover:text-red-400 uppercase underline cursor-pointer"
            aria-label="Clear all images"
          >
            [CLEAR_ALL_IMAGES]
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div
          id="image-to-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload images to convert to PDF. Drag and drop or press enter to browse."
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.length) {
              addFiles(e.dataTransfer.files);
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
              if (e.target.files?.length) {
                addFiles(e.target.files);
              }
            }}
            accept="image/*,.jpg,.jpeg,.png,.webp,.bmp,.avif"
            multiple
            className="hidden"
            aria-label="Select images"
          />
          <div className="mx-auto w-12 h-12 border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center text-white mb-4 rounded">
            <ImageIcon className="w-6 h-6" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG & DROP, BROWSE, OR PASTE (CTRL+V) TARGET IMAGES
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Select or paste one or more images (JPG, PNG, WEBP, AVIF) to assemble into a single PDF document.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
              aria-label="Select images"
            >
              SELECT_IMAGES
            </button>
          </div>
        </div>
      ) : isProcessing ? (
        <ToolSkeletonLoader
          variant="image_to_pdf"
          fileCount={items.length}
          fileSize={formatBytes(items.reduce((acc, it) => acc + it.file.size, 0))}
          targetInfo={`${items.length} PAGES -> PDF`}
          statusMessage={`ASSEMBLING_${items.length}_PAGES_INTO_PDF...`}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs text-zinc-400 uppercase">
              QUEUED_IMAGES: <strong className="text-white font-bold">{items.length}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => pasteFromClipboard()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white font-mono text-xs uppercase rounded cursor-pointer transition-all"
                aria-label="Paste another image from clipboard"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-white" /> PASTE_[CTRL+V]
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white font-mono text-xs uppercase rounded cursor-pointer transition-all"
                aria-label="Add more images"
              >
                <Plus className="w-3.5 h-3.5" /> ADD_MORE_IMAGES
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.length) {
                  addFiles(e.target.files);
                }
              }}
              accept="image/*,.jpg,.jpeg,.png,.webp,.bmp,.avif"
              multiple
              className="hidden"
              aria-label="Add more images"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="bg-zinc-950 border-2 border-zinc-800 rounded-lg p-3 space-y-3 flex flex-col justify-between"
              >
                <div className="relative aspect-square bg-black border border-zinc-800 rounded overflow-hidden flex items-center justify-center">
                  <img
                    src={item.url}
                    alt={`Preview ${idx + 1}`}
                    style={{ transform: `rotate(${item.rotation}deg)` }}
                    className="max-h-full max-w-full object-contain transition-transform duration-200"
                  />
                  <div className="absolute top-1.5 left-1.5 bg-black/80 text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-zinc-700">
                    #{idx + 1}
                  </div>
                </div>

                <div className="space-y-1 text-left font-mono text-xs">
                  <div className="truncate text-white font-bold" title={item.file.name}>
                    {item.file.name}
                  </div>
                  <div className="text-zinc-400 text-[10px] flex justify-between">
                    <span className="text-zinc-300">{formatBytes(item.file.size)}</span>
                    <span className="text-zinc-400">ROT: {item.rotation}°</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1 pt-2 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => handleRotate(idx)}
                    title="Rotate 90° clockwise"
                    className="p-1.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white rounded flex items-center justify-center cursor-pointer transition-all"
                    aria-label={`Rotate image ${idx + 1}`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, "up")}
                    disabled={idx === 0}
                    title="Move up"
                    className="p-1.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white rounded flex items-center justify-center cursor-pointer transition-all disabled:opacity-30 disabled:pointer-events-none"
                    aria-label={`Move image ${idx + 1} up`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, "down")}
                    disabled={idx === items.length - 1}
                    title="Move down"
                    className="p-1.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white rounded flex items-center justify-center cursor-pointer transition-all disabled:opacity-30 disabled:pointer-events-none"
                    aria-label={`Move image ${idx + 1} down`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    title="Delete image"
                    className="p-1.5 bg-zinc-900 border border-zinc-700 hover:border-red-500 hover:text-red-400 text-white rounded flex items-center justify-center cursor-pointer transition-all"
                    aria-label={`Remove image ${idx + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Quick Add / Drop Box */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files?.length) {
                  addFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer min-h-[220px] transition-all ${
                isDragOver
                  ? "border-white bg-zinc-900 scale-102"
                  : "border-zinc-800 hover:border-zinc-600 bg-zinc-950/50 hover:bg-zinc-900/40"
              }`}
            >
              <div className="w-10 h-10 rounded border border-zinc-700 bg-zinc-900 flex items-center justify-center text-zinc-400 mb-2">
                <Plus className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono font-bold uppercase text-white">ADD / DROP IMAGES</span>
              <span className="text-[10px] font-mono text-zinc-400 mt-1">Drag files here or browse</span>
            </div>
          </div>

          <div className="max-w-md mx-auto pt-4">
            <button
              type="button"
              onClick={handleCompilePdf}
              disabled={isProcessing}
              aria-label="Compile PDF from images"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                  <span role="status" aria-live="polite">GENERATING PDF DOCUMENT...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>COMPILE {items.length} IMAGES TO PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
