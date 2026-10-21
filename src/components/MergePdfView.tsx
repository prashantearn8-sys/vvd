/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Files, Trash2, ArrowUp, ArrowDown, Plus, Zap, UploadCloud } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";

interface MergePdfViewProps {
  onSuccess: () => void;
  initialFiles?: File[] | null;
}

export default function MergePdfView({ onSuccess, initialFiles }: MergePdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        newFiles.push(f);
      } else {
        showToast(`Skipping non-PDF file: ${f.name}`, "error");
      }
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      showToast(`Added ${newFiles.length} PDF file(s) to merge list.`, "success");
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
    return registerDropHandler((dropped) => {
      if (dropped.length > 0) {
        addFiles(dropped);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, addFiles]);

  const handleMove = (index: number, direction: "up" | "down") => {
    setFiles((prev) => {
      const copy = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= copy.length) return prev;
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleRemove = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReset = () => {
    setFiles([]);
    setIsProcessing(false);
  };

  const totalBytes = useMemo(() => files.reduce((acc, f) => acc + f.size, 0), [files]);

  const handleMergePdf = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);

    try {
      await yieldFrame();

      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const fileBytes = await file.arrayBuffer();
        let pdf: PDFDocument;
        try {
          pdf = await PDFDocument.load(fileBytes, { updateMetadata: false });
        } catch (loadErr: any) {
          const msg = String(loadErr?.message || loadErr);
          if (
            loadErr?.name === "EncryptedPDFError" ||
            msg.toLowerCase().includes("encrypted") ||
            msg.toLowerCase().includes("password")
          ) {
            throw new Error(`"${file.name}" is password-protected or encrypted. Please unlock it before merging.`);
          }
          throw new Error(`Could not read "${file.name}": ${msg}`);
        }
        if (pdf.isEncrypted) {
          throw new Error(`"${file.name}" is encrypted. Please unlock it before merging.`);
        }
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save({
        useObjectStreams: true,
        objectsPerTick: Infinity,
        updateFieldAppearances: false,
      });
      const mergedPdfBlob = new Blob([mergedPdfBytes], { type: "application/pdf" });
      const firstCleanName = sanitizeFilename(files[0]?.name.replace(/\.[^/.]+$/, "") || "merged_document");
      const defaultFilename = `${firstCleanName}_monotranscoder`;

      await saveFile("merge_pdf", {
        blob: mergedPdfBlob,
        filename: defaultFilename,
        size: mergedPdfBlob.size,
        format: "application/pdf",
        originalName: sanitizeFilename(files[0]?.name || "merged.pdf"),
        originalSize: totalBytes,
      });

      showToast("PDF files merged successfully.", "success");
      onSuccess();
    } catch (err: any) {
      logger.error("PDF Merge error:", err);
      showToast(`Error occurred while merging PDF files: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="space-y-6 animate-fade-in" id="merge-pdf-view" aria-labelledby="merge-pdf-heading">
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 id="merge-pdf-heading" className="text-xl font-bold uppercase tracking-tight text-white font-sans">
            MERGE PDF DOCUMENTS // MERGE_PDF.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Combine multiple PDF files into one clean document with sequence management.
          </p>
        </div>
      </div>

      {files.length === 0 ? (
        <div
          id="merge-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF files to merge. Drag and drop or press enter to browse."
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
              if (e.target.files?.length) addFiles(e.target.files);
            }}
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            aria-label="Select PDF Files"
          />
          <div className="mx-auto w-12 h-12 border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center text-white mb-4 rounded">
            <Files className="w-6 h-6" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PDF FILES TO MERGE
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Select two or more PDF documents to merge into a single continuous file.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
            aria-label="Select PDF Documents"
          >
            SELECT_PDF_FILES
          </button>
        </div>
      ) : isProcessing ? (
        <ToolSkeletonLoader
          variant="merge_pdf"
          fileCount={files.length}
          fileSize={formatBytes(totalBytes)}
          targetInfo={`MERGE ${files.length} PDFS`}
          statusMessage={`MERGING_${files.length}_DOCUMENTS...`}
        />
      ) : (
        <div className="space-y-6 max-w-3xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950 border-2 border-zinc-800 p-4 rounded-xl">
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-zinc-400 uppercase">QUEUED_DOCUMENTS:</span>
              <strong className="text-sky-400 font-bold">{files.length} FILES</strong>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400 uppercase">TOTAL_SIZE:</span>
              <strong className="text-amber-400 font-bold">{formatBytes(totalBytes)}</strong>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                }}
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                aria-label="Add More PDF Files"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-zinc-900 text-zinc-200 border border-zinc-700 hover:border-white text-xs font-mono font-bold uppercase rounded flex items-center gap-1 cursor-pointer"
                aria-label="Add more PDF documents"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ADD_MORE</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 bg-zinc-900 text-red-400 border border-zinc-700 hover:border-red-500 text-xs font-mono font-bold uppercase rounded cursor-pointer"
                aria-label="Clear all files"
              >
                CLEAR_ALL
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {files.map((f, idx) => (
              <div
                key={`${f.name}-${idx}`}
                className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-3.5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-7 h-7 bg-zinc-900 border border-zinc-700 text-white font-mono text-xs font-bold flex items-center justify-center rounded shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold font-mono text-white truncate max-w-sm" title={f.name}>
                      {f.name}
                    </p>
                    <p className="text-[10px] text-zinc-400 font-mono">{formatBytes(f.size)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, "up")}
                    className="p-1.5 hover:bg-zinc-800 rounded text-zinc-300 disabled:opacity-30 cursor-pointer"
                    title="Move Up"
                    aria-label={`Move File ${idx + 1} Up`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === files.length - 1}
                    onClick={() => handleMove(idx, "down")}
                    className="p-1.5 hover:bg-zinc-800 rounded text-zinc-300 disabled:opacity-30 cursor-pointer"
                    title="Move Down"
                    aria-label={`Move File ${idx + 1} Down`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="p-1.5 hover:bg-red-950 text-red-400 rounded cursor-pointer"
                    title="Remove File"
                    aria-label={`Remove File ${idx + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Quick Add / Drop Box for Merge */}
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
              className={`border-2 border-dashed rounded-xl p-5 flex items-center justify-center gap-3 text-center cursor-pointer transition-all ${
                isDragOver
                  ? "border-white bg-zinc-900 scale-101"
                  : "border-zinc-800 hover:border-zinc-600 bg-zinc-950/50 hover:bg-zinc-900/40"
              }`}
            >
              <div className="w-8 h-8 rounded border border-zinc-700 bg-zinc-900 flex items-center justify-center text-zinc-400">
                <Plus className="w-4 h-4" />
              </div>
              <div className="text-left font-mono">
                <span className="text-xs font-bold uppercase text-white block">ADD / DROP MORE PDFS</span>
                <span className="text-[10px] text-zinc-400">Drag additional PDF files here or browse</span>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="button"
              onClick={handleMergePdf}
              disabled={isProcessing}
              aria-label="Merge PDF Files Now"
              className="w-full py-3 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                  <span role="status" aria-live="polite">MERGING PDF DOCUMENTS...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>MERGE {files.length} PDF DOCUMENTS</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
