/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  Presentation,
  FolderOpen,
  Zap,
  Layers,
  Camera,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";
import ModuleIconBadge from "./ModuleIconBadge";
import {
  parseAndRenderPptxDeck,
  ParsedPresentationDeck,
  RenderedSlideScreenshot,
  ScreenshotDpiPreset,
  ScreenshotFormat,
} from "../utils/pptxSlideRenderer";

interface PptToPdfViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
}

type PdfPageLayoutMode = "NATIVE_FULL_BLEED" | "A4_LANDSCAPE" | "A4_HANDOUT_2UP";

function normalizeTextForPdf(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, "  ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

export default function PptToPdfView({ onSuccess, initialFile }: PptToPdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [deck, setDeck] = useState<ParsedPresentationDeck | null>(null);
  const [slides, setSlides] = useState<RenderedSlideScreenshot[]>([]);
  const [activeSlideIdx, setActiveSlideIdx] = useState<number>(0);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Screenshot-to-PDF Configuration
  const [dpiPreset, setDpiPreset] = useState<ScreenshotDpiPreset>("FULL_HD");
  const [renderedDpi, setRenderedDpi] = useState<ScreenshotDpiPreset>("FULL_HD");
  const [screenshotFormat, setScreenshotFormat] = useState<ScreenshotFormat>("JPEG_95");
  const [renderedFormat, setRenderedFormat] = useState<ScreenshotFormat>("JPEG_95");
  const [pageLayout, setPageLayout] = useState<PdfPageLayoutMode>("NATIVE_FULL_BLEED");
  const [includeHandoutNotes, setIncludeHandoutNotes] = useState<boolean>(true);

  const handleLoadPptFile = useCallback(
    async (selected: File) => {
      const lower = selected.name.toLowerCase();
      if (!lower.endsWith(".pptx")) {
        showToast("Please select a valid PowerPoint (.pptx) presentation file.", "error");
        return;
      }

      setFile(selected);
      setIsParsing(true);
      setProgressMsg("CAPTURING_SLIDE_SCREENSHOTS...");

      try {
        await yieldFrame();
        const parsedDeck = await parseAndRenderPptxDeck(
          selected,
          "FULL_HD",
          "JPEG_95",
          (slideNum, total) => {
            setProgressMsg(`CAPTURING_SLIDE_SCREENSHOT_${slideNum}_OF_${total}...`);
          }
        );
        setDeck(parsedDeck);
        setSlides(parsedDeck.slides);
        setRenderedDpi("FULL_HD");
        setRenderedFormat("JPEG_95");
        setActiveSlideIdx(0);
      } catch (err: any) {
        logger.error("PPTX screenshot rendering failed:", err);
        showToast(`Could not render PowerPoint file: ${err?.message || err}`, "error");
        setFile(null);
        setDeck(null);
        setSlides([]);
      } finally {
        setIsParsing(false);
        setProgressMsg("");
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (initialFile) {
      handleLoadPptFile(initialFile);
    }
  }, [initialFile, handleLoadPptFile]);

  useEffect(() => {
    return registerDropHandler((droppedFiles) => {
      if (droppedFiles.length > 0) {
        handleLoadPptFile(droppedFiles[0]);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, handleLoadPptFile]);

  const stats = useMemo(() => {
    let totalShapes = 0;
    let totalImages = 0;
    let slidesWithNotes = 0;
    for (const s of slides) {
      totalShapes += s.shapeCount;
      totalImages += s.imageCount;
      if (s.notes) slidesWithNotes++;
    }
    return {
      slideCount: slides.length,
      totalShapes,
      totalImages,
      slidesWithNotes,
    };
  }, [slides]);

  const activeSlide = slides[activeSlideIdx] || slides[0] || null;

  const handleReset = () => {
    setFile(null);
    setDeck(null);
    setSlides([]);
    setActiveSlideIdx(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConvertToPdf = async () => {
    if (!file || !deck || slides.length === 0) return;

    setIsProcessing(true);
    setProgressMsg("PREPARING_SLIDE_SCREENSHOTS...");

    try {
      await yieldFrame();

      let targetSlides = slides;
      if (dpiPreset !== renderedDpi || screenshotFormat !== renderedFormat) {
        targetSlides = await deck.reRenderAtOptions(
          dpiPreset,
          screenshotFormat,
          (slideNum, total) => {
            setProgressMsg(`CAPTURING_HIGH_DPI_SLIDE_${slideNum}_OF_${total}...`);
          }
        );
        setSlides(targetSlides);
        setRenderedDpi(dpiPreset);
        setRenderedFormat(screenshotFormat);
      }

      const pdfDoc = await PDFDocument.create();

      if (pageLayout === "A4_HANDOUT_2UP") {
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const pageW = 595.28;
        const pageH = 841.89;
        const margin = 36;
        const maxBoxW = pageW - margin * 2;
        const maxBoxH = 330;

        for (let i = 0; i < targetSlides.length; i += 2) {
          setProgressMsg(
            `EMBEDDING_HANDOUT_PAGE_${Math.floor(i / 2) + 1}_OF_${Math.ceil(
              targetSlides.length / 2
            )}...`
          );
          await yieldFrame();

          const page = pdfDoc.addPage([pageW, pageH]);
          const pair = [targetSlides[i], targetSlides[i + 1]].filter(Boolean);

          for (let pIdx = 0; pIdx < pair.length; pIdx++) {
            const sl = pair[pIdx];
            const slotTopY = pIdx === 0 ? pageH - margin : pageH / 2 - 12;

            const embeddedImg =
              sl.mimeType === "image/png"
                ? await pdfDoc.embedPng(sl.screenshotBytes)
                : await pdfDoc.embedJpg(sl.screenshotBytes);

            const scale = Math.min(
              maxBoxW / Math.max(1, embeddedImg.width),
              maxBoxH / Math.max(1, embeddedImg.height)
            );
            const drawW = embeddedImg.width * scale;
            const drawH = embeddedImg.height * scale;
            const drawX = margin + (maxBoxW - drawW) / 2;
            const drawY = slotTopY - drawH;

            page.drawImage(embeddedImg, {
              x: drawX,
              y: drawY,
              width: drawW,
              height: drawH,
            });

            page.drawRectangle({
              x: drawX,
              y: drawY,
              width: drawW,
              height: drawH,
              borderColor: rgb(0.78, 0.8, 0.84),
              borderWidth: 0.75,
            });

            if (includeHandoutNotes && sl.notes) {
              const cleanNote = normalizeTextForPdf(sl.notes).slice(0, 110);
              page.drawText(`Slide ${sl.slideNumber}: ${cleanNote}`, {
                x: drawX,
                y: drawY - 14,
                size: 8.5,
                font: fontRegular,
                color: rgb(0.3, 0.32, 0.36),
              });
            } else {
              page.drawText(`Slide ${sl.slideNumber}`, {
                x: drawX,
                y: drawY - 13,
                size: 8,
                font: fontBold,
                color: rgb(0.45, 0.47, 0.5),
              });
            }
          }
        }
      } else if (pageLayout === "A4_LANDSCAPE") {
        const pageW = 841.89;
        const pageH = 595.28;

        for (let i = 0; i < targetSlides.length; i++) {
          const sl = targetSlides[i];
          setProgressMsg(`EMBEDDING_SLIDE_SCREENSHOT_${i + 1}_OF_${targetSlides.length}...`);
          await yieldFrame();

          const embeddedImg =
            sl.mimeType === "image/png"
              ? await pdfDoc.embedPng(sl.screenshotBytes)
              : await pdfDoc.embedJpg(sl.screenshotBytes);

          const page = pdfDoc.addPage([pageW, pageH]);
          const scale = Math.min(
            pageW / Math.max(1, embeddedImg.width),
            pageH / Math.max(1, embeddedImg.height)
          );
          const drawW = embeddedImg.width * scale;
          const drawH = embeddedImg.height * scale;
          const drawX = (pageW - drawW) / 2;
          const drawY = (pageH - drawH) / 2;

          page.drawImage(embeddedImg, {
            x: drawX,
            y: drawY,
            width: drawW,
            height: drawH,
          });
        }
      } else {
        // NATIVE_FULL_BLEED: Exact PowerPoint slide aspect ratio, 100% edge-to-edge screenshot per page
        const pageHeightPt = 540;
        const pageWidthPt = Math.round(pageHeightPt * deck.aspectRatio * 100) / 100;

        for (let i = 0; i < targetSlides.length; i++) {
          const sl = targetSlides[i];
          setProgressMsg(`EMBEDDING_SLIDE_SCREENSHOT_${i + 1}_OF_${targetSlides.length}...`);
          await yieldFrame();

          const embeddedImg =
            sl.mimeType === "image/png"
              ? await pdfDoc.embedPng(sl.screenshotBytes)
              : await pdfDoc.embedJpg(sl.screenshotBytes);

          const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
          page.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: pageWidthPt,
            height: pageHeightPt,
          });
        }
      }

      setProgressMsg("SAVING_PDF_PRESENTATION...");
      const pdfBytes = await pdfDoc.save({
        useObjectStreams: true,
        objectsPerTick: Infinity,
      });

      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));

      await saveFile("ppt_to_pdf", {
        blob: pdfBlob,
        filename: `${cleanName}_monotranscoder`,
        size: pdfBlob.size,
        format: "application/pdf",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast(
        `Captured ${targetSlides.length} slide screenshot(s) and compiled PDF successfully.`,
        "success"
      );
      onSuccess();
    } catch (err: any) {
      logger.error("PPTX to PDF error:", err);
      showToast(`Failed to convert PowerPoint to PDF: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="ppt-to-pdf-view"
      aria-labelledby="ppt-to-pdf-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="ppt-to-pdf-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            POWERPOINT TO PDF CONVERTER // PPT_TO_PDF.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Renders every PowerPoint (.pptx) slide as a high-definition visual screenshot and compiles them into a full-bleed PDF deck.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="ppt-to-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PowerPoint file to convert to PDF"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              handleLoadPptFile(e.dataTransfer.files[0]);
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
              if (f) handleLoadPptFile(f);
            }}
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="hidden"
            aria-label="Select PowerPoint File"
          />
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="ppt_to_pdf" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE POWERPOINT DECK (.PPTX)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Captures pixel-accurate slide screenshots (backgrounds, shapes, images, tables, typography) and builds a PDF locally.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
          >
            SELECT_PPTX_FILE
          </button>
        </div>
      ) : isParsing || isProcessing ? (
        <ToolSkeletonLoader
          variant="ppt_to_pdf"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo={`${slides.length || "..."} SLIDE SCREENSHOTS`}
          statusMessage={
            progressMsg ||
            (isParsing
              ? "CAPTURING_SLIDE_SCREENSHOTS..."
              : "EMBEDDING_SLIDE_SCREENSHOTS_INTO_PDF...")
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Live Slide Screenshot Viewer + Filmstrip */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono font-bold text-xs uppercase text-zinc-300 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-orange-400" /> SLIDE_SCREENSHOT_PREVIEW
              </span>
              {slides.length > 1 && (
                <div className="flex items-center gap-2 font-mono text-xs">
                  <button
                    type="button"
                    disabled={activeSlideIdx <= 0}
                    onClick={() => setActiveSlideIdx((p) => Math.max(0, p - 1))}
                    className="p-1 border border-zinc-700 rounded hover:border-white disabled:opacity-40 cursor-pointer text-white"
                    aria-label="Previous slide screenshot"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-zinc-300 tabular-nums">
                    SLIDE {activeSlideIdx + 1} / {slides.length}
                  </span>
                  <button
                    type="button"
                    disabled={activeSlideIdx >= slides.length - 1}
                    onClick={() =>
                      setActiveSlideIdx((p) => Math.min(slides.length - 1, p + 1))
                    }
                    className="p-1 border border-zinc-700 rounded hover:border-white disabled:opacity-40 cursor-pointer text-white"
                    aria-label="Next slide screenshot"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Active Slide High-Res Screenshot Canvas Preview */}
            {activeSlide && (
              <div className="bg-black border border-zinc-800 rounded-lg p-3 flex flex-col items-center justify-center">
                <div className="relative w-full flex items-center justify-center overflow-hidden rounded border border-zinc-700 shadow-2xl bg-zinc-900">
                  <img
                    src={activeSlide.screenshotDataUrl}
                    alt={`Slide ${activeSlide.slideNumber} screenshot`}
                    referrerPolicy="no-referrer"
                    className="w-full h-auto max-h-[320px] object-contain block"
                  />
                  <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/80 border border-zinc-700 rounded text-[10px] font-mono font-bold text-orange-400">
                    SLIDE #{activeSlide.slideNumber} · {activeSlide.widthPx}×{activeSlide.heightPx}PX
                  </span>
                </div>
              </div>
            )}

            {/* All Slide Screenshots Thumbnail Grid */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 uppercase">
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-orange-400" /> ALL CAPTURED SLIDES ({slides.length})
                </span>
                <span>CLICK ANY SLIDE TO INSPECT</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-[180px] overflow-y-auto pr-1 pt-1">
                {slides.map((sl, idx) => {
                  const isSelected = idx === activeSlideIdx;
                  return (
                    <button
                      key={sl.slideNumber}
                      type="button"
                      onClick={() => setActiveSlideIdx(idx)}
                      className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer text-left bg-black ${
                        isSelected
                          ? "border-orange-400 ring-1 ring-orange-400/50"
                          : "border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      <img
                        src={sl.screenshotDataUrl}
                        alt={`Slide ${sl.slideNumber} thumbnail`}
                        referrerPolicy="no-referrer"
                        className="w-full h-auto object-contain block"
                      />
                      <div className="px-1.5 py-1 bg-zinc-950/90 border-t border-zinc-800 flex items-center justify-between text-[10px] font-mono">
                        <span
                          className={
                            isSelected ? "text-orange-400 font-bold" : "text-zinc-400"
                          }
                        >
                          #{sl.slideNumber}
                        </span>
                        <span className="text-zinc-500 truncate max-w-[70px]">
                          {sl.title}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono tabular-nums">
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">SLIDES</span>
                <strong className="text-orange-400">{stats.slideCount}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">SHAPES_RENDERED</span>
                <strong className="text-emerald-400">{stats.totalShapes}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">EMBEDDED_MEDIA</span>
                <strong className="text-violet-400">{stats.totalImages}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">SPEAKER_NOTES</span>
                <strong className="text-sky-400 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> {stats.slidesWithNotes}
                </strong>
              </div>
            </div>
          </div>

          {/* Right: Screenshot-to-PDF Export Controls */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4 text-orange-400" /> SCREENSHOT_TO_PDF.CFG
                </h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                >
                  [CHANGE_FILE]
                </button>
              </div>

              <div className="bg-black border border-zinc-800 p-3.5 rounded-lg space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-400">SOURCE_DECK:</span>
                  <strong
                    className="text-emerald-400 truncate max-w-[180px]"
                    title={file.name}
                  >
                    {file.name}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">CAPTURE_ENGINE:</span>
                  <strong className="text-orange-400">FULL SLIDE SCREENSHOT</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">SOURCE_SIZE:</span>
                  <strong className="text-amber-400 tabular-nums">
                    {formatBytes(file.size)}
                  </strong>
                </div>
              </div>

              {/* Screenshot Resolution / DPI */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  SCREENSHOT RESOLUTION (DPI):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: "STANDARD_HD", label: "720P STD" },
                      { key: "FULL_HD", label: "1080P HD" },
                      { key: "ULTRA_HD", label: "2.4K ULTRA" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setDpiPreset(item.key)}
                      className={`py-2 px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                        dpiPreset === item.key
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* PDF Page Fit Mode */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  PDF PAGE FIT MODE:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: "NATIVE_FULL_BLEED", label: "FULL BLEED" },
                      { key: "A4_LANDSCAPE", label: "A4 LANDSCAPE" },
                      { key: "A4_HANDOUT_2UP", label: "A4 2-UP" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setPageLayout(item.key)}
                      className={`py-2 px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                        pageLayout === item.key
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Screenshot Image Encoding */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  SCREENSHOT ENCODING:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: "JPEG_95", label: "CRISP JPEG (95%)" },
                      { key: "PNG_LOSSLESS", label: "LOSSLESS PNG" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setScreenshotFormat(item.key)}
                      className={`py-2 px-2.5 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                        screenshotFormat === item.key
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {pageLayout === "A4_HANDOUT_2UP" && (
                <div className="bg-black border border-zinc-800 rounded-lg p-3 text-xs font-mono">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-zinc-300">INCLUDE SPEAKER NOTES BELOW SLIDES</span>
                    <input
                      type="checkbox"
                      checked={includeHandoutNotes}
                      onChange={(e) => setIncludeHandoutNotes(e.target.checked)}
                      className="accent-white w-4 h-4 cursor-pointer"
                    />
                  </label>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleConvertToPdf}
              disabled={isProcessing}
              aria-label="Convert PowerPoint Screenshots to PDF Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>CONVERT POWERPOINT TO PDF NOW</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
