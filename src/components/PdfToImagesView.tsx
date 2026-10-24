/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Image as ImageIcon, FolderOpen, Zap, UploadCloud } from "lucide-react";
import JSZip from "jszip";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { loadPdfJsLibrary } from "../utils/pdfProcessor";
import { createTrackedObjectURL, revokeTrackedObjectURL } from "../utils/urlTracker";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ModuleIconBadge from "./ModuleIconBadge";

interface PdfToImagesViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

export default function PdfToImagesView({ onSuccess, askPassword, initialFile }: PdfToImagesViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string>("");
  const lastProgressUpdateRef = useRef<number>(0);

  const validateAndSetupFile = useCallback((selectedFile: File) => {
    const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
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
    setIsProcessing(false);
    setProgressMsg("");
  };

  const handleExtractImages = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgressMsg("INITIALIZING_PDF_ENGINE...");

    let pdfDocument: any = null;

    try {
      await yieldFrame();

      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = await loadPdfJsLibrary();

      const loadPdfWithPasswordAttempt = async (pwd?: string): Promise<any> => {
        const docParams: any = { data: new Uint8Array(arrayBuffer) };
        if (pwd) {
          docParams.password = pwd;
        }
        const loadingTask = pdfjsLib.getDocument(docParams);
        try {
          return await loadingTask.promise;
        } catch (err: any) {
          const isPasswordRequired =
            err.name === "PasswordException" ||
            err.name === "IncorrectPasswordException" ||
            err?.message?.toLowerCase().includes("password");
          if (isPasswordRequired) {
            const entered = await askPassword(pwd ? "wrong" : "required");
            if (entered === null) {
              throw new Error("Password decryption cancelled by user.");
            }
            return await loadPdfWithPasswordAttempt(entered);
          }
          throw err;
        }
      };

      pdfDocument = await loadPdfWithPasswordAttempt();
      const numPages = pdfDocument.numPages;

      const cleanDocName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));
      const defaultFilename = `${cleanDocName}_monotranscoder`;

      if (numPages === 1) {
        setProgressMsg("RENDERING_SINGLE_PAGE...");
        const page = await pdfDocument.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");

        if (context) {
          context.fillStyle = "#FFFFFF";
          context.fillRect(0, 0, canvas.width, canvas.height);
        }

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        const blob: Blob = await new Promise((res, rej) => {
          canvas.toBlob((b) => (b ? res(b) : rej(new Error("Canvas export failed"))), "image/jpeg", 0.92);
        });

        // Release canvas and page memory
        canvas.width = 0;
        canvas.height = 0;
        if (typeof page.cleanup === "function") page.cleanup();

        await saveFile("pdf_to_images", {
          blob,
          filename: defaultFilename,
          size: blob.size,
          format: "image/jpeg",
          originalName: sanitizeFilename(file.name),
          originalSize: file.size,
        });
      } else {
        const zip = new JSZip();

        // Canvas reused to avoid GC churning and texture memory thrashing
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        for (let i = 1; i <= numPages; i++) {
          const now = performance.now();
          if (i === 1 || i === numPages || now - lastProgressUpdateRef.current >= 150) {
            lastProgressUpdateRef.current = now;
            setProgressMsg(`RENDERING_PAGE_${i}_OF_${numPages}...`);
          }
          const page = await pdfDocument.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });

          if (canvas.width !== viewport.width || canvas.height !== viewport.height) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
          }

          if (context) {
            context.fillStyle = "#FFFFFF";
            context.fillRect(0, 0, canvas.width, canvas.height);
          }

          await page.render({
            canvasContext: context,
            viewport,
          }).promise;

          const blob: Blob = await new Promise((res, rej) => {
            canvas.toBlob((b) => (b ? res(b) : rej(new Error("Canvas export failed"))), "image/jpeg", 0.90);
          });

          zip.file(`${cleanDocName}_page_${i}.jpg`, blob);

          if (typeof page.cleanup === "function") {
            page.cleanup();
          }
        }

        // Clean reusable canvas
        canvas.width = 0;
        canvas.height = 0;

        setProgressMsg("COMPILING_ZIP_STREAM...");
        // Use STORE for JPEG archives since JPEGs are already Huffman/DCT compressed (20x faster ZIP generation)
        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "STORE",
        });

        await saveFile("pdf_to_images", {
          blob: zipBlob,
          filename: defaultFilename,
          size: zipBlob.size,
          format: "application/zip",
          originalName: sanitizeFilename(file.name),
          originalSize: file.size,
        });
      }

      showToast("PDF pages extracted successfully.", "success");
      onSuccess();
    } catch (err: any) {
      logger.error("PDF to Images extraction error:", err);
      showToast(`Failed to extract images from PDF: ${err?.message || err}`, "error");
    } finally {
      if (pdfDocument && typeof pdfDocument.destroy === "function") {
        pdfDocument.destroy();
      }
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section className="space-y-6 animate-fade-in" id="pdf-to-images-view" aria-labelledby="pdf-to-images-heading">
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 id="pdf-to-images-heading" className="text-xl font-bold uppercase tracking-tight text-white font-sans">
            PDF TO IMAGES EXTRACTOR // PDF_TO_IMAGES.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Extract every page of a PDF document into high-resolution JPG images. Single pages download as JPG, multi-page as ZIP.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="pdf-to-images-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF file to extract images. Drag and drop or press enter to browse."
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
            accept="application/pdf,.pdf"
            className="hidden"
            aria-label="Select PDF Document"
          />
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="pdf_to_images" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PDF DOCUMENT
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Renders every page into high-resolution JPG images with local memory optimization.
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
                <FolderOpen className="w-4 h-4" /> EXTRACTION_CONFIG.CFG
              </h3>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-black border-2 border-zinc-800 p-4 rounded-lg space-y-2 text-xs font-mono flex flex-col justify-center">
                <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-400">DOCUMENT_NAME:</span>
                  <strong className="truncate max-w-[150px] text-emerald-400 font-bold" title={file.name}>
                    {file.name}
                  </strong>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-400">FILE_SIZE:</span>
                  <strong className="text-amber-400 font-bold">{formatBytes(file.size)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">TARGET_OUTPUT:</span>
                  <strong className="text-fuchsia-400 font-bold uppercase">JPG / ZIP ARCHIVE</strong>
                </div>
              </div>

              <div className="space-y-4 flex flex-col justify-center">
                {progressMsg && (
                  <div className="p-2 bg-zinc-900 border border-zinc-700 rounded text-[11px] font-mono text-zinc-300 animate-pulse" role="status" aria-live="polite">
                    ▶ {progressMsg}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleExtractImages}
                  disabled={isProcessing}
                  aria-label="Extract Images Now"
                  className="w-full py-3 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                      <span role="status" aria-live="polite">EXTRACTING IMAGES...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>EXTRACT IMAGES NOW</span>
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
