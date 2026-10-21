/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Cpu, FileText, Image as ImageIcon, Layers, Sparkles, ShieldCheck, PenTool, Stamp, CheckCircle2, Lock } from "lucide-react";

export type SkeletonVariant =
  | "compress_img"
  | "convert_img"
  | "compress_pdf"
  | "image_to_pdf"
  | "merge_pdf"
  | "pdf_to_images"
  | "remove_pdf_pages"
  | "organize_pdf"
  | "word_to_pdf"
  | "word_to_jpg"
  | "pdf_to_word"
  | "excel_to_pdf"
  | "ppt_to_pdf"
  | "pdf_to_ppt"
  | "pdf_to_excel"
  | "watermark_pdf"
  | "lock_pdf"
  | "unlock_pdf"
  | "sign_pdf"
  | "passport_photo"
  | "download_desk";

interface ToolSkeletonLoaderProps {
  variant: SkeletonVariant;
  fileName?: string;
  fileSize?: string;
  fileCount?: number;
  statusMessage?: string;
  targetInfo?: string;
}

const VARIANT_META: Record<
  SkeletonVariant,
  {
    headerTitle: string;
    operationTag: string;
    steps: string[];
    icon: React.ReactNode;
  }
> = {
  compress_img: {
    headerTitle: "QUANTIZING_IMAGE_BITSTREAM.EXE",
    operationTag: "CANVAS_OPTIMIZER",
    steps: [
      "Decoding source pixel matrix in RAM",
      "Stripping EXIF & GPS metadata headers",
      "Running binary-search quality quantization",
      "Packing compressed output blob"
    ],
    icon: <ImageIcon className="w-4 h-4 text-amber-400 animate-pulse" />
  },
  convert_img: {
    headerTitle: "TRANSCODING_COLOR_SPACE.EXE",
    operationTag: "FORMAT_ENCODER",
    steps: [
      "Mounting source raster buffer",
      "Mapping alpha channel & color profile",
      "Encoding target MIME bitstream",
      "Verifying output integrity"
    ],
    icon: <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
  },
  compress_pdf: {
    headerTitle: "DEFLATING_PDF_OBJECT_STREAMS.EXE",
    operationTag: "FLATE_LEVEL_9",
    steps: [
      "Parsing PDF catalog & cross-reference table",
      "Pruning unused annotations & embedded scripts",
      "Re-compressing streams with Deflate Level 9",
      "Compacting indirect object structures"
    ],
    icon: <FileText className="w-4 h-4 text-sky-400 animate-pulse" />
  },
  image_to_pdf: {
    headerTitle: "ASSEMBLING_PDF_DOCUMENT.EXE",
    operationTag: "PAGE_COMPILER",
    steps: [
      "Normalizing image dimensions & rotation",
      "Computing page bounding boxes & margins",
      "Embedding raster streams into PDF pages",
      "Serializing unified PDF binary"
    ],
    icon: <Layers className="w-4 h-4 text-cyan-400 animate-pulse" />
  },
  merge_pdf: {
    headerTitle: "MERGING_PDF_STREAMS.EXE",
    operationTag: "DOCUMENT_JOINER",
    steps: [
      "Reading source PDF array buffers",
      "Resolving page trees & font dictionaries",
      "Appending sequential page nodes",
      "Writing consolidated cross-reference table"
    ],
    icon: <Layers className="w-4 h-4 text-blue-400 animate-pulse" />
  },
  pdf_to_images: {
    headerTitle: "RASTERIZING_PDF_PAGES.EXE",
    operationTag: "HIGH_DPI_RENDERER",
    steps: [
      "Initializing local PDF.js worker pipeline",
      "Rendering vector paths & embedded fonts to canvas",
      "Encoding high-resolution JPEG page bitmaps",
      "Packaging extracted image archive"
    ],
    icon: <ImageIcon className="w-4 h-4 text-fuchsia-400 animate-pulse" />
  },
  remove_pdf_pages: {
    headerTitle: "PRUNING_PDF_PAGE_TREE.EXE",
    operationTag: "PAGE_EXTRACTOR",
    steps: [
      "Parsing source PDF page tree & catalog",
      "Filtering out selected page indices",
      "Copying retained vector & font streams",
      "Rebuilding compact cross-reference table"
    ],
    icon: <FileText className="w-4 h-4 text-rose-400 animate-pulse" />
  },
  organize_pdf: {
    headerTitle: "SEQUENCING_PDF_PAGE_NODES.EXE",
    operationTag: "PAGE_ORGANIZER",
    steps: [
      "Mapping reordered page sequence & rotations",
      "Cloning vector page streams & resources",
      "Applying page orientation transforms",
      "Serializing organized PDF document"
    ],
    icon: <Layers className="w-4 h-4 text-indigo-400 animate-pulse" />
  },
  word_to_pdf: {
    headerTitle: "COMPILING_DOCX_TO_PDF.EXE",
    operationTag: "OPENXML_TYPESETTER",
    steps: [
      "Unpacking DOCX OpenXML archive in local RAM",
      "Parsing document.xml paragraphs & styles",
      "Typesetting paginated layout & margins",
      "Serializing vector PDF output stream"
    ],
    icon: <FileText className="w-4 h-4 text-teal-400 animate-pulse" />
  },
  word_to_jpg: {
    headerTitle: "RASTERIZING_DOCX_TO_JPEG.EXE",
    operationTag: "CANVAS_PAGE_RENDERER",
    steps: [
      "Unpacking DOCX OpenXML archive in local RAM",
      "Typesetting paragraphs, tables & embedded media",
      "Rendering high-DPI page canvases",
      "Encoding JPEG bitstreams"
    ],
    icon: <ImageIcon className="w-4 h-4 text-amber-400 animate-pulse" />
  },
  pdf_to_word: {
    headerTitle: "EXTRACTING_PDF_TO_DOCX.EXE",
    operationTag: "DOCX_BUILDER",
    steps: [
      "Scanning PDF page text matrices & coordinates",
      "Reconstructing paragraphs & heading hierarchy",
      "Generating OpenXML word/document.xml nodes",
      "Packing compliant .DOCX archive in RAM"
    ],
    icon: <FileText className="w-4 h-4 text-emerald-400 animate-pulse" />
  },
  sign_pdf: {
    headerTitle: "STAMPING_PDF_SIGNATURE_LAYER.EXE",
    operationTag: "DIGITAL_INK_ENGINE",
    steps: [
      "Calibrating page geometry & coordinate matrix in RAM",
      "Rasterizing high-DPI transparent ink layer",
      "Embedding vector appearance stream into PDF pages",
      "Serializing signed PDF binary in local browser memory"
    ],
    icon: <PenTool className="w-4 h-4 text-emerald-400 animate-pulse" />
  },
  passport_photo: {
    headerTitle: "RENDERING_PASSPORT_BIOMETRIC.EXE",
    operationTag: "PASSPORT_STUDIO",
    steps: [
      "Isolating portrait subject & stripping background",
      "Compositing solid passport backdrop & formal attire layer",
      "Calibrating 300 DPI biometric dimensions",
      "Encoding lossless PNG passport output in RAM"
    ],
    icon: <ShieldCheck className="w-4 h-4 text-rose-400 animate-pulse" />
  },
  excel_to_pdf: {
    headerTitle: "COMPILING_XLSX_TO_PDF.EXE",
    operationTag: "SPREADSHEET_TYPESETTER",
    steps: [
      "Unpacking XLSX OpenXML workbook & shared strings in RAM",
      "Calculating column proportions & grid geometry",
      "Typesetting paginated spreadsheet tables & headers",
      "Serializing vector PDF output stream"
    ],
    icon: <FileText className="w-4 h-4 text-emerald-400 animate-pulse" />
  },
  ppt_to_pdf: {
    headerTitle: "COMPILING_PPTX_TO_PDF.EXE",
    operationTag: "SLIDE_DECK_RENDERER",
    steps: [
      "Unpacking PPTX OpenXML presentation archive in RAM",
      "Parsing slide XML trees, typography & embedded media",
      "Rendering widescreen slide frames & speaker notes",
      "Serializing paginated PDF slide deck"
    ],
    icon: <Layers className="w-4 h-4 text-orange-400 animate-pulse" />
  },
  pdf_to_ppt: {
    headerTitle: "EXTRACTING_PDF_TO_PPTX.EXE",
    operationTag: "PPTX_DECK_BUILDER",
    steps: [
      "Rendering high-DPI PDF page canvases & text layers",
      "Constructing OpenXML presentation & slide masters",
      "Embedding slide backgrounds & editable text frames",
      "Packing compliant .PPTX archive in local RAM"
    ],
    icon: <Layers className="w-4 h-4 text-amber-400 animate-pulse" />
  },
  pdf_to_excel: {
    headerTitle: "EXTRACTING_PDF_TO_XLSX.EXE",
    operationTag: "SPATIAL_GRID_SCANNER",
    steps: [
      "Scanning PDF page text matrices & X/Y coordinates",
      "Clustering rows & aligning tabular columns",
      "Generating OpenXML worksheet & shared string nodes",
      "Packing compliant .XLSX workbook in local RAM"
    ],
    icon: <FileText className="w-4 h-4 text-teal-400 animate-pulse" />
  },
  watermark_pdf: {
    headerTitle: "STAMPING_PDF_WATERMARK.EXE",
    operationTag: "WATERMARK_ENGINE",
    steps: [
      "Loading source PDF page tree & bounding boxes",
      "Computing watermark rotation, opacity & tile grid",
      "Stamping vector/raster watermark across target pages",
      "Serializing watermarked PDF in browser memory"
    ],
    icon: <Stamp className="w-4 h-4 text-sky-400 animate-pulse" />
  },
  lock_pdf: {
    headerTitle: "ENCRYPTING_PDF_SECURITY_HANDLER.EXE",
    operationTag: "RC4_128_CIPHER",
    steps: [
      "Normalizing PDF cross-reference object tree",
      "Deriving 128-bit MD5/RC4 User & Owner encryption keys",
      "Encrypting indirect streams, strings & permission flags",
      "Serializing password-protected PDF binary"
    ],
    icon: <Lock className="w-4 h-4 text-amber-400 animate-pulse" />
  },
  unlock_pdf: {
    headerTitle: "DECRYPTING_PDF_SECURITY_HANDLER.EXE",
    operationTag: "UNLOCK_ENGINE",
    steps: [
      "Authenticating PDF security handler & password key",
      "Stripping Owner/User encryption & permission bitmasks",
      "Reconstructing unencrypted page streams in local RAM",
      "Serializing unlocked PDF binary"
    ],
    icon: <ShieldCheck className="w-4 h-4 text-emerald-400 animate-pulse" />
  },
  download_desk: {
    headerTitle: "MOUNTING_OUTPUT_BUFFER.EXE",
    operationTag: "MEMORY_DESK",
    steps: [
      "Retrieving processed blob from ephemeral RAM",
      "Computing byte savings & compression metrics",
      "Generating tracked local Object URL"
    ],
    icon: <Cpu className="w-4 h-4 text-emerald-400 animate-pulse" />
  }
};

const ToolSkeletonLoader = React.memo(function ToolSkeletonLoader({
  variant,
  fileName,
  fileSize,
  fileCount,
  statusMessage,
  targetInfo
}: ToolSkeletonLoaderProps) {
  const meta = VARIANT_META[variant];

  if (variant === "download_desk") {
    return (
      <div
        className="max-w-3xl mx-auto space-y-6 animate-fade-in"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Preparing processed file for download"
      >
        <div className="border-b-2 border-zinc-800 pb-4 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-72 bg-zinc-800/80 rounded animate-pulse" />
            <div className="h-3.5 w-96 max-w-full bg-zinc-900 rounded animate-pulse" />
          </div>
        </div>

        <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center gap-4 pb-6 border-b border-zinc-800">
            <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 animate-pulse shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-48 bg-zinc-800 rounded animate-pulse" />
              <div className="h-3.5 w-64 bg-zinc-900 rounded animate-pulse" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-black border border-zinc-800/80 p-3.5 rounded-lg space-y-2">
                <div className="h-2.5 w-16 bg-zinc-900 rounded animate-pulse" />
                <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse" />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="h-3 w-36 bg-zinc-900 rounded animate-pulse" />
            <div className="h-10 w-full bg-black border border-zinc-800 rounded-lg animate-pulse" />
          </div>

          <div className="h-12 w-full bg-zinc-800/70 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full space-y-6 animate-fade-in"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`Processing ${fileName || "files"} in local memory`}
    >
      {/* Top Terminal Status Bar */}
      <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-zinc-900 border-b-2 border-zinc-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 font-mono text-xs font-bold text-white">
            {meta.icon}
            <span>{meta.headerTitle}</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-400">
            <span>{meta.operationTag}</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400 flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ACTIVE_IN_RAM
            </span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* File Metadata & Active Progress Skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black border border-zinc-800/90 rounded-lg p-4">
            <div className="space-y-1.5 min-w-0">
              <div className="text-[10px] font-mono uppercase text-zinc-500">
                SOURCE_BUFFER_TARGET
              </div>
              <div className="font-mono text-xs font-bold text-emerald-400 truncate max-w-md">
                {fileName || (fileCount ? `${fileCount} QUEUED_FILES_IN_BUFFER` : "LOCAL_STREAM_BUFFER.DAT")}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono shrink-0">
              {fileSize && (
                <div>
                  <span className="text-zinc-500 text-[10px] block uppercase">INPUT_SIZE</span>
                  <span className="text-amber-400 font-bold">{fileSize}</span>
                </div>
              )}
              {targetInfo && (
                <>
                  <span className="text-zinc-700" aria-hidden="true">/</span>
                  <div>
                    <span className="text-zinc-500 text-[10px] block uppercase">TARGET_SPEC</span>
                    <span className="text-sky-400 font-bold">{targetInfo}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Tool-Specific Visual Skeleton */}
          {(variant === "compress_img" || variant === "convert_img") && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left: Image Viewport Skeleton */}
              <div className="lg:col-span-7 bg-black border border-zinc-800 rounded-xl p-5 flex flex-col justify-between min-h-[260px] relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                  <div className="h-3 w-36 bg-zinc-800 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-zinc-900 rounded animate-pulse" />
                </div>

                {/* Center Raster Shimmer Box */}
                <div className="my-6 mx-auto w-full max-w-sm aspect-video bg-zinc-900/70 border border-zinc-800 rounded-lg flex flex-col items-center justify-center gap-3 p-6 relative overflow-hidden">
                  <div className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-800/80 flex items-center justify-center animate-pulse">
                    <ImageIcon className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div className="h-2.5 w-32 bg-zinc-800 rounded animate-pulse" />
                  <div className="h-2 w-24 bg-zinc-800/60 rounded animate-pulse" />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-900">
                  <div className="h-6 bg-zinc-900 rounded animate-pulse" />
                  <div className="h-6 bg-zinc-900 rounded animate-pulse" />
                  <div className="h-6 bg-zinc-900 rounded animate-pulse" />
                </div>
              </div>

              {/* Right: Encoder Pipeline Steps */}
              <div className="lg:col-span-5 bg-black border border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="text-[10px] font-mono font-bold uppercase text-zinc-400 tracking-wider">
                    PIPELINE_EXECUTION_LOG
                  </div>
                  <div className="space-y-2.5">
                    {meta.steps.map((step, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 text-xs font-mono text-zinc-300 bg-zinc-950 border border-zinc-800/80 p-2.5 rounded"
                      >
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
                        <span className="truncate">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-zinc-900">
                  <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                    <span>BUFFER_ALLOCATION</span>
                    <span className="text-white font-bold">LOCAL_RAM</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                    <div className="h-full w-2/3 bg-white rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {variant === "compress_pdf" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-black border border-zinc-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
                  <span className="text-[10px] font-mono font-bold uppercase text-zinc-400">
                    PDF_OBJECT_STREAM_INSPECTOR
                  </span>
                  <span className="text-[10px] font-mono text-white animate-pulse">
                    DEFLATING...
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {["CATALOG_DICT", "XREF_STREAM", "FONT_SUBSETS", "CONTENT_STREAMS"].map((block) => (
                    <div key={block} className="p-3 bg-zinc-950 border border-zinc-800/80 rounded space-y-2">
                      <div className="text-[9px] font-mono text-zinc-500">{block}</div>
                      <div className="h-3 w-20 bg-zinc-800 rounded animate-pulse" />
                      <div className="h-1.5 w-full bg-zinc-900 rounded overflow-hidden">
                        <div className="h-full w-3/4 bg-white/80 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-black border border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  <div className="text-[10px] font-mono font-bold uppercase text-zinc-400">
                    OPTIMIZATION_STAGE
                  </div>
                  {meta.steps.map((step, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 text-xs font-mono text-zinc-300 bg-zinc-950 border border-zinc-800/80 p-2 rounded"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                      <span className="truncate">{step}</span>
                    </div>
                  ))}
                </div>

                {statusMessage && (
                  <div className="p-2.5 bg-zinc-900 border border-zinc-700 rounded text-[11px] font-mono text-white">
                    ▶ {statusMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {(variant === "image_to_pdf" || variant === "pdf_to_images" || variant === "merge_pdf" || variant === "remove_pdf_pages" || variant === "organize_pdf" || variant === "word_to_pdf" || variant === "pdf_to_word") && (
            <div className="space-y-5">
              {/* Page Grid Skeleton */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {Array.from({ length: Math.min(8, Math.max(4, fileCount || 4)) }).map((_, idx) => (
                  <div
                    key={idx}
                    className="bg-black border border-zinc-800 rounded-lg p-3 space-y-2.5 flex flex-col justify-between"
                  >
                    <div className="aspect-[3/4] bg-zinc-900/80 border border-zinc-800/90 rounded flex flex-col items-center justify-center gap-2 p-3 animate-pulse">
                      <FileText className="w-6 h-6 text-zinc-600" />
                      <div className="h-2 w-12 bg-zinc-800 rounded" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                        <span>PAGE_#{idx + 1}</span>
                        <span className="text-white">SYNC</span>
                      </div>
                      <div className="h-2 w-full bg-zinc-900 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Pipeline Steps */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {meta.steps.map((step, i) => (
                  <div
                    key={i}
                    className="bg-black border border-zinc-800 p-3 rounded-lg flex items-center gap-2 text-[11px] font-mono text-zinc-300"
                  >
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
                    <span className="truncate">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {variant === "sign_pdf" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left: Document Stamping Stage Simulation */}
              <div className="lg:col-span-7 bg-black border border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <span className="text-[11px] font-mono font-bold uppercase text-white">
                      PAGE_STAMP_STAGE // {fileCount ? `PAGE 1 OF ${fileCount}` : "PAGE_VIEWPORT"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    SCALE: 300_DPI
                  </span>
                </div>

                {/* Simulated Document Canvas with Active Signature Bounding Box */}
                <div className="relative mx-auto w-full max-w-sm aspect-[1/1.3] bg-white rounded-lg shadow-2xl p-5 overflow-hidden flex flex-col justify-between select-none">
                  {/* Faux Document Header Lines */}
                  <div className="space-y-2 opacity-35">
                    <div className="h-3 w-28 bg-zinc-800 rounded" />
                    <div className="h-2 w-full bg-zinc-300 rounded" />
                    <div className="h-2 w-5/6 bg-zinc-300 rounded" />
                    <div className="h-2 w-4/6 bg-zinc-300 rounded" />
                  </div>

                  {/* Faux Document Body Lines */}
                  <div className="space-y-1.5 opacity-25 my-auto">
                    <div className="h-1.5 w-full bg-zinc-400 rounded" />
                    <div className="h-1.5 w-full bg-zinc-400 rounded" />
                    <div className="h-1.5 w-11/12 bg-zinc-400 rounded" />
                    <div className="h-1.5 w-4/5 bg-zinc-400 rounded" />
                    <div className="h-1.5 w-full bg-zinc-400 rounded" />
                    <div className="h-1.5 w-3/4 bg-zinc-400 rounded" />
                  </div>

                  {/* Active Digital Ink Signature Stamping Target Box */}
                  <div className="border-2 border-dashed border-zinc-900 bg-zinc-900/5 rounded-lg p-3 relative space-y-2">
                    <div className="flex items-center justify-between text-[9px] font-mono font-bold uppercase text-zinc-600">
                      <span className="flex items-center gap-1 text-emerald-700">
                        <PenTool className="w-2.5 h-2.5 text-emerald-700" />
                        SIGNATURE_INK_LAYER
                      </span>
                      <span className="tabular-nums font-bold text-amber-700">
                        P.1 [X:74% Y:84%]
                      </span>
                    </div>

                    {/* Animated Signature Ink Vector */}
                    <div className="h-10 w-full flex items-center justify-center relative overflow-hidden">
                      <svg
                        viewBox="0 0 240 60"
                        className="w-full h-full text-zinc-900 stroke-current fill-none stroke-[2.8] stroke-linecap-round stroke-linejoin-round"
                        aria-hidden="true"
                      >
                        <path
                          d="M 15 42 Q 45 10 70 38 T 120 25 T 165 40 Q 185 12 210 32 Q 225 45 230 42"
                          className="animate-pulse"
                          strokeDasharray="300"
                          strokeDashoffset="0"
                        />
                        <path
                          d="M 25 48 Q 120 54 220 44"
                          strokeWidth="1.8"
                          className="opacity-70"
                        />
                      </svg>
                      {/* Animated Stamping Cursor / Nib */}
                      <div className="absolute right-3 top-1 animate-bounce">
                        <PenTool className="w-3.5 h-3.5 text-zinc-900 drop-shadow" />
                      </div>
                    </div>

                    <div className="pt-1 border-t border-zinc-300 flex items-center justify-between text-[8px] font-mono text-zinc-500 uppercase">
                      <span className="flex items-center gap-1 text-emerald-700 font-bold">
                        <Lock className="w-2 h-2 text-emerald-700" />
                        CRYPTO_SEAL
                      </span>
                      <span className="text-zinc-600 font-bold">IN_MEMORY_COMPOSITE</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-900 text-[10px] font-mono text-zinc-400">
                  <span>CANVAS_TARGET</span>
                  <span className="text-emerald-400 font-bold">LOSSLESS_PDF_STREAM</span>
                </div>
              </div>

              {/* Right: Security & Pipeline Execution Telemetry */}
              <div className="lg:col-span-5 bg-black border border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
                    <span className="text-[10px] font-mono font-bold uppercase text-zinc-400 tracking-wider">
                      SIGNATURE_PIPELINE_EXECUTION
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                      <Stamp className="w-3 h-3" />
                      ACTIVE
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {meta.steps.map((step, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 text-xs font-mono text-zinc-300 bg-zinc-950 border border-zinc-800/80 p-3 rounded-lg"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0 mt-1" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-bold text-amber-400 uppercase">
                            STAGE 0{i + 1}
                          </div>
                          <div className="text-xs text-zinc-200 truncate">{step}</div>
                        </div>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/70 shrink-0 mt-0.5" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Real-time Status Notification Card */}
                <div className="space-y-3 pt-3 border-t border-zinc-900">
                  <div className="p-3 bg-zinc-950 border-2 border-zinc-800 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                      <span className="uppercase">CURRENT_ACTION:</span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        PROCESSING
                      </span>
                    </div>
                    <div className="font-mono text-xs font-bold text-emerald-300 flex items-center gap-2 truncate">
                      <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      <span className="truncate">
                        {statusMessage || "STAMPING_DIGITAL_INK_SIGNATURES..."}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                      <span>CLIENT_RAM_BUFFER</span>
                      <span className="text-emerald-400 font-bold">100% SECURE // ZERO_UPLOAD</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full w-4/5 bg-emerald-500 rounded-full animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Security & Progress Footer */}
          <div className="pt-4 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] font-mono text-zinc-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Zero-Upload Execution: <span className="text-emerald-400 font-semibold">All processing stays inside local browser memory</span></span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <span className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <span>{statusMessage || "PROCESSING_BUFFER..."}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ToolSkeletonLoader;
