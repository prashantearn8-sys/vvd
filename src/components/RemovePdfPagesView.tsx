/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  FileMinus,
  Trash2,
  RotateCcw,
  Zap,
  UploadCloud,
  Check,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { loadPdfJsLibrary } from "../utils/pdfProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";

interface RemovePdfPagesViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

interface PageThumbnail {
  pageNumber: number; // 1-based
  dataUrl: string | null;
}

/**
 * Parses a human page range string like "1, 3-5, 9" into a Set of 1-based page numbers
 */
function parsePageRangeInput(input: string, maxPages: number): Set<number> {
  const result = new Set<number>();
  if (!input.trim() || maxPages <= 0) return result;

  const parts = input.split(",");
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const low = Math.max(1, Math.min(start, end));
        const high = Math.min(maxPages, Math.max(start, end));
        for (let p = low; p <= high; p++) {
          result.add(p);
        }
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= maxPages) {
        result.add(num);
      }
    }
  }
  return result;
}

/**
 * Formats a Set of 1-based page numbers into compact range notation (e.g., "1, 3-5, 8")
 */
function formatPageRangeSet(pages: Set<number>): string {
  const sorted = Array.from(pages).sort((a, b) => a - b);
  if (sorted.length === 0) return "";

  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(", ");
}

export default function RemovePdfPagesView({
  onSuccess,
  askPassword,
  initialFile,
}: RemovePdfPagesViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();

  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [thumbnails, setThumbnails] = useState<PageThumbnail[]>([]);
  const [pagesToRemove, setPagesToRemove] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState<string>("");
  const [isLoadingPages, setIsLoadingPages] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [unlockedPassword, setUnlockedPassword] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderJobIdRef = useRef<number>(0);

  const loadPdfAndGenerateThumbnails = useCallback(
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
      setPagesToRemove(new Set());
      setRangeInput("");
      setThumbnails([]);
      setTotalPages(0);
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
        setTotalPages(count);

        // Initialize placeholder slots immediately so user can select pages right away
        const initialPlaceholders: PageThumbnail[] = Array.from(
          { length: count },
          (_, i) => ({
            pageNumber: i + 1,
            dataUrl: null,
          })
        );
        setThumbnails(initialPlaceholders);
        setIsLoadingPages(false);

        // Render thumbnails progressively (up to 120 pages for instant visual responsiveness)
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
              setThumbnails((prev) => {
                const next = [...prev];
                if (next[pageNum - 1]) {
                  next[pageNum - 1] = { pageNumber: pageNum, dataUrl };
                }
                return next;
              });
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
        logger.error("Failed loading PDF for page removal:", err);
        showToast(`Could not load PDF: ${err?.message || err}`, "error");
        setFile(null);
        setTotalPages(0);
        setThumbnails([]);
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
      loadPdfAndGenerateThumbnails(initialFile);
    }
  }, [initialFile, loadPdfAndGenerateThumbnails]);

  // Register global drop handler while view is active
  useEffect(() => {
    return registerDropHandler((files) => {
      const first = files[0];
      if (first) {
        loadPdfAndGenerateThumbnails(first);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, loadPdfAndGenerateThumbnails]);

  useEffect(() => {
    return () => {
      renderJobIdRef.current++;
    };
  }, []);

  const togglePageSelection = (pageNumber: number) => {
    setPagesToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) {
        next.delete(pageNumber);
      } else {
        next.add(pageNumber);
      }
      setRangeInput(formatPageRangeSet(next));
      return next;
    });
  };

  const handleRangeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRangeInput(val);
    const parsed = parsePageRangeInput(val, totalPages);
    setPagesToRemove(parsed);
  };

  const handleSelectOdd = () => {
    const next = new Set<number>();
    for (let i = 1; i <= totalPages; i += 2) {
      next.add(i);
    }
    setPagesToRemove(next);
    setRangeInput(formatPageRangeSet(next));
  };

  const handleSelectEven = () => {
    const next = new Set<number>();
    for (let i = 2; i <= totalPages; i += 2) {
      next.add(i);
    }
    setPagesToRemove(next);
    setRangeInput(formatPageRangeSet(next));
  };

  const handleInvertSelection = () => {
    const next = new Set<number>();
    for (let i = 1; i <= totalPages; i++) {
      if (!pagesToRemove.has(i)) {
        next.add(i);
      }
    }
    setPagesToRemove(next);
    setRangeInput(formatPageRangeSet(next));
  };

  const handleClearSelection = () => {
    setPagesToRemove(new Set());
    setRangeInput("");
  };

  const handleReset = () => {
    renderJobIdRef.current++;
    setFile(null);
    setTotalPages(0);
    setThumbnails([]);
    setPagesToRemove(new Set());
    setRangeInput("");
    setUnlockedPassword(undefined);
    setIsProcessing(false);
    setProgressMsg("");
  };

  const remainingPagesCount = useMemo(
    () => Math.max(0, totalPages - pagesToRemove.size),
    [totalPages, pagesToRemove.size]
  );

  const canExport =
    file !== null &&
    totalPages > 1 &&
    pagesToRemove.size > 0 &&
    remainingPagesCount > 0 &&
    !isProcessing;

  const handleRemovePages = async () => {
    if (!file || !canExport) return;

    setIsProcessing(true);
    setProgressMsg("PARSING_SOURCE_PDF_STRUCTURE...");

    try {
      await yieldFrame();
      const arrayBuffer = await file.arrayBuffer();

      // Determine 0-based indices of pages to KEEP
      const keptZeroBasedIndices: number[] = [];
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (!pagesToRemove.has(pageNum)) {
          keptZeroBasedIndices.push(pageNum - 1);
        }
      }

      if (keptZeroBasedIndices.length === 0) {
        throw new Error("Cannot remove all pages. At least 1 page must remain in the PDF.");
      }

      let outputPdfBytes: Uint8Array;

      // Try lossless vector page extraction via pdf-lib first
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
        setProgressMsg(
          `EXTRACTING_${keptZeroBasedIndices.length}_RETAINED_PAGES_LOSSLESSLY...`
        );
        const outPdf = await PDFDocument.create();
        const copiedPages = await outPdf.copyPages(srcPdfDoc, keptZeroBasedIndices);
        for (const page of copiedPages) {
          outPdf.addPage(page);
        }
        setProgressMsg("SERIALIZING_COMPACT_PDF_BINARY...");
        outputPdfBytes = await outPdf.save({
          useObjectStreams: true,
          objectsPerTick: Infinity,
          updateFieldAppearances: false,
        });
      } else {
        // Fallback for encrypted PDFs unlocked with password via PDF.js
        setProgressMsg("REBUILDING_UNLOCKED_PDF_PAGES...");
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
          for (let idx = 0; idx < keptZeroBasedIndices.length; idx++) {
            const pageNum = keptZeroBasedIndices[idx] + 1;
            setProgressMsg(
              `RENDERING_PAGE_${idx + 1}_OF_${keptZeroBasedIndices.length}...`
            );
            const page = await pdfDocument.getPage(pageNum);
            const origVp = page.getViewport({ scale: 1.0 });
            const renderVp = page.getViewport({ scale: 1.5 });

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
      const defaultFilename = `${cleanName}_pages_removed_monotranscoder`;

      await saveFile("remove_pdf_pages", {
        blob: outBlob,
        filename: defaultFilename,
        size: outBlob.size,
        format: "application/pdf",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast(
        `Removed ${pagesToRemove.size} page(s). ${keptZeroBasedIndices.length} page(s) saved.`,
        "success"
      );
      onSuccess();
    } catch (err: any) {
      logger.error("Remove PDF Pages error:", err);
      showToast(`Failed to remove pages: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="remove-pdf-pages-view"
      aria-labelledby="remove-pdf-pages-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="remove-pdf-pages-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            REMOVE PAGES FROM PDF // REMOVE_PAGES.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Click individual page thumbnails or enter page ranges to delete unwanted pages from your PDF document.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="remove-pdf-pages-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF file to remove pages. Drag and drop or press enter to browse."
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              loadPdfAndGenerateThumbnails(e.dataTransfer.files[0]);
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
              if (f) loadPdfAndGenerateThumbnails(f);
            }}
            accept="application/pdf,.pdf"
            className="hidden"
            aria-label="Select PDF Document"
          />
          <div className="mx-auto w-12 h-12 border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center text-white mb-4 rounded">
            <FileMinus className="w-6 h-6" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PDF DOCUMENT
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Inspect pages visually and remove specific pages or page ranges losslessly in local RAM.
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
          variant="remove_pdf_pages"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          fileCount={totalPages || 4}
          targetInfo={
            pagesToRemove.size > 0
              ? `REMOVE ${pagesToRemove.size} OF ${totalPages} PAGES`
              : "LOADING_PAGE_TREE"
          }
          statusMessage={
            progressMsg ||
            (isLoadingPages ? "LOADING_PDF_PAGE_PREVIEWS..." : "REMOVING_SELECTED_PAGES...")
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Top Control Bar & Document Telemetry */}
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
                loadPdfAndGenerateThumbnails(e.dataTransfer.files[0]);
              }
            }}
            className={`bg-zinc-950 border-2 rounded-xl p-5 space-y-5 transition-all ${
              isDragOver ? "border-white ring-2 ring-white/50 bg-zinc-900" : "border-zinc-800"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-bold text-xs uppercase text-emerald-400 truncate max-w-xs sm:max-w-md" title={file.name}>
                  {file.name}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400">
                  <UploadCloud className="w-3 h-3" /> Drop PDF to replace
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                  aria-label="Change PDF document"
                >
                  [CHANGE_FILE]
                </button>
              </div>
            </div>

            {/* Telemetry Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div className="bg-black border border-zinc-800 p-3.5 rounded-lg flex items-center justify-between">
                <span className="text-zinc-400">TOTAL_PAGES:</span>
                <strong className="text-sky-400 font-bold tabular-nums">{totalPages}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-3.5 rounded-lg flex items-center justify-between">
                <span className="text-zinc-400">MARKED_TO_DELETE:</span>
                <strong className="text-red-400 font-bold tabular-nums">
                  {pagesToRemove.size} {pagesToRemove.size === 1 ? "PAGE" : "PAGES"}
                </strong>
              </div>
              <div className="bg-black border border-zinc-800 p-3.5 rounded-lg flex items-center justify-between">
                <span className="text-zinc-400">REMAINING_OUTPUT:</span>
                <strong
                  className={`font-bold tabular-nums ${
                    remainingPagesCount === 0 ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {remainingPagesCount} {remainingPagesCount === 1 ? "PAGE" : "PAGES"}
                </strong>
              </div>
            </div>

            {/* Range Input & Quick Batch Selection Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              <div className="lg:col-span-6 space-y-1.5">
                <label
                  htmlFor="page-range-input"
                  className="block text-[11px] font-mono font-bold uppercase text-zinc-300"
                >
                  PAGES TO REMOVE (E.G. 1, 3-5, 8):
                </label>
                <input
                  id="page-range-input"
                  type="text"
                  value={rangeInput}
                  onChange={handleRangeInputChange}
                  placeholder={`e.g. 1, 2-${Math.min(4, totalPages)}`}
                  className="w-full p-2.5 bg-black border-2 border-zinc-700 text-white rounded-lg text-xs font-mono placeholder:text-zinc-600 focus:border-white focus:outline-none tabular-nums"
                />
              </div>

              <div className="lg:col-span-6 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectOdd}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-white rounded-lg font-mono text-[11px] font-bold uppercase cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  SELECT_ODD
                </button>
                <button
                  type="button"
                  onClick={handleSelectEven}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-white rounded-lg font-mono text-[11px] font-bold uppercase cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  SELECT_EVEN
                </button>
                <button
                  type="button"
                  onClick={handleInvertSelection}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-white rounded-lg font-mono text-[11px] font-bold uppercase cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  INVERT
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  disabled={pagesToRemove.size === 0}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-red-400 border border-zinc-700 hover:border-red-500 rounded-lg font-mono text-[11px] font-bold uppercase cursor-pointer transition-colors disabled:opacity-40 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>RESET</span>
                </button>
              </div>
            </div>

            {totalPages === 1 && (
              <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg flex items-center gap-2.5 text-xs font-mono text-zinc-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-white" />
                <span>
                  This PDF contains only 1 page. A valid PDF document must retain at least 1 page.
                </span>
              </div>
            )}

            {totalPages > 1 && remainingPagesCount === 0 && (
              <div className="p-3 bg-red-950/40 border border-red-700/60 rounded-lg flex items-center gap-2.5 text-xs font-mono text-red-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>
                  All {totalPages} pages are marked for deletion. Unselect at least 1 page to export a valid PDF.
                </span>
              </div>
            )}
          </div>

          {/* Interactive Page Thumbnail Grid */}
          <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono font-bold text-xs uppercase text-zinc-300">
                CLICK PAGES TO TOGGLE DELETION ({pagesToRemove.size} SELECTED)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-[540px] overflow-y-auto pr-1">
              {thumbnails.map((item) => {
                const isMarkedForDeletion = pagesToRemove.has(item.pageNumber);
                return (
                  <button
                    key={item.pageNumber}
                    type="button"
                    onClick={() => togglePageSelection(item.pageNumber)}
                    aria-pressed={isMarkedForDeletion}
                    aria-label={`Page ${item.pageNumber} - ${
                      isMarkedForDeletion ? "Marked for deletion" : "Retained"
                    }`}
                    className={`group relative rounded-xl p-2.5 border-2 transition-all flex flex-col justify-between text-left cursor-pointer ${
                      isMarkedForDeletion
                        ? "bg-red-950/30 border-red-500 shadow-[2px_2px_0px_0px_#ef4444]"
                        : "bg-black border-zinc-800 hover:border-zinc-500"
                    }`}
                  >
                    <div className="relative w-full aspect-[3/4] bg-zinc-900 rounded overflow-hidden flex items-center justify-center mb-2.5">
                      {item.dataUrl ? (
                        <img
                          src={item.dataUrl}
                          alt={`PDF Page ${item.pageNumber}`}
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-contain transition-opacity ${
                            isMarkedForDeletion ? "opacity-35 grayscale" : "opacity-100"
                          }`}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 text-zinc-500 font-mono text-[10px]">
                          <FileText className="w-6 h-6 text-zinc-600" />
                          <span>PAGE {item.pageNumber}</span>
                        </div>
                      )}

                      {/* Status Overlay Icon */}
                      <div
                        className={`absolute top-2 right-2 w-6 h-6 rounded flex items-center justify-center border transition-colors ${
                          isMarkedForDeletion
                            ? "bg-red-500 border-red-300 text-black"
                            : "bg-zinc-900/90 border-zinc-700 text-white group-hover:border-white"
                        }`}
                      >
                        {isMarkedForDeletion ? (
                          <Trash2 className="w-3.5 h-3.5" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </div>

                    <div className="w-full flex items-center justify-between font-mono text-[11px] tabular-nums">
                      <span className="font-bold text-white">PAGE #{item.pageNumber}</span>
                      <span
                        className={`font-bold uppercase text-[10px] ${
                          isMarkedForDeletion ? "text-red-400" : "text-emerald-400"
                        }`}
                      >
                        {isMarkedForDeletion ? "DELETE" : "KEEP"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handleRemovePages}
            disabled={!canExport}
            aria-label="Remove Selected Pages and Export PDF"
            className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap className="w-4 h-4" />
            <span>
              {pagesToRemove.size > 0
                ? `REMOVE ${pagesToRemove.size} ${
                    pagesToRemove.size === 1 ? "PAGE" : "PAGES"
                  } & EXPORT PDF (${remainingPagesCount} REMAINING)`
                : "SELECT PAGES ABOVE TO REMOVE"}
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
