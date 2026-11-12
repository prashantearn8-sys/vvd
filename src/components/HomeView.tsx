/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  Search,
  ArrowRight,
  LayoutGrid,
  List,
} from "lucide-react";
import { RetroView } from "../types";
import ModuleIconBadge from "./ModuleIconBadge";

interface HomeViewProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectView: (view: RetroView) => void;
  onSelectPresetPath?: (path: string) => void;
}

type CategoryFilter = "ALL" | "PDF" | "IMAGE" | "WORD" | "MEDIA" | "SIGN";

interface QuickActionItem {
  id: string;
  title: string;
  desc: string;
  view: RetroView;
  path: string;
  category: CategoryFilter;
  tag: string;
  keywords: string;
}

const QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: "action-compress-img",
    title: "Compress Image",
    desc: "Shrink JPG, PNG, WebP, and AVIF images to your exact target KB size (20KB, 50KB, 100KB).",
    view: "compress_img",
    path: "/compress-image",
    category: "IMAGE",
    tag: "IMAGE OPTIMIZER",
    keywords: "image compressor reduce image size in kb 10kb 20kb 50kb 100kb 200kb photo resizer shrink jpg png",
  },
  {
    id: "action-compress-pdf",
    title: "Compress PDF",
    desc: "Reduce PDF file size with stream compression and image downsampling.",
    view: "compress_pdf",
    path: "/compress-pdf",
    category: "PDF",
    tag: "PDF ENGINE",
    keywords: "pdf compressor reduce pdf size in kb 100kb 200kb 300kb 500kb shrink pdf file size",
  },
  {
    id: "action-merge-pdf",
    title: "Merge PDF",
    desc: "Join multiple PDF files together with drag-and-drop sorting.",
    view: "merge_pdf",
    path: "/merge-pdf",
    category: "PDF",
    tag: "DOCUMENT JOINER",
    keywords: "combine pdf join pdf binder merge pdf files",
  },
  {
    id: "action-image-to-pdf",
    title: "Image to PDF",
    desc: "Combine single or multiple images into a clean, custom-aligned PDF.",
    view: "image_to_pdf",
    path: "/image-to-pdf",
    category: "PDF",
    tag: "PAGE COMPILER",
    keywords: "jpg to pdf png to pdf photo to pdf combine images into pdf",
  },
  {
    id: "action-sign-pdf",
    title: "Sign PDF",
    desc: "Draw, type, or stamp visual signatures onto any PDF page locally.",
    view: "sign_pdf",
    path: "/sign-pdf",
    category: "SIGN",
    tag: "SIGNATURE STUDIO",
    keywords: "esign pdf electronic signature stamp sign document visual signature",
  },
  {
    id: "action-pdf-to-word",
    title: "PDF to Word",
    desc: "Extract PDF text and layouts into an editable Word (.docx) file.",
    view: "pdf_to_word",
    path: "/pdf-to-word",
    category: "WORD",
    tag: "DOCX EXTRACTOR",
    keywords: "pdf to docx editable word document pdf to word",
  },
  {
    id: "action-word-to-pdf",
    title: "Word to PDF",
    desc: "Basic local conversion of Word (.docx, .rtf, .txt) files into paginated PDFs.",
    view: "word_to_pdf",
    path: "/word-to-pdf",
    category: "WORD",
    tag: "DOCX TYPESETTER",
    keywords: "docx to pdf doc to pdf microsoft word converter",
  },
  {
    id: "action-convert-img",
    title: "Convert Image Format",
    desc: "Convert images between PNG, JPG, WebP, and AVIF formats instantly.",
    view: "convert_img",
    path: "/convert-image",
    category: "IMAGE",
    tag: "FORMAT ENCODER",
    keywords: "image converter png to jpg jpg to png webp to jpg avif to jpg format changer",
  },
  {
    id: "action-passport-photo",
    title: "Passport Photo Maker",
    desc: "Remove backgrounds, set backdrop color, and export 300 DPI biometric photos.",
    view: "passport_photo",
    path: "/passport-photo",
    category: "SIGN",
    tag: "BIOMETRIC STUDIO",
    keywords: "passport size photo maker id photo background remover",
  },
  {
    id: "action-organize-pdf",
    title: "Organize PDF Pages",
    desc: "Reorder, rotate, duplicate, or delete PDF pages visually.",
    view: "organize_pdf",
    path: "/organize-pdf",
    category: "PDF",
    tag: "PAGE ORGANIZER",
    keywords: "rearrange pdf sort pdf rotate pdf pages organize",
  },
  {
    id: "action-remove-pdf-pages",
    title: "Remove PDF Pages",
    desc: "Preview thumbnails and delete unwanted PDF pages losslessly.",
    view: "remove_pdf_pages",
    path: "/remove-pdf-pages",
    category: "PDF",
    tag: "PAGE EXTRACTOR",
    keywords: "delete pdf pages split pdf cut pages remove pages",
  },
  {
    id: "action-pdf-to-images",
    title: "PDF to Images",
    desc: "Export PDF pages as high-quality images or batch download as ZIP.",
    view: "pdf_to_images",
    path: "/pdf-to-images",
    category: "PDF",
    tag: "RASTER EXTRACTOR",
    keywords: "pdf to jpg pdf to png extract images from pdf pages",
  },
  {
    id: "action-lock-pdf",
    title: "Lock PDF",
    desc: "Add basic standard PDF RC4-128 password protection and permission flags.",
    view: "lock_pdf",
    path: "/lock-pdf",
    category: "SIGN",
    tag: "PDF ENCRYPTOR",
    keywords: "protect pdf password encrypt security",
  },
  {
    id: "action-unlock-pdf",
    title: "Unlock PDF",
    desc: "Remove password prompts and printing/copying restrictions from PDFs.",
    view: "unlock_pdf",
    path: "/unlock-pdf",
    category: "SIGN",
    tag: "PDF DECRYPTOR",
    keywords: "remove pdf password decrypt pdf unlock",
  },
  {
    id: "action-watermark-pdf",
    title: "Watermark PDF",
    desc: "Stamp custom text or logo watermarks with rotation and opacity.",
    view: "watermark_pdf",
    path: "/watermark-pdf",
    category: "PDF",
    tag: "WATERMARK STUDIO",
    keywords: "add watermark stamp text logo confidential draft",
  },
  {
    id: "action-pdf-watermark-remover",
    title: "PDF Watermark Remover",
    desc: "Erase diagonal stamps, faded text, and watermarks from PDF pages locally while keeping text sharp.",
    view: "pdf_watermark_remover",
    path: "/remove-pdf-watermark",
    category: "PDF",
    tag: "PDF ERASER",
    keywords: "remove watermark from pdf pdf watermark remover erase stamp clean document",
  },
  {
    id: "action-image-watermark-remover",
    title: "Image Watermark Remover",
    desc: "Remove logos, stamps, and text watermarks from single or bulk images locally with zero-trace inpainting.",
    view: "image_watermark_remover",
    path: "/remove-image-watermark",
    category: "IMAGE",
    tag: "PHOTO ERASER",
    keywords: "remove watermark from image photo watermark remover bulk image watermark eraser",
  },
  {
    id: "action-audio-converter",
    title: "Audio Converter",
    desc: "Transcode single or bulk MP3, WAV (16/24/8-bit), WebM Opus, OGG, and M4A audio files with custom sample rate and channels.",
    view: "audio_converter",
    path: "/audio-converter",
    category: "MEDIA",
    tag: "AUDIO TRANSCODER",
    keywords: "audio converter mp3 to wav wav to mp3 m4a ogg flac bulk audio converter",
  },
  {
    id: "action-audio-extractor",
    title: "Audio Extractor",
    desc: "Extract lossless WAV, WebM Opus, OGG, or M4A audio tracks from single or bulk MP4, WebM, MOV, and MKV videos.",
    view: "audio_extractor",
    path: "/audio-extractor",
    category: "MEDIA",
    tag: "AUDIO DEMUXER",
    keywords: "extract audio from video video to mp3 video to wav mp4 to wav audio ripper",
  },
  {
    id: "action-audio-editor",
    title: "Audio Editor",
    desc: "Trim waveforms, adjust speed/tempo, shape 3-band EQ (Bass/Mid/Treble), apply fades, reverse, and normalize audio locally.",
    view: "audio_editor",
    path: "/audio-editor",
    category: "MEDIA",
    tag: "AUDIO STUDIO",
    keywords: "audio editor trim audio equalizer bass boost speed up audio reverse audio normalize",
  },
  {
    id: "action-video-converter",
    title: "Video Converter",
    desc: "Convert and compress single or bulk MP4, WebM, MOV, or turn video clips into looping Animated GIFs locally.",
    view: "video_converter",
    path: "/video-converter",
    category: "MEDIA",
    tag: "VIDEO TRANSCODER",
    keywords: "video converter mp4 to webm webm to mp4 video to gif compress video resize video bulk video",
  },
  {
    id: "action-video-extractor",
    title: "Video Frame Extractor",
    desc: "Extract high-res JPG, PNG, or WebP frame sequences, intervals, or snapshots from videos—with direct download without ZIP.",
    view: "video_extractor",
    path: "/video-extractor",
    category: "MEDIA",
    tag: "FRAME EXTRACTOR",
    keywords: "video frame extractor video to jpg extract frames from video thumbnail extractor",
  },
  {
    id: "action-video-editor",
    title: "Video Editor",
    desc: "Trim timeline segments, rotate & flip, crop aspect ratios (16:9, 9:16, 1:1), grade colors, change speed, and burn captions.",
    view: "video_editor",
    path: "/video-editor",
    category: "MEDIA",
    tag: "VIDEO STUDIO",
    keywords: "video editor trim video crop video rotate video color grade video speed caption",
  },
  {
    id: "action-excel-to-pdf",
    title: "Excel to PDF",
    desc: "Basic local conversion of Excel (.xlsx) and CSV spreadsheets into PDF tables.",
    view: "excel_to_pdf",
    path: "/excel-to-pdf",
    category: "WORD",
    tag: "XLSX TYPESETTER",
    keywords: "xlsx to pdf csv to pdf spreadsheet to pdf",
  },
  {
    id: "action-pdf-to-excel",
    title: "PDF to Excel",
    desc: "Extract tables from PDF pages into editable Excel (.xlsx) or CSV.",
    view: "pdf_to_excel",
    path: "/pdf-to-excel",
    category: "WORD",
    tag: "GRID EXTRACTOR",
    keywords: "pdf to xlsx pdf to csv table extractor",
  },
  {
    id: "action-ppt-to-pdf",
    title: "PowerPoint to PDF",
    desc: "Basic local conversion of PowerPoint (.pptx) slide decks into PDFs.",
    view: "ppt_to_pdf",
    path: "/powerpoint-to-pdf",
    category: "WORD",
    tag: "SLIDE COMPILER",
    keywords: "pptx to pdf ppt to pdf slides to pdf presentation",
  },
  {
    id: "action-pdf-to-ppt",
    title: "PDF to PowerPoint",
    desc: "Transform PDF pages into widescreen PowerPoint (.pptx) presentations.",
    view: "pdf_to_ppt",
    path: "/pdf-to-powerpoint",
    category: "WORD",
    tag: "PPTX BUILDER",
    keywords: "pdf to pptx pdf to slides presentation converter",
  },
  {
    id: "action-word-to-jpg",
    title: "Word to Image",
    desc: "Render Word (.docx, .rtf, .txt) pages into high-res JPG images.",
    view: "word_to_jpg",
    path: "/word-to-jpg",
    category: "WORD",
    tag: "CANVAS RENDERER",
    keywords: "docx to jpg word to image doc to png",
  },
];

const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: "ALL", label: "ALL TOOLS" },
  { key: "PDF", label: "PDF TOOLS" },
  { key: "WORD", label: "WORD & OFFICE" },
  { key: "IMAGE", label: "IMAGE TOOLS" },
  { key: "MEDIA", label: "AUDIO & VIDEO" },
  { key: "SIGN", label: "SIGN & SECURITY" },
];

export default function HomeView({
  searchQuery,
  onSearchChange,
  onSelectView,
}: HomeViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredActions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return QUICK_ACTIONS.filter((act) => {
      const matchesCategory = selectedCategory === "ALL" || act.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        act.title.toLowerCase().includes(q) ||
        act.desc.toLowerCase().includes(q) ||
        act.tag.toLowerCase().includes(q) ||
        act.view.toLowerCase().includes(q) ||
        act.keywords.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, selectedCategory]);

  const handleCardClick = (e: React.MouseEvent<HTMLAnchorElement>, view: RetroView) => {
    e.preventDefault();
    onSelectView(view);
  };

  return (
    <section
      className="space-y-4 sm:space-y-5 animate-fade-in select-none"
      id="home-view"
      aria-label="System Deck"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
    >
      {/* Row 1: Unified Command Deck (Category Tabs + Search + View Switcher) */}
      <div className="bg-black border-2 border-zinc-800 rounded-xl p-3 sm:p-4 space-y-3 select-none">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Category Filter Tabs */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 sm:flex-wrap scrollbar-none -mx-1 px-1 touch-pan-x select-none"
            role="tablist"
            aria-label="Tool Categories"
          >
            {CATEGORY_TABS.map((tab) => {
              const isActive = selectedCategory === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSelectedCategory(tab.key)}
                  className={`whitespace-nowrap shrink-0 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-mono font-bold uppercase rounded-lg border-2 transition-all duration-200 cursor-pointer active:scale-95 select-none ${
                    isActive
                      ? "bg-white text-black border-white shadow-[2px_2px_0_0_#ffffff]"
                      : "bg-black text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-2 sm:gap-2.5 w-full lg:w-auto lg:min-w-[360px] xl:min-w-[420px]">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="SEARCH TOOLS (PDF, WORD, EXCEL, KB, SIGN)..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onCopy={(e) => e.preventDefault()}
                className="w-full py-2 px-3 pl-8 sm:pl-9 bg-zinc-950 border-2 border-zinc-800 hover:border-zinc-700 text-white rounded-lg text-xs font-mono placeholder:text-zinc-500 focus:outline-none focus:border-white transition-colors"
                aria-label="Search available tools and file types"
              />
              <Search
                className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>

        {/* Row 2 inside Command Bar: Privacy Status + Count */}
        <div className="pt-2.5 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono select-none">
          <span
            className="font-bold text-emerald-400 uppercase flex items-center gap-2 text-[11px]"
            role="status"
            aria-label="Local sandbox active"
          >
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" aria-hidden="true" />
            <span>DOCUMENTS NEVER LEAVE YOUR DEVICE</span>
          </span>
          <span className="text-zinc-400 text-[10px] sm:text-[11px] uppercase">
            SHOWING <strong className="text-white">{filteredActions.length}</strong> OF{" "}
            {QUICK_ACTIONS.length} TOOLS
          </span>
        </div>
      </div>

      {/* Row 3: Quick Actions (Grid or List Mode) */}
      {viewMode === "grid" ? (
        <div
          key={`grid_${selectedCategory}`}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-4 select-none"
        >
          {filteredActions.map((action, idx) => {
            return (
              <a
                key={action.id}
                href={action.path}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onClick={(e) => handleCardClick(e, action.view)}
                style={{
                  animationDelay: `${Math.min(idx * 8, 80)}ms`,
                }}
                aria-label={`Open ${action.title}`}
                className="module-card-interactive animate-card-enter bg-black border-2 border-zinc-800 rounded-xl p-3 sm:p-4 md:p-5 hover:border-white flex flex-col justify-between group cursor-pointer hover:bg-zinc-950 no-underline text-inherit shadow-[2px_2px_0_0_#27272a] hover:shadow-[3px_3px_0_0_#ffffff] active:scale-[0.98] select-none"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3.5">
                    <ModuleIconBadge view={action.view} size="md" />
                  </div>
                  <h3 className="font-sans font-bold text-xs sm:text-base tracking-tight text-white mb-1 sm:mb-1.5 transition-colors duration-150 line-clamp-2 min-h-[2rem] sm:min-h-0 select-none">
                    {action.title}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-zinc-400 font-mono leading-tight sm:leading-snug mb-3 sm:mb-4 line-clamp-2 sm:line-clamp-3 select-none">
                    {action.desc}
                  </p>
                </div>

                {/* Action Button */}
                <div className="w-full text-center py-2 sm:py-2.5 px-2 bg-white text-black group-hover:bg-zinc-200 text-[10px] sm:text-xs font-mono font-bold uppercase border-2 border-white transition-all duration-150 flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg shadow-[1px_1px_0_0_#ffffff] sm:shadow-[2px_2px_0_0_#ffffff] select-none">
                  <span>OPEN TOOL</span>
                  <ArrowRight
                    className="w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform duration-150 group-hover:translate-x-1 shrink-0"
                    aria-hidden="true"
                  />
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div key={`list_${selectedCategory}`} className="flex flex-col gap-2 sm:gap-2.5 select-none">
          {filteredActions.map((action, idx) => {
            return (
              <a
                key={action.id}
                href={action.path}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onClick={(e) => handleCardClick(e, action.view)}
                style={{
                  animationDelay: `${Math.min(idx * 6, 60)}ms`,
                }}
                aria-label={`Open ${action.title}`}
                className="module-card-interactive animate-card-enter bg-black border-2 border-zinc-800 rounded-xl p-3 sm:p-3.5 hover:border-white flex items-center justify-between gap-3 group cursor-pointer hover:bg-zinc-950 no-underline text-inherit shadow-[2px_2px_0_0_#27272a] hover:shadow-[3px_3px_0_0_#ffffff] active:scale-[0.99] select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ModuleIconBadge view={action.view} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-sans font-bold text-xs sm:text-sm md:text-base tracking-tight text-white truncate select-none">
                        {action.title}
                      </h3>
                      <span className="hidden sm:inline-block text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 select-none">
                        {action.tag}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-zinc-400 font-mono truncate max-w-xs sm:max-w-md md:max-w-xl select-none">
                      {action.desc}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white text-black text-[10px] sm:text-xs font-mono font-bold uppercase rounded-lg border-2 border-white shadow-[1px_1px_0_0_#ffffff] select-none">
                  <span>OPEN TOOL</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </a>
            );
          })}
        </div>
      )}

      {filteredActions.length === 0 && (
        <div className="p-8 text-center border-2 border-dashed border-zinc-800 rounded-xl font-mono text-xs text-zinc-400 select-none">
          NO TOOLS MATCH SEARCH QUERY: "{searchQuery.toUpperCase()}"
        </div>
      )}
    </section>
  );
}
