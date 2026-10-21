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
  onOpenContact?: () => void;
}

type CategoryFilter = "ALL" | "PDF" | "IMAGE" | "WORD" | "SIGN";

interface QuickActionItem {
  id: string;
  title: string;
  desc: string;
  view: RetroView;
  path: string;
  category: CategoryFilter;
  tag: string;
}

const QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: "action-sign-pdf",
    title: "Sign PDF",
    desc: "Draw, type, or stamp signatures onto any PDF page locally.",
    view: "sign_pdf",
    path: "/sign-pdf",
    category: "SIGN",
    tag: "SIGNATURE STUDIO",
  },
  {
    id: "action-compress-img",
    title: "Compress Img",
    desc: "Shrink JPG, PNG, WebP, and AVIF images to your target KB size.",
    view: "compress_img",
    path: "/compress-image",
    category: "IMAGE",
    tag: "IMAGE OPTIMIZER",
  },
  {
    id: "action-compress-pdf",
    title: "Compress PDF",
    desc: "Reduce PDF file size with stream compression and image downsampling.",
    view: "compress_pdf",
    path: "/compress-pdf",
    category: "PDF",
    tag: "PDF ENGINE",
  },
  {
    id: "action-convert-img",
    title: "Convert Image Format",
    desc: "Convert images between PNG, JPG, WebP, and AVIF formats instantly.",
    view: "convert_img",
    path: "/convert-image",
    category: "IMAGE",
    tag: "FORMAT ENCODER",
  },
  {
    id: "action-image-to-pdf",
    title: "Image to PDF",
    desc: "Combine single or multiple images into a clean, custom-aligned PDF.",
    view: "image_to_pdf",
    path: "/image-to-pdf",
    category: "PDF",
    tag: "PAGE COMPILER",
  },
  {
    id: "action-merge-pdf",
    title: "Merge PDF",
    desc: "Join multiple PDF files together with drag-and-drop sorting.",
    view: "merge_pdf",
    path: "/merge-pdf",
    category: "PDF",
    tag: "DOCUMENT JOINER",
  },
  {
    id: "action-pdf-to-images",
    title: "PDF to Images",
    desc: "Export PDF pages as high-quality images or batch download as ZIP.",
    view: "pdf_to_images",
    path: "/pdf-to-images",
    category: "PDF",
    tag: "RASTER EXTRACTOR",
  },
  {
    id: "action-remove-pdf-pages",
    title: "Remove PDF Pages",
    desc: "Preview thumbnails and delete unwanted PDF pages losslessly.",
    view: "remove_pdf_pages",
    path: "/remove-pdf-pages",
    category: "PDF",
    tag: "PAGE EXTRACTOR",
  },
  {
    id: "action-organize-pdf",
    title: "Organize PDF Pages",
    desc: "Reorder, rotate, duplicate, or delete PDF pages visually.",
    view: "organize_pdf",
    path: "/organize-pdf",
    category: "PDF",
    tag: "PAGE ORGANIZER",
  },
  {
    id: "action-watermark-pdf",
    title: "Watermark PDF",
    desc: "Stamp custom text or logo watermarks with rotation and opacity.",
    view: "watermark_pdf",
    path: "/watermark-pdf",
    category: "PDF",
    tag: "WATERMARK STUDIO",
  },
  {
    id: "action-word-to-pdf",
    title: "Word to PDF",
    desc: "Convert Word (.docx, .rtf, .txt) files into paginated PDFs.",
    view: "word_to_pdf",
    path: "/word-to-pdf",
    category: "WORD",
    tag: "DOCX TYPESETTER",
  },
  {
    id: "action-word-to-jpg",
    title: "Word to Img",
    desc: "Render Word (.docx, .rtf, .txt) pages into high-res JPG images.",
    view: "word_to_jpg",
    path: "/word-to-jpg",
    category: "WORD",
    tag: "CANVAS RENDERER",
  },
  {
    id: "action-pdf-to-word",
    title: "PDF to Word",
    desc: "Extract PDF text and layouts into an editable Word (.docx) file.",
    view: "pdf_to_word",
    path: "/pdf-to-word",
    category: "WORD",
    tag: "DOCX EXTRACTOR",
  },
  {
    id: "action-excel-to-pdf",
    title: "Excel to PDF",
    desc: "Convert Excel (.xlsx) and CSV spreadsheets into clean PDF tables.",
    view: "excel_to_pdf",
    path: "/excel-to-pdf",
    category: "WORD",
    tag: "XLSX TYPESETTER",
  },
  {
    id: "action-pdf-to-excel",
    title: "PDF to Excel",
    desc: "Extract tables from PDF pages into editable Excel (.xlsx) or CSV.",
    view: "pdf_to_excel",
    path: "/pdf-to-excel",
    category: "WORD",
    tag: "GRID EXTRACTOR",
  },
  {
    id: "action-ppt-to-pdf",
    title: "PowerPoint to PDF",
    desc: "Convert PowerPoint (.pptx) slide decks and notes into crisp PDFs.",
    view: "ppt_to_pdf",
    path: "/powerpoint-to-pdf",
    category: "WORD",
    tag: "SLIDE COMPILER",
  },
  {
    id: "action-pdf-to-ppt",
    title: "PDF to PowerPoint",
    desc: "Transform PDF pages into widescreen PowerPoint (.pptx) presentations.",
    view: "pdf_to_ppt",
    path: "/pdf-to-powerpoint",
    category: "WORD",
    tag: "PPTX BUILDER",
  },
  {
    id: "action-lock-pdf",
    title: "Lock PDF",
    desc: "Encrypt PDF files with a 128-bit password and permission locks.",
    view: "lock_pdf",
    path: "/lock-pdf",
    category: "SIGN",
    tag: "PDF ENCRYPTOR",
  },
  {
    id: "action-unlock-pdf",
    title: "Unlock PDF",
    desc: "Remove password prompts and printing/copying restrictions from PDFs.",
    view: "unlock_pdf",
    path: "/unlock-pdf",
    category: "SIGN",
    tag: "PDF DECRYPTOR",
  },
  {
    id: "action-passport-photo",
    title: "Passport Photo Maker",
    desc: "Remove backgrounds, set backdrop color, and export 300 DPI photos.",
    view: "passport_photo",
    path: "/passport-photo",
    category: "SIGN",
    tag: "BIOMETRIC STUDIO",
  },
];

const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: "ALL", label: `ALL TOOLS (${QUICK_ACTIONS.length})` },
  { key: "PDF", label: "PDF TOOLS" },
  { key: "WORD", label: "WORD & OFFICE" },
  { key: "IMAGE", label: "IMAGE TOOLS" },
  { key: "SIGN", label: "SIGN & SECURITY" },
];

export default function HomeView({ searchQuery, onSearchChange, onSelectView }: HomeViewProps) {
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
        act.view.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, selectedCategory]);

  return (
    <section className="space-y-4 sm:space-y-6 animate-fade-in" id="home-view" aria-label="System Deck">
      {/* Search and Sandbox Status Bar (100% Monochrome) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 items-center">
        <div className="md:col-span-8 relative">
          <input
            type="text"
            placeholder="SEARCH TOOLS (PDF, EXCEL, POWERPOINT, WORD, WATERMARK, LOCK, SIGN)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full p-3 sm:p-3.5 pl-9 sm:pl-10 bg-black border-2 border-zinc-800 hover:border-zinc-700 text-white rounded-xl text-xs font-mono placeholder:text-zinc-500 focus:outline-none focus:border-white transition-colors"
            aria-label="Search available tools and file types"
          />
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
        </div>
        <div className="md:col-span-4 bg-black border-2 border-zinc-800 p-2.5 sm:p-3 rounded-xl flex items-center justify-between text-xs font-mono">
          <span className="text-zinc-400 uppercase text-[11px] sm:text-xs">SANDBOX_MODE:</span>
          <span className="font-bold text-emerald-400 uppercase flex items-center gap-2 text-[11px] sm:text-xs" role="status" aria-label="Local sandbox active">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" aria-hidden="true"></span>
            <span>100% LOCAL RAM</span>
          </span>
        </div>
      </div>

      {/* Category Filter Tabs & Count + Mobile Layout View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pt-1">
        {/* Horizontal scrollable category chips on mobile */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 sm:flex-wrap scrollbar-none -mx-1 px-1 touch-pan-x"
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
                className={`whitespace-nowrap shrink-0 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-mono font-bold uppercase rounded-lg border-2 transition-all duration-200 cursor-pointer active:scale-95 ${
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

        {/* Count & View Mode Switcher (Grid / List) */}
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <div className="text-[10px] sm:text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
            SHOWING <span className="text-white font-bold">{filteredActions.length}</span> OF {QUICK_ACTIONS.length}
          </div>
          <div className="flex items-center border border-zinc-800 rounded-lg p-0.5 bg-black">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid View"
              title="Switch to Grid View"
              className={`p-1.5 rounded transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white text-black shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="List View"
              title="Switch to List View"
              className={`p-1.5 rounded transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white text-black shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions (Grid or List Mode) */}
      {viewMode === "grid" ? (
        <div
          key={`grid_${selectedCategory}`}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-4"
        >
          {filteredActions.map((action, idx) => {
            return (
              <a
                key={action.id}
                href={action.path}
                onClick={(e) => {
                  e.preventDefault();
                  onSelectView(action.view);
                }}
                style={{
                  animationDelay: `${Math.min(idx * 20, 200)}ms`,
                }}
                aria-label={`Launch ${action.title} tool`}
                className="module-card-interactive animate-card-enter bg-black border-2 border-zinc-800 rounded-xl p-3 sm:p-4 md:p-5 hover:border-white flex flex-col justify-between group cursor-pointer hover:bg-zinc-950 no-underline text-inherit shadow-[2px_2px_0_0_#27272a] hover:shadow-[3px_3px_0_0_#ffffff] active:scale-[0.98]"
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5 sm:mb-4">
                    <ModuleIconBadge view={action.view} size="md" />
                  </div>
                  <h3 className="font-sans font-bold text-xs sm:text-base uppercase tracking-tight text-white mb-1 sm:mb-2 transition-colors duration-200 line-clamp-2 min-h-[2rem] sm:min-h-0">
                    {action.title}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-zinc-400 font-mono leading-tight sm:leading-snug mb-3 sm:mb-4 line-clamp-2 sm:line-clamp-3">
                    {action.desc}
                  </p>
                </div>

                {/* Action Button */}
                <div className="w-full text-center py-2 sm:py-2.5 px-2 bg-white text-black group-hover:bg-zinc-200 text-[10px] sm:text-xs font-mono font-bold uppercase border-2 border-white transition-all duration-200 flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg shadow-[1px_1px_0_0_#ffffff] sm:shadow-[2px_2px_0_0_#ffffff]">
                  <span>LAUNCH</span>
                  <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform duration-200 group-hover:translate-x-1 shrink-0" aria-hidden="true" />
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div key={`list_${selectedCategory}`} className="flex flex-col gap-2 sm:gap-2.5">
          {filteredActions.map((action, idx) => {
            return (
              <a
                key={action.id}
                href={action.path}
                onClick={(e) => {
                  e.preventDefault();
                  onSelectView(action.view);
                }}
                style={{
                  animationDelay: `${Math.min(idx * 15, 180)}ms`,
                }}
                aria-label={`Launch ${action.title} tool`}
                className="module-card-interactive animate-card-enter bg-black border-2 border-zinc-800 rounded-xl p-3 sm:p-3.5 hover:border-white flex items-center justify-between gap-3 group cursor-pointer hover:bg-zinc-950 no-underline text-inherit shadow-[2px_2px_0_0_#27272a] hover:shadow-[3px_3px_0_0_#ffffff] active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ModuleIconBadge view={action.view} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-sans font-bold text-xs sm:text-sm md:text-base uppercase tracking-tight text-white truncate">
                        {action.title}
                      </h3>
                    </div>
                    <p className="text-[10px] sm:text-xs text-zinc-400 font-mono truncate max-w-xs sm:max-w-md md:max-w-xl">
                      {action.desc}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white text-black text-[10px] sm:text-xs font-mono font-bold uppercase rounded-lg border-2 border-white shadow-[1px_1px_0_0_#ffffff]">
                  <span>LAUNCH</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </a>
            );
          })}
        </div>
      )}

      {filteredActions.length === 0 && (
        <div className="p-8 text-center border-2 border-dashed border-zinc-800 rounded-xl font-mono text-xs text-zinc-400">
          NO MODULES MATCH SEARCH QUERY: "{searchQuery.toUpperCase()}"
        </div>
      )}
    </section>
  );
}
