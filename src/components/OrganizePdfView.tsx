/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Layers,
  RotateCw,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Copy,
  Trash2,
  Zap,
  UploadCloud,
  FileText,
  GripVertical,
} from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { loadPdfJsLibrary } from "../utils/pdfProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";
import ModuleIconBadge from "./ModuleIconBadge";

interface OrganizePdfViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

interface OrganizedPageItem {
  id: string;
  originalPageNumber: number; // 1-based page number in source PDF
  rotation: number; // additional rotation in degrees (0, 90, 180, 270)
  dataUrl: string | null;
}

export default function OrganizePdfView({
  onSuccess,
  askPassword,
  initialFile,
}: OrganizePdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();

  const [file, setFile] = useState<File | null>(null);
  const [sourcePageCount, setSourcePageCount] = useState<number>(0);
  const [pageItems, setPageItems] = useState<OrganizedPageItem[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [unlockedPassword, setUnlockedPassword] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderJobIdRef = useRef<number>(0);
  const nextIdCounterRef = useRef<number>(1);

  const loadPdfForOrganizing = useCallback(
    async (selectedFile: File) => {
      const isPdf =
        selectedFile.type === "application/pdf" ||
        selectedFile.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        showToast(
          `Invalid file type: ${selectedFile.name}. Please select a valid PDF document (.pdf).`,
          "error"
        );
        return;
      }

      if (selectedFile.size > 500 * 1024 * 1024) {
        showToast("PDF file exceeds the 500MB safe in-browser limit.", "error");
        return;
      }

      const jobId = ++renderJobIdRef.current;
      setFile(selectedFile);
      setPageItems([]);
      setSourcePageCount(0);
      setUnlockedPassword(undefined);
      setIsLoadingPages(true);

      let pdfDocument: any = null;

      try {
        await yieldFrame();
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfjsLib = await loadPdfJsLibrary();

        let usedPassword: string | undefined = undefined;

        const loadWithPasswordAttempt = async (pwd?: string): Promise<any> => {
          const docParams: any = { data: new Uint8Array(arrayBuffer.slice(0)) };
          if (pwd) {
            docParams.password = pwd;
          }
          const loadingTask = pdfjsLib.getDocument(docParams);
          try {
            const doc = await loadingTask.promise;
            usedPassword = pwd;
            return doc;
          } catch (err: any) {
            const isPasswordRequired =
              err?.name === "PasswordException" ||
              err?.name === "IncorrectPasswordException" ||
              err?.message?.toLowerCase().includes("password");
            if (isPasswordRequired) {
              const entered = await askPassword(pwd ? "wrong" : "required");
              if (entered === null) {
                throw new Error("Password decryption cancelled by user.");
              }
              return await loadWithPasswordAttempt(entered);
            }
            throw err;
          }
        };

        pdfDocument = await loadWithPasswordAttempt();
        if (renderJobIdRef.current !== jobId) return;

        setUnlockedPassword(usedPassword);
        const count = pdfDocument.numPages;
        setSourcePageCount(count);

        const initialItems: OrganizedPageItem[] = Array.from({ length: count }, (_, i) => ({
          id: `page-node-${jobId}-${nextIdCounterRef.current++}`,
          originalPageNumber: i + 1,
          rotation: 0,
          dataUrl: null,
        }));

        setPageItems(initialItems);
        setIsLoadingPages(false);

        const maxThumbnailPages = Math.min(count, 120);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        for (let pageNum = 1; pageNum <= maxThumbnailPages; pageNum++) {
          if (renderJobIdRef.current !== jobId) break;

          try {
            const page = await pdfDocument.getPage(pageNum);
            const origVp = page.getViewport({ scale: 1 });
            const targetWidth = 220;
            const scale = Math.min(1.0, Math.max(0.25, targetWidth / Math.max(1, origVp.width)));
            const viewport = page.getViewport({ scale });

            canvas.width = Math.max(1, Math.round(viewport.width));
            canvas.height = Math.max(1, Math.round(viewport.height));

            if (ctx) {
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({ canvasContext: ctx, viewport }).promise;
            }

            const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
            if (typeof page.cleanup === "function") page.cleanup();

            if (renderJobIdRef.current === jobId) {
              setPageItems((prev) =>
                prev.map((item) =>
                  item.originalPageNumber === pageNum ? { ...item, dataUrl } : item
                )
              );
            }

            if (pageNum % 4 === 0) {
              await yieldFrame();
            }
          } catch (thumbErr) {
            logger.warn(`Failed rendering thumbnail for page ${pageNum}:`, thumbErr);
          }
        }

        canvas.width = 0;
        canvas.height = 0;
      } catch (err: any) {
        logger.error("Failed loading PDF for organizing:", err);
        showToast(`Could not load PDF: ${err?.message || err}`, "error");
        setFile(null);
        setSourcePageCount(0);
        setPageItems([]);
      } finally {
        setIsLoadingPages(false);
        if (pdfDocument && typeof pdfDocument.destroy === "function") {
          pdfDocument.destroy();
        }
      }
    },
    [askPassword, showToast]
  );

  // Handle initialFile prop from global drop router
  useEffect(() => {
    if (initialFile) {
      loadPdfForOrganizing(initialFile);
    }
  }, [initialFile, loadPdfForOrganizing]);

  // Register global drop handler while view is active
  useEffect(() => {
    return registerDropHandler((files) => {
      const first = files[0];
      if (first) {
        loadPdfForOrganizing(first);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, loadPdfForOrganizing]);

  useEffect(() => {
    return () => {
      renderJobIdRef.current++;
    };
  }, []);

  const handleMovePage = (index: number, direction: "left" | "right") => {
    setPageItems((prev) => {
      const targetIndex = direction === "left" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
  };

  const handleRotatePage = (index: number, deltaDegrees: number) => {
    setPageItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? { ...item, rotation: (item.rotation + deltaDegrees + 360) % 360 }
          : item
      )
    );
  };

  const handleDuplicatePage = (index: number) => {
    setPageItems((prev) => {
      const source = prev[index];
      if (!source) return prev;
      const cloned: OrganizedPageItem = {
        ...source,
        id: `page-node-dup-${nextIdCounterRef.current++}`,
      };
      const copy = [...prev];
      copy.splice(index + 1, 0, cloned);
      return copy;
    });
  };

  const handleDeletePage = (index: number) => {
    if (pageItems.length <= 1) {
      showToast("A PDF document must retain at least 1 page.", "error");
      return;
    }
    setPageItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleReverseOrder = () => {
    setPageItems((prev) => [...prev].reverse());
  };

  const handleRotateAll = (deltaDegrees: number) => {
    setPageItems((prev) =>
      prev.map((item) => ({
        ...item,
        rotation: (item.rotation + deltaDegrees + 360) % 360,
      }))
    );
  };

  const handleResetOrder = () => {
    if (!sourcePageCount) return;
    setPageItems((prev) => {
      // Map known thumbnails by originalPageNumber
      const thumbMap = new Map<number, string | null>();
      for (const p of prev) {
        if (p.dataUrl && !thumbMap.has(p.originalPageNumber)) {
          thumbMap.set(p.originalPageNumber, p.dataUrl);
        }
      }
      return Array.from({ length: sourcePageCount }, (_, i) => ({
        id: `page-node-reset-${nextIdCounterRef.current++}`,
        originalPageNumber: i + 1,
        rotation: 0,
        dataUrl: thumbMap.get(i + 1) ?? null,
      }));
    });
  };

  const handleResetFile = () => {
    renderJobIdRef.current++;
    setFile(null);
    setSourcePageCount(0);
    setPageItems([]);
    setUnlockedPassword(undefined);
    setIsProcessing(false);
    setProgressMsg("");
  };

  const handleCardDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleCardDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleCardDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      setPageItems((prev) => {
        const copy = [...prev];
        const [moved] = copy.splice(draggedIndex, 1);
        copy.splice(targetIndex, 0, moved);
        return copy;
      });
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleCardDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleExportOrganizedPdf = async () => {
    if (!file || pageItems.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProgressMsg("INITIALIZING_PAGE_SEQUENCER...");

    try {
      await yieldFrame();
      const arrayBuffer = await file.arrayBuffer();

      let outputPdfBytes: Uint8Array;
      let canUseLosslessPdfLib = !unlockedPassword;
      let srcPdfDoc: PDFDocument | null = null;

      if (canUseLosslessPdfLib) {
        try {
          srcPdfDoc = await PDFDocument.load(arrayBuffer, { updateMetadata: false });
          if (srcPdfDoc.isEncrypted) {
            canUseLosslessPdfLib = false;
          }
        } catch {
          canUseLosslessPdfLib = false;
        }
      }

      if (canUseLosslessPdfLib && srcPdfDoc) {
        setProgressMsg(`ASSEMBLING_${pageItems.length}_ORGANIZED_PAGES...`);
        const outPdf = await PDFDocument.create();
        const zeroBasedIndices = pageItems.map((item) => item.originalPageNumber - 1);
        const copiedPages = await outPdf.copyPages(srcPdfDoc, zeroBasedIndices);

        for (let i = 0; i < copiedPages.length; i++) {
          const page = copiedPages[i];
          const extraRotation = pageItems[i].rotation;
          if (extraRotation !== 0) {
            const currentAngle = page.getRotation().angle || 0;
            page.setRotation(degrees((currentAngle + extraRotation) % 360));
          }
          outPdf.addPage(page);
        }

        setProgressMsg("WRITING_ORGANIZED_PDF_STREAM...");
        outputPdfBytes = await outPdf.save({
          useObjectStreams: true,
          objectsPerTick: Infinity,
          updateFieldAppearances: false,
        });
      } else {
        setProgressMsg("REBUILDING_UNLOCKED_PDF_SEQUENCE...");
        const pdfjsLib = await loadPdfJsLibrary();
        const docParams: any = { data: new Uint8Array(arrayBuffer) };
        if (unlockedPassword) {
          docParams.password = unlockedPassword;
        }
        const pdfDocument = await pdfjsLib.getDocument(docParams).promise;
        const outPdf = await PDFDocument.create();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        try {
          for (let i = 0; i < pageItems.length; i++) {
            const item = pageItems[i];
            setProgressMsg(`PROCESSING_PAGE_${i + 1}_OF_${pageItems.length}...`);
            const page = await pdfDocument.getPage(item.originalPageNumber);
            const origVp = page.getViewport({ scale: 1.0, rotation: item.rotation });
            const renderVp = page.getViewport({ scale: 1.5, rotation: item.rotation });

            canvas.width = Math.max(1, Math.round(renderVp.width));
            canvas.height = Math.max(1, Math.round(renderVp.height));

            if (ctx) {
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({ canvasContext: ctx, viewport: renderVp }).promise;
            }

            const jpgBlob: Blob = await new Promise((res, rej) =>
              canvas.toBlob(
                (b) => (b ? res(b) : rej(new Error("Canvas export failed"))),
                "image/jpeg",
                0.92
              )
            );
            const jpgBytes = await jpgBlob.arrayBuffer();
            const embeddedJpg = await outPdf.embedJpg(jpgBytes);
            const pdfPage = outPdf.addPage([origVp.width, origVp.height]);
            pdfPage.drawImage(embeddedJpg, {
              x: 0,
              y: 0,
              width: origVp.width,
              height: origVp.height,
            });

            if (typeof page.cleanup === "function") page.cleanup();
          }
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          if (pdfDocument && typeof pdfDocument.destroy === "function") {
            pdfDocument.destroy();
          }
        }

        outputPdfBytes = await outPdf.save({
          useObjectStreams: true,
          objectsPerTick: Infinity,
          updateFieldAppearances: false,
        });
      }

      const outBlob = new Blob([outputPdfBytes], { type: "application/pdf" });
      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));
      const defaultFilename = `${cleanName}_monotranscoder`;

      await saveFile("organize_pdf", {
        blob: outBlob,
        filename: defaultFilename,
        size: outBlob.size,
        format: "application/pdf",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast(`Organized PDF compiled (${pageItems.length} pages).`, "success");
      onSuccess();
    } catch (err: any) {
      logger.error("Organize PDF error:", err);
      showToast(`Failed to organize PDF: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="organize-pdf-view"
      aria-labelledby="organize-pdf-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="organize-pdf-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            ORGANIZE PDF PAGES // ORGANIZE_PDF.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Drag and drop pages to reorder, rotate individual or all pages, duplicate, or remove pages in local memory.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="organize-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF file to organize pages. Drag and drop or press enter to browse."
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              loadPdfForOrganizing(e.dataTransfer.files[0]);
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
              if (f) loadPdfForOrganizing(f);
            }}
            accept="application/pdf,.pdf"
            className="hidden"
            aria-label="Select PDF Document"
          />
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="organize_pdf" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PDF TO ORGANIZE
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Reorder pages via drag-and-drop, rotate orientations, duplicate, or delete pages losslessly.
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
            SELECT_PDF_FILE
          </button>
        </div>
      ) : isProcessing || isLoadingPages ? (
        <ToolSkeletonLoader
          variant="organize_pdf"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          fileCount={pageItems.length || 4}
          targetInfo={`ORGANIZE ${pageItems.length || sourcePageCount} PAGES`}
          statusMessage={
            progressMsg ||
            (isLoadingPages ? "MOUNTING_PDF_PAGE_THUMBNAILS..." : "ORGANIZING_PDF_DOCUMENT...")
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Top Control Bar & Batch Operations */}
          <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="font-mono font-bold text-xs uppercase text-emerald-400 truncate max-w-xs sm:max-w-md"
                  title={file.name}
                >
                  {file.name}
                </span>
                <span className="text-zinc-600">·</span>
                <span className="font-mono text-xs text-amber-400 font-bold tabular-nums">
                  {formatBytes(file.size)}
                </span>
                <span className="text-zinc-600">·</span>
                <span className="font-mono text-xs text-sky-400 font-bold tabular-nums">
                  {pageItems.length} {pageItems.length === 1 ? "PAGE" : "PAGES"} IN OUTPUT
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetFile}
                  className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                  aria-label="Change PDF document"
                >
                  [CHANGE_FILE]
                </button>
              </div>
            </div>

            {/* Batch Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleReverseOrder}
                  disabled={pageItems.length <= 1}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-white rounded-lg font-mono text-[11px] font-bold uppercase cursor-pointer transition-colors disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>REVERSE_ORDER</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRotateAll(-90)}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-white rounded-lg font-mono text-[11px] font-bold uppercase cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>ROTATE_ALL_LEFT</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRotateAll(90)}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-white rounded-lg font-mono text-[11px] font-bold uppercase cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>ROTATE_ALL_RIGHT</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleResetOrder}
                className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 hover:border-white rounded-lg font-mono text-[11px] font-bold uppercase cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>RESET_TO_ORIGINAL</span>
              </button>
            </div>
          </div>

          {/* Interactive Drag-and-Drop Page Grid */}
          <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <span className="font-mono font-bold text-xs uppercase text-zinc-300">
                DRAG PAGE CARDS TO REORDER OR USE CARD CONTROLS
              </span>
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                SOURCE: {sourcePageCount} PAGES · OUTPUT: {pageItems.length} PAGES
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[600px] overflow-y-auto pr-1">
              {pageItems.map((item, idx) => {
                const isDragged = draggedIndex === idx;
                const isDragTarget = dragOverIndex === idx && draggedIndex !== idx;
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleCardDragStart(e, idx)}
                    onDragOver={(e) => handleCardDragOver(e, idx)}
                    onDrop={(e) => handleCardDrop(e, idx)}
                    onDragEnd={handleCardDragEnd}
                    className={`group rounded-xl p-3 border-2 transition-all flex flex-col justify-between select-none ${
                      isDragged
                        ? "opacity-40 border-dashed border-zinc-500 bg-zinc-900"
                        : isDragTarget
                        ? "border-white bg-zinc-900 shadow-[3px_3px_0px_0px_#ffffff]"
                        : "bg-black border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    {/* Card Header: New Position + Orig Page Info */}
                    <div className="flex items-center justify-between gap-1 mb-2 font-mono text-[11px] tabular-nums">
                      <div className="flex items-center gap-1 text-white font-bold cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-3.5 h-3.5 text-zinc-500" />
                        <span>#{idx + 1}</span>
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        ORIG P.{item.originalPageNumber}
                        {item.rotation !== 0 ? ` · ${item.rotation}°` : ""}
                      </div>
                    </div>

                    {/* Thumbnail Viewport */}
                    <div className="relative w-full aspect-[3/4] bg-zinc-900 rounded overflow-hidden flex items-center justify-center mb-3 cursor-grab active:cursor-grabbing">
                      {item.dataUrl ? (
                        <img
                          src={item.dataUrl}
                          alt={`Page ${idx + 1} (Original Page ${item.originalPageNumber})`}
                          referrerPolicy="no-referrer"
                          style={{ transform: `rotate(${item.rotation}deg)` }}
                          className="w-full h-full object-contain transition-transform duration-150"
                        />
                      ) : (
                        <div
                          style={{ transform: `rotate(${item.rotation}deg)` }}
                          className="flex flex-col items-center justify-center gap-1.5 text-zinc-500 font-mono text-[10px] transition-transform duration-150"
                        >
                          <FileText className="w-6 h-6 text-zinc-600" />
                          <span>P.{item.originalPageNumber}</span>
                        </div>
                      )}
                    </div>

                    {/* Card Controls: Move, Rotate, Duplicate, Delete */}
                    <div className="grid grid-cols-5 gap-1 pt-2 border-t border-zinc-900">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMovePage(idx, "left")}
                        title="Move Left"
                        aria-label={`Move page ${idx + 1} earlier`}
                        className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded flex items-center justify-center disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === pageItems.length - 1}
                        onClick={() => handleMovePage(idx, "right")}
                        title="Move Right"
                        aria-label={`Move page ${idx + 1} later`}
                        className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded flex items-center justify-center disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRotatePage(idx, 90)}
                        title="Rotate 90° Clockwise"
                        aria-label={`Rotate page ${idx + 1} clockwise`}
                        className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded flex items-center justify-center cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicatePage(idx)}
                        title="Duplicate Page"
                        aria-label={`Duplicate page ${idx + 1}`}
                        className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded flex items-center justify-center cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pageItems.length <= 1}
                        onClick={() => handleDeletePage(idx)}
                        title="Remove Page"
                        aria-label={`Delete page ${idx + 1}`}
                        className="p-1.5 bg-zinc-900 hover:bg-red-950 text-red-400 rounded flex items-center justify-center disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handleExportOrganizedPdf}
            disabled={isProcessing || pageItems.length === 0}
            aria-label="Save and Export Organized PDF"
            className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-40"
          >
            <Zap className="w-4 h-4" />
            <span>SAVE &amp; EXPORT ORGANIZED PDF ({pageItems.length} PAGES)</span>
          </button>
        </div>
      )}
    </section>
  );
}
