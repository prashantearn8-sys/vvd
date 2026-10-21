/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Stamp,
  FolderOpen,
  Zap,
  Type as TypeIcon,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Grid,
  Upload,
} from "lucide-react";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { loadPdfJsLibrary } from "../utils/pdfProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";

interface WatermarkPdfViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

type WatermarkMode = "TEXT" | "IMAGE";
type PlacementMode = "SINGLE" | "TILED";
type PositionAnchor =
  | "TOP_LEFT"
  | "TOP_CENTER"
  | "TOP_RIGHT"
  | "CENTER_LEFT"
  | "CENTER"
  | "CENTER_RIGHT"
  | "BOTTOM_LEFT"
  | "BOTTOM_CENTER"
  | "BOTTOM_RIGHT";
type PageScope = "ALL_PAGES" | "FIRST_PAGE" | "CUSTOM_RANGE";
type WatermarkColorPreset = "SLATE" | "CRIMSON" | "COBALT" | "EMERALD" | "BLACK";

const COLOR_MAP: Record<
  WatermarkColorPreset,
  { label: string; hex: string; r: number; g: number; b: number }
> = {
  SLATE: { label: "SLATE", hex: "#64748b", r: 0.39, g: 0.45, b: 0.55 },
  CRIMSON: { label: "RED", hex: "#dc2626", r: 0.86, g: 0.15, b: 0.15 },
  COBALT: { label: "BLUE", hex: "#2563eb", r: 0.15, g: 0.39, b: 0.92 },
  EMERALD: { label: "GREEN", hex: "#16a34a", r: 0.09, g: 0.64, b: 0.29 },
  BLACK: { label: "BLACK", hex: "#111827", r: 0.07, g: 0.09, b: 0.15 },
};

const POSITION_GRID: { id: PositionAnchor; label: string }[] = [
  { id: "TOP_LEFT", label: "TL" },
  { id: "TOP_CENTER", label: "TC" },
  { id: "TOP_RIGHT", label: "TR" },
  { id: "CENTER_LEFT", label: "CL" },
  { id: "CENTER", label: "C" },
  { id: "CENTER_RIGHT", label: "CR" },
  { id: "BOTTOM_LEFT", label: "BL" },
  { id: "BOTTOM_CENTER", label: "BC" },
  { id: "BOTTOM_RIGHT", label: "BR" },
];

function normalizeTextForPdf(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function parsePageRange(input: string, maxPages: number): Set<number> {
  const result = new Set<number>();
  const parts = input.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-");
      const s = parseInt(startStr, 10);
      const e = parseInt(endStr, 10);
      if (!Number.isNaN(s) && !Number.isNaN(e)) {
        const low = Math.max(1, Math.min(s, e));
        const high = Math.min(maxPages, Math.max(s, e));
        for (let p = low; p <= high; p++) result.add(p);
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= maxPages) {
        result.add(num);
      }
    }
  }
  return result;
}

function getAnchorCoordinates(
  anchor: PositionAnchor,
  pageW: number,
  pageH: number,
  itemW: number,
  itemH: number
): { x: number; y: number } {
  const pad = 42;
  let x = (pageW - itemW) / 2;
  let y = (pageH - itemH) / 2;

  if (anchor.endsWith("LEFT")) x = pad;
  else if (anchor.endsWith("RIGHT")) x = Math.max(pad, pageW - itemW - pad);

  if (anchor.startsWith("TOP")) y = Math.max(pad, pageH - itemH - pad);
  else if (anchor.startsWith("BOTTOM")) y = pad;

  return { x, y };
}

export default function WatermarkPdfView({
  onSuccess,
  askPassword,
  initialFile,
}: WatermarkPdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pdfBytesBuffer, setPdfBytesBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pagePreviewUrl, setPagePreviewUrl] = useState<string>("");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Watermark Configuration
  const [mode, setMode] = useState<WatermarkMode>("TEXT");
  const [watermarkText, setWatermarkText] = useState<string>("CONFIDENTIAL");
  const [fontSize, setFontSize] = useState<number>(52);
  const [rotation, setRotation] = useState<number>(-45);
  const [opacity, setOpacity] = useState<number>(28);
  const [colorPreset, setColorPreset] = useState<WatermarkColorPreset>("CRIMSON");
  const [placementMode, setPlacementMode] = useState<PlacementMode>("SINGLE");
  const [anchor, setAnchor] = useState<PositionAnchor>("CENTER");
  const [pageScope, setPageScope] = useState<PageScope>("ALL_PAGES");
  const [customRange, setCustomRange] = useState<string>("1-3");

  // Image Watermark State
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const [logoBytes, setLogoBytes] = useState<Uint8Array | null>(null);
  const [logoMime, setLogoMime] = useState<"image/png" | "image/jpeg">("image/png");
  const [logoScalePct, setLogoScalePct] = useState<number>(35);

  const renderPagePreview = useCallback(
    async (buffer: ArrayBuffer, pageNum: number, pwd?: string) => {
      let pdfDoc: any = null;
      try {
        const pdfjsLib = await loadPdfJsLibrary();
        const params: any = { data: new Uint8Array(buffer.slice(0)) };
        if (pwd) params.password = pwd;
        pdfDoc = await pdfjsLib.getDocument(params).promise;
        const page = await pdfDoc.getPage(pageNum);
        const vp = page.getViewport({ scale: 1.1 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(vp.width));
        canvas.height = Math.max(1, Math.round(vp.height));
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
        }
        setPagePreviewUrl(canvas.toDataURL("image/jpeg", 0.85));
        canvas.width = 0;
        canvas.height = 0;
        if (typeof page.cleanup === "function") page.cleanup();
      } catch (err) {
        logger.warn("Watermark page preview render warning:", err);
      } finally {
        if (pdfDoc && typeof pdfDoc.destroy === "function") {
          pdfDoc.destroy();
        }
      }
    },
    []
  );

  const handleLoadPdfFile = useCallback(
    async (selected: File) => {
      if (
        selected.type !== "application/pdf" &&
        !selected.name.toLowerCase().endsWith(".pdf")
      ) {
        showToast("Please select a valid PDF document.", "error");
        return;
      }

      setFile(selected);
      setIsParsing(true);
      setProgressMsg("LOADING_PDF_DOCUMENT...");

      try {
        await yieldFrame();
        const arrayBuffer = await selected.arrayBuffer();
        const pdfjsLib = await loadPdfJsLibrary();

        let activePassword: string | undefined = undefined;
        const openWithPwd = async (pwd?: string): Promise<any> => {
          const params: any = { data: new Uint8Array(arrayBuffer.slice(0)) };
          if (pwd) params.password = pwd;
          try {
            const doc = await pdfjsLib.getDocument(params).promise;
            activePassword = pwd;
            return doc;
          } catch (err: any) {
            const isPwd =
              err?.name === "PasswordException" ||
              err?.name === "IncorrectPasswordException" ||
              String(err?.message || "").toLowerCase().includes("password");
            if (isPwd) {
              const userPwd = await askPassword(pwd ? "wrong" : "required");
              if (userPwd === null) {
                throw new Error("Password prompt cancelled.");
              }
              return openWithPwd(userPwd);
            }
            throw err;
          }
        };

        const pdfDoc = await openWithPwd();
        const total = pdfDoc.numPages;
        pdfDoc.destroy();

        setPdfBytesBuffer(arrayBuffer);
        setPageCount(total);
        setCurrentPage(1);
        setCustomRange(`1-${Math.min(total, 3)}`);
        await renderPagePreview(arrayBuffer, 1, activePassword);
      } catch (err: any) {
        logger.error("Watermark PDF load error:", err);
        showToast(`Failed to load PDF: ${err?.message || err}`, "error");
        setFile(null);
        setPdfBytesBuffer(null);
      } finally {
        setIsParsing(false);
        setProgressMsg("");
      }
    },
    [askPassword, renderPagePreview, showToast]
  );

  useEffect(() => {
    if (initialFile) {
      handleLoadPdfFile(initialFile);
    }
  }, [initialFile, handleLoadPdfFile]);

  useEffect(() => {
    return registerDropHandler((droppedFiles) => {
      if (droppedFiles.length > 0) {
        handleLoadPdfFile(droppedFiles[0]);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, handleLoadPdfFile]);

  const handleChangePreviewPage = async (nextPage: number) => {
    if (!pdfBytesBuffer || nextPage < 1 || nextPage > pageCount) return;
    setCurrentPage(nextPage);
    await renderPagePreview(pdfBytesBuffer, nextPage);
  };

  const handleUploadLogo = async (logoFile: File) => {
    const isPng =
      logoFile.type === "image/png" || logoFile.name.toLowerCase().endsWith(".png");
    const isJpg =
      logoFile.type === "image/jpeg" ||
      logoFile.name.toLowerCase().endsWith(".jpg") ||
      logoFile.name.toLowerCase().endsWith(".jpeg");

    if (!isPng && !isJpg) {
      showToast("Please upload a PNG or JPG image for the watermark logo.", "error");
      return;
    }

    const buf = await logoFile.arrayBuffer();
    setLogoBytes(new Uint8Array(buf));
    setLogoMime(isPng ? "image/png" : "image/jpeg");

    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoDataUrl(String(reader.result || ""));
      setMode("IMAGE");
    };
    reader.readAsDataURL(logoFile);
  };

  const handleReset = () => {
    setFile(null);
    setPdfBytesBuffer(null);
    setPageCount(0);
    setPagePreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleStampWatermark = async () => {
    if (!file || !pdfBytesBuffer) return;
    if (mode === "TEXT" && !watermarkText.trim()) {
      showToast("Please enter watermark text.", "error");
      return;
    }
    if (mode === "IMAGE" && !logoBytes) {
      showToast("Please upload a watermark logo image first.", "error");
      return;
    }

    setIsProcessing(true);
    setProgressMsg("STAMPING_WATERMARK_ACROSS_PAGES...");

    try {
      await yieldFrame();
      const pdfDoc = await PDFDocument.load(pdfBytesBuffer, {
        ignoreEncryption: true,
        updateMetadata: false,
      });

      const pages = pdfDoc.getPages();
      const total = pages.length;

      let targetSet = new Set<number>();
      if (pageScope === "ALL_PAGES") {
        for (let i = 1; i <= total; i++) targetSet.add(i);
      } else if (pageScope === "FIRST_PAGE") {
        targetSet.add(1);
      } else {
        targetSet = parsePageRange(customRange, total);
        if (targetSet.size === 0) targetSet.add(1);
      }

      const alpha = Math.max(0.05, Math.min(1, opacity / 100));

      if (mode === "TEXT") {
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const cleanText = normalizeTextForPdf(watermarkText.trim()) || "CONFIDENTIAL";
        const c = COLOR_MAP[colorPreset];
        const colorVal = rgb(c.r, c.g, c.b);

        for (let idx = 0; idx < total; idx++) {
          const pageNum = idx + 1;
          if (!targetSet.has(pageNum)) continue;

          const page = pages[idx];
          const { width, height } = page.getSize();
          const textW = fontBold.widthOfTextAtSize(cleanText, fontSize);
          const textH = fontSize;

          if (placementMode === "TILED") {
            const stepX = Math.max(180, textW + 90);
            const stepY = Math.max(150, textH + 110);
            for (let y = 60; y < height - 30; y += stepY) {
              for (let x = 40; x < width - 20; x += stepX) {
                page.drawText(cleanText, {
                  x,
                  y,
                  size: fontSize * 0.72,
                  font: fontBold,
                  color: colorVal,
                  opacity: alpha,
                  rotate: degrees(rotation),
                });
              }
            }
          } else {
            const pos = getAnchorCoordinates(anchor, width, height, textW, textH);
            page.drawText(cleanText, {
              x: pos.x,
              y: pos.y,
              size: fontSize,
              font: fontBold,
              color: colorVal,
              opacity: alpha,
              rotate: degrees(rotation),
            });
          }
        }
      } else if (mode === "IMAGE" && logoBytes) {
        const embeddedImg =
          logoMime === "image/png"
            ? await pdfDoc.embedPng(logoBytes)
            : await pdfDoc.embedJpg(logoBytes);

        for (let idx = 0; idx < total; idx++) {
          const pageNum = idx + 1;
          if (!targetSet.has(pageNum)) continue;

          const page = pages[idx];
          const { width, height } = page.getSize();
          const targetW = width * (logoScalePct / 100);
          const ratio = embeddedImg.height / Math.max(1, embeddedImg.width);
          const targetH = targetW * ratio;

          if (placementMode === "TILED") {
            const stepX = Math.max(160, targetW + 70);
            const stepY = Math.max(140, targetH + 70);
            for (let y = 40; y < height - 20; y += stepY) {
              for (let x = 40; x < width - 20; x += stepX) {
                page.drawImage(embeddedImg, {
                  x,
                  y,
                  width: targetW * 0.65,
                  height: targetH * 0.65,
                  opacity: alpha,
                  rotate: degrees(rotation),
                });
              }
            }
          } else {
            const pos = getAnchorCoordinates(anchor, width, height, targetW, targetH);
            page.drawImage(embeddedImg, {
              x: pos.x,
              y: pos.y,
              width: targetW,
              height: targetH,
              opacity: alpha,
              rotate: degrees(rotation),
            });
          }
        }
      }

      setProgressMsg("SAVING_WATERMARKED_PDF...");
      const outBytes = await pdfDoc.save({
        useObjectStreams: true,
        objectsPerTick: Infinity,
      });

      const pdfBlob = new Blob([outBytes], { type: "application/pdf" });
      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));

      await saveFile("watermark_pdf", {
        blob: pdfBlob,
        filename: `${cleanName}_watermarked`,
        size: pdfBlob.size,
        format: "application/pdf",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast("Watermark stamped onto PDF successfully.", "success");
      onSuccess();
    } catch (err: any) {
      logger.error("Watermark PDF error:", err);
      showToast(`Failed to watermark PDF: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  // Compute CSS alignment for live visual overlay
  const getPreviewAlignmentClasses = (pos: PositionAnchor): string => {
    switch (pos) {
      case "TOP_LEFT":
        return "items-start justify-start p-6";
      case "TOP_CENTER":
        return "items-start justify-center p-6";
      case "TOP_RIGHT":
        return "items-start justify-end p-6";
      case "CENTER_LEFT":
        return "items-center justify-start p-6";
      case "CENTER":
        return "items-center justify-center p-6";
      case "CENTER_RIGHT":
        return "items-center justify-end p-6";
      case "BOTTOM_LEFT":
        return "items-end justify-start p-6";
      case "BOTTOM_CENTER":
        return "items-end justify-center p-6";
      case "BOTTOM_RIGHT":
        return "items-end justify-end p-6";
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="watermark-pdf-view"
      aria-labelledby="watermark-pdf-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="watermark-pdf-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            WATERMARK PDF STUDIO // WATERMARK_PDF.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Stamp custom text or image watermarks with adjustable opacity, rotation, and tiled patterns onto PDF pages locally.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="watermark-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF file to add watermark"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              handleLoadPdfFile(e.dataTransfer.files[0]);
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
              if (f) handleLoadPdfFile(f);
            }}
            accept=".pdf,application/pdf"
            className="hidden"
            aria-label="Select PDF File"
          />
          <div className="mx-auto w-12 h-12 border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center text-white mb-4 rounded">
            <Stamp className="w-6 h-6" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PDF DOCUMENT (.PDF)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Add diagonal text stamps, confidential seals, or company logos across PDF pages in local browser RAM.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
          >
            SELECT_PDF_FILE
          </button>
        </div>
      ) : isParsing || isProcessing ? (
        <ToolSkeletonLoader
          variant="watermark_pdf"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo={`${pageCount} PAGES`}
          statusMessage={
            progressMsg ||
            (isParsing ? "RENDERING_PDF_PREVIEW..." : "STAMPING_WATERMARK_LAYER...")
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Live Page & Watermark Overlay Preview */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono font-bold text-xs uppercase text-zinc-300 flex items-center gap-1.5">
                <Stamp className="w-4 h-4 text-sky-400" /> LIVE_WATERMARK_PREVIEW
              </span>
              {pageCount > 1 && (
                <div className="flex items-center gap-2 font-mono text-xs">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => handleChangePreviewPage(currentPage - 1)}
                    className="p-1 bg-black border border-zinc-700 rounded hover:border-white disabled:opacity-40 cursor-pointer"
                    aria-label="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-white" />
                  </button>
                  <span className="text-zinc-300 tabular-nums">
                    PAGE {currentPage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount}
                    onClick={() => handleChangePreviewPage(currentPage + 1)}
                    className="p-1 bg-black border border-zinc-700 rounded hover:border-white disabled:opacity-40 cursor-pointer"
                    aria-label="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              )}
            </div>

            <div className="bg-black border border-zinc-800 rounded-lg p-3 sm:p-4 flex items-center justify-center min-h-[260px] sm:min-h-[440px] overflow-hidden">
              <div className="relative inline-block max-w-full max-h-[260px] sm:max-h-[420px] shadow-2xl border border-zinc-700 overflow-hidden select-none">
                {pagePreviewUrl && (
                  <img
                    src={pagePreviewUrl}
                    alt={`PDF Page ${currentPage}`}
                    referrerPolicy="no-referrer"
                    className="max-h-[260px] sm:max-h-[420px] w-auto object-contain block"
                  />
                )}

                {/* Live Watermark Overlay */}
                {placementMode === "TILED" ? (
                  <div className="absolute inset-0 grid grid-cols-2 grid-rows-3 place-items-center pointer-events-none overflow-hidden p-3">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div
                        key={idx}
                        style={{
                          opacity: opacity / 100,
                          transform: `rotate(${-rotation}deg)`,
                          color: COLOR_MAP[colorPreset].hex,
                          fontSize: `${Math.max(12, Math.round(fontSize * 0.34))}px`,
                        }}
                        className="font-sans font-extrabold uppercase tracking-wider whitespace-nowrap"
                      >
                        {mode === "TEXT" ? (
                          watermarkText || "CONFIDENTIAL"
                        ) : logoDataUrl ? (
                          <img
                            src={logoDataUrl}
                            alt="Watermark tile"
                            className="max-w-[90px] max-h-[50px] object-contain"
                          />
                        ) : (
                          "LOGO"
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className={`absolute inset-0 flex pointer-events-none overflow-hidden ${getPreviewAlignmentClasses(
                      anchor
                    )}`}
                  >
                    {mode === "TEXT" ? (
                      <div
                        style={{
                          opacity: opacity / 100,
                          transform: `rotate(${-rotation}deg)`,
                          color: COLOR_MAP[colorPreset].hex,
                          fontSize: `${Math.max(14, Math.round(fontSize * 0.48))}px`,
                        }}
                        className="font-sans font-extrabold uppercase tracking-wider whitespace-nowrap"
                      >
                        {watermarkText || "CONFIDENTIAL"}
                      </div>
                    ) : logoDataUrl ? (
                      <img
                        src={logoDataUrl}
                        alt="Watermark logo preview"
                        style={{
                          opacity: opacity / 100,
                          transform: `rotate(${-rotation}deg)`,
                          width: `${logoScalePct}%`,
                        }}
                        className="object-contain"
                      />
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono tabular-nums">
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">TOTAL_PAGES</span>
                <strong className="text-sky-400">{pageCount}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">OPACITY</span>
                <strong className="text-emerald-400">{opacity}%</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">ROTATION</span>
                <strong className="text-amber-400">{rotation}°</strong>
              </div>
            </div>
          </div>

          {/* Right: Watermark Controls */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4 text-sky-400" /> WATERMARK_PARAMS.CFG
                </h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                >
                  [CHANGE_FILE]
                </button>
              </div>

              {/* Watermark Type Toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("TEXT")}
                  className={`py-2 px-3 rounded-lg font-mono text-xs font-bold uppercase border-2 flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    mode === "TEXT"
                      ? "bg-white text-black border-white"
                      : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <TypeIcon className="w-3.5 h-3.5" /> TEXT STAMP
                </button>
                <button
                  type="button"
                  onClick={() => setMode("IMAGE")}
                  className={`py-2 px-3 rounded-lg font-mono text-xs font-bold uppercase border-2 flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    mode === "IMAGE"
                      ? "bg-white text-black border-white"
                      : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" /> IMAGE / LOGO
                </button>
              </div>

              {mode === "TEXT" ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono font-bold uppercase text-zinc-300 mb-1">
                      WATERMARK TEXT:
                    </label>
                    <input
                      type="text"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      placeholder="CONFIDENTIAL"
                      className="w-full p-2.5 bg-black border-2 border-zinc-700 text-white rounded-lg text-xs font-mono focus:border-white focus:outline-none"
                    />
                  </div>

                  {/* Color & Font Size */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-mono font-bold uppercase text-zinc-300 mb-1">
                        STAMP COLOR:
                      </label>
                      <div className="flex items-center gap-1.5">
                        {(Object.keys(COLOR_MAP) as WatermarkColorPreset[]).map((ck) => (
                          <button
                            key={ck}
                            type="button"
                            onClick={() => setColorPreset(ck)}
                            title={COLOR_MAP[ck].label}
                            style={{ backgroundColor: COLOR_MAP[ck].hex }}
                            className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform ${
                              colorPreset === ck
                                ? "border-white scale-110"
                                : "border-zinc-700 opacity-70"
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono font-bold uppercase text-zinc-300 mb-1">
                        FONT SIZE: {fontSize}PT
                      </label>
                      <input
                        type="range"
                        min={20}
                        max={96}
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        className="w-full accent-white cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="file"
                    ref={logoInputRef}
                    accept="image/png,image/jpeg"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadLogo(f);
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="w-full py-2.5 px-3 bg-black border-2 border-dashed border-zinc-700 hover:border-white rounded-lg text-xs font-mono text-zinc-200 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{logoDataUrl ? "CHANGE LOGO IMAGE" : "UPLOAD PNG / JPG LOGO"}</span>
                  </button>
                  <div>
                    <label className="block text-[11px] font-mono font-bold uppercase text-zinc-300 mb-1">
                      LOGO SCALE: {logoScalePct}% OF PAGE WIDTH
                    </label>
                    <input
                      type="range"
                      min={12}
                      max={80}
                      value={logoScalePct}
                      onChange={(e) => setLogoScalePct(Number(e.target.value))}
                      className="w-full accent-white cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Opacity & Rotation */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono font-bold uppercase text-zinc-300 mb-1">
                    OPACITY: {opacity}%
                  </label>
                  <input
                    type="range"
                    min={8}
                    max={95}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full accent-white cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-bold uppercase text-zinc-300 mb-1">
                    ROTATION: {rotation}°
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {[-45, 0, 45, -90].map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => setRotation(deg)}
                        className={`py-1 rounded font-mono text-[10px] font-bold border cursor-pointer ${
                          rotation === deg
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-400 border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Placement Mode & 9-Point Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase text-zinc-300">
                    PLACEMENT PATTERN:
                  </span>
                  <div className="flex gap-1.5">
                    {(["SINGLE", "TILED"] as PlacementMode[]).map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setPlacementMode(pm)}
                        className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold uppercase border cursor-pointer flex items-center gap-1 ${
                          placementMode === pm
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-400 border-zinc-800"
                        }`}
                      >
                        {pm === "TILED" && <Grid className="w-3 h-3" />}
                        {pm === "SINGLE" ? "SINGLE" : "TILED GRID"}
                      </button>
                    ))}
                  </div>
                </div>

                {placementMode === "SINGLE" && (
                  <div className="grid grid-cols-3 gap-1.5 bg-black border border-zinc-800 p-2 rounded-lg">
                    {POSITION_GRID.map((pos) => (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => setAnchor(pos.id)}
                        className={`py-1.5 rounded font-mono text-[10px] font-bold uppercase border cursor-pointer ${
                          anchor === pos.id
                            ? "bg-white text-black border-white"
                            : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Page Scope */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono font-bold uppercase text-zinc-300">
                  TARGET PAGES:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { key: "ALL_PAGES", label: "ALL PAGES" },
                      { key: "FIRST_PAGE", label: "FIRST ONLY" },
                      { key: "CUSTOM_RANGE", label: "RANGE" },
                    ] as const
                  ).map((sc) => (
                    <button
                      key={sc.key}
                      type="button"
                      onClick={() => setPageScope(sc.key)}
                      className={`py-1.5 px-2 rounded-lg font-mono text-[10px] font-bold uppercase border-2 cursor-pointer ${
                        pageScope === sc.key
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
                {pageScope === "CUSTOM_RANGE" && (
                  <input
                    type="text"
                    value={customRange}
                    onChange={(e) => setCustomRange(e.target.value)}
                    placeholder="e.g. 1-3, 5"
                    className="w-full p-2 bg-black border border-zinc-700 text-white rounded text-xs font-mono"
                  />
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleStampWatermark}
              disabled={isProcessing}
              aria-label="Apply Watermark to PDF Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>STAMP WATERMARK ON PDF NOW</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
