/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import {
  Menu,
  X,
  Sun,
  Moon,
} from "lucide-react";
import { RetroView } from "../types";
import { useTheme } from "../context/ThemeContext";
import ModuleIconBadge from "./ModuleIconBadge";

interface HeaderNavProps {
  currentView: RetroView;
  onSelectView: (view: RetroView) => void;
}

interface NavModuleItem {
  view: RetroView;
  label: string;
  title: string;
  category: "PDF" | "IMAGE" | "WORD" | "SIGN";
  path: string;
  iconBg: string;
}

const NAV_ITEMS: NavModuleItem[] = [
  {
    view: "sign_pdf",
    label: "SIGN_PDF",
    title: "Sign PDF",
    category: "SIGN",
    path: "/sign-pdf",
    iconBg: "#4a78a6",
  },
  {
    view: "lock_pdf",
    label: "LOCK_PDF",
    title: "Lock PDF",
    category: "SIGN",
    path: "/lock-pdf",
    iconBg: "#9e6b3b",
  },
  {
    view: "unlock_pdf",
    label: "UNLOCK_PDF",
    title: "Unlock PDF",
    category: "SIGN",
    path: "/unlock-pdf",
    iconBg: "#4a8c6f",
  },
  {
    view: "passport_photo",
    label: "PASSPORT_PHOTO",
    title: "Passport Photo",
    category: "SIGN",
    path: "/passport-photo",
    iconBg: "#5c8c46",
  },
  {
    view: "compress_img",
    label: "COMPRESS_IMG",
    title: "Compress Img",
    category: "IMAGE",
    path: "/compress-image",
    iconBg: "#3b8a6e",
  },
  {
    view: "convert_img",
    label: "CONVERT_IMG",
    title: "Convert Image",
    category: "IMAGE",
    path: "/convert-image",
    iconBg: "#d08238",
  },
  {
    view: "compress_pdf",
    label: "COMPRESS_PDF",
    title: "Compress PDF",
    category: "PDF",
    path: "/compress-pdf",
    iconBg: "#c25953",
  },
  {
    view: "image_to_pdf",
    label: "IMAGE_TO_PDF",
    title: "Image to PDF",
    category: "PDF",
    path: "/image-to-pdf",
    iconBg: "#c86a42",
  },
  {
    view: "merge_pdf",
    label: "MERGE_PDF",
    title: "Merge PDF",
    category: "PDF",
    path: "/merge-pdf",
    iconBg: "#38839e",
  },
  {
    view: "pdf_to_images",
    label: "PDF_TO_IMAGES",
    title: "PDF to Images",
    category: "PDF",
    path: "/pdf-to-images",
    iconBg: "#885da6",
  },
  {
    view: "remove_pdf_pages",
    label: "REMOVE_PAGES",
    title: "Remove Pages",
    category: "PDF",
    path: "/remove-pdf-pages",
    iconBg: "#b84d5c",
  },
  {
    view: "organize_pdf",
    label: "ORGANIZE_PDF",
    title: "Organize PDF",
    category: "PDF",
    path: "/organize-pdf",
    iconBg: "#3a8882",
  },
  {
    view: "watermark_pdf",
    label: "WATERMARK_PDF",
    title: "Watermark PDF",
    category: "PDF",
    path: "/watermark-pdf",
    iconBg: "#46829e",
  },
  {
    view: "word_to_pdf",
    label: "WORD_TO_PDF",
    title: "Word to PDF",
    category: "WORD",
    path: "/word-to-pdf",
    iconBg: "#4868a8",
  },
  {
    view: "word_to_jpg",
    label: "WORD_TO_IMG",
    title: "Word to Img",
    category: "WORD",
    path: "/word-to-jpg",
    iconBg: "#5c64a8",
  },
  {
    view: "pdf_to_word",
    label: "PDF_TO_WORD",
    title: "PDF to Word",
    category: "WORD",
    path: "/pdf-to-word",
    iconBg: "#3c7ea6",
  },
  {
    view: "excel_to_pdf",
    label: "EXCEL_TO_PDF",
    title: "Excel to PDF",
    category: "WORD",
    path: "/excel-to-pdf",
    iconBg: "#2f7d58",
  },
  {
    view: "pdf_to_excel",
    label: "PDF_TO_EXCEL",
    title: "PDF to Excel",
    category: "WORD",
    path: "/pdf-to-excel",
    iconBg: "#35856c",
  },
  {
    view: "ppt_to_pdf",
    label: "PPT_TO_PDF",
    title: "PowerPoint to PDF",
    category: "WORD",
    path: "/powerpoint-to-pdf",
    iconBg: "#c46238",
  },
  {
    view: "pdf_to_ppt",
    label: "PDF_TO_PPT",
    title: "PDF to PowerPoint",
    category: "WORD",
    path: "/pdf-to-powerpoint",
    iconBg: "#b86b35",
  },
];

export default function HeaderNav({ currentView, onSelectView }: HeaderNavProps) {
  const { theme, toggleTheme } = useTheme();
  const [isNavOpen, setIsNavOpen] = useState<boolean>(false);
  const suppressHoverRef = useRef<boolean>(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isHome = currentView === "home";

  const clearHoverTimer = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const closeMenu = () => {
    clearHoverTimer();
    setIsNavOpen(false);
  };

  const handleMouseEnter = () => {
    if (typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches) {
      return;
    }
    clearHoverTimer();
    if (suppressHoverRef.current) return;
    setIsNavOpen(true);
  };

  const handleMouseLeave = () => {
    clearHoverTimer();
    suppressHoverRef.current = false;
    hoverTimeoutRef.current = setTimeout(() => {
      setIsNavOpen(false);
    }, 180);
  };

  const handleToggleButtonClick = () => {
    clearHoverTimer();
    if (isNavOpen) {
      setIsNavOpen(false);
      suppressHoverRef.current = true;
    } else {
      suppressHoverRef.current = false;
      setIsNavOpen(true);
    }
  };

  useEffect(() => {
    if (!isNavOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isNavOpen]);

  useEffect(() => {
    return () => clearHoverTimer();
  }, []);

  return (
    <div ref={containerRef} className="sticky top-0 z-40">
      {/* ALWAYS VISIBLE STICKY SITE HEADER */}
      <header
        className="border-b-3 border-black bg-black/95 backdrop-blur-md py-3 sm:py-3.5 md:py-4 px-3 sm:px-4 md:px-8 shrink-0 shadow-lg relative z-20"
        id="site-header"
      >
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-3 sm:gap-6">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              closeMenu();
              onSelectView("home");
            }}
            className="cursor-pointer text-left hover:opacity-85 transition-opacity block no-underline min-w-0"
            title="MONO-TRANSCODER — Return to Home System Deck"
            aria-label="MONO-TRANSCODER — Return to Home System Deck"
          >
            {isHome ? (
              <h1 className="text-xl xs:text-2xl sm:text-3xl md:text-4xl font-extrabold uppercase tracking-tight sm:tracking-tighter font-sans leading-none text-white truncate">
                MONO-TRANSCODER
              </h1>
            ) : (
              <span className="text-xl xs:text-2xl sm:text-3xl md:text-4xl font-extrabold uppercase tracking-tight sm:tracking-tighter font-sans leading-none text-white block truncate">
                MONO-TRANSCODER
              </span>
            )}
            <p className="text-[9px] xs:text-[10px] sm:text-xs text-zinc-400 font-mono mt-1 uppercase tracking-tight sm:tracking-normal truncate max-w-[210px] xs:max-w-[280px] sm:max-w-none">
              100% Private File Converter &amp; Compressor // Zero Uploads
            </p>
          </a>

          {/* Header Action Controls (Theme Toggle & 3-Line Menu) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Light / Dark Theme Toggle Button (Animated Dual-Icon Morph) */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
              title={theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
              className="w-9 h-9 sm:w-10 sm:h-10 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 shrink-0 relative overflow-hidden"
            >
              <span
                className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  theme === "dark"
                    ? "opacity-100 rotate-0 scale-100"
                    : "opacity-0 -rotate-90 scale-50 pointer-events-none"
                }`}
              >
                <Moon className="w-4 h-4 text-indigo-400" />
              </span>
              <span
                className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  theme === "light"
                    ? "opacity-100 rotate-0 scale-100"
                    : "opacity-0 rotate-90 scale-50 pointer-events-none"
                }`}
              >
                <Sun className="w-4 h-4 text-amber-500" />
              </span>
            </button>

            {/* 3-Line Hamburger / Red Close Toggle Button */}
            <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <button
                type="button"
                onClick={handleToggleButtonClick}
                aria-expanded={isNavOpen}
                aria-controls="tools-navigation"
                aria-label={isNavOpen ? "Hide Tool Navigation" : "Show Tool Navigation"}
                title={isNavOpen ? "Close Tool Navigation (Esc)" : "Open Tool Navigation"}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 border active:scale-95 relative overflow-hidden ${
                  isNavOpen
                    ? "bg-red-600 hover:bg-red-500 border-red-500 text-white"
                    : "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 hover:border-zinc-500 text-white"
                }`}
              >
                <span
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isNavOpen
                      ? "opacity-0 rotate-90 scale-50 pointer-events-none"
                      : "opacity-100 rotate-0 scale-100"
                  }`}
                >
                  <Menu className="w-4 h-4 text-white" />
                </span>
                <span
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isNavOpen
                      ? "opacity-100 rotate-0 scale-100"
                      : "opacity-0 -rotate-90 scale-50 pointer-events-none"
                  }`}
                >
                  <X className="w-4 h-4 text-white stroke-[2.5]" />
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* COMPACT CATEGORIZED TOOL NAVIGATION BAR */}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isNavOpen
            ? "grid-rows-[1fr] opacity-100 translate-y-0 pointer-events-auto"
            : "grid-rows-[0fr] opacity-0 -translate-y-1.5 pointer-events-none"
        }`}
      >
        <div className="overflow-hidden">
          <nav
            id="tools-navigation"
            aria-label="Tool Navigation"
            aria-hidden={!isNavOpen}
            className="border-b-2 border-black bg-zinc-950/98 backdrop-blur-md py-3 px-3 sm:px-4 md:px-8 shadow-2xl max-h-[calc(100dvh-60px)] overflow-y-auto overscroll-contain"
          >
            <div className="max-w-[1800px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 lg:gap-5 pb-4">
              {(
                [
                  {
                    key: "PDF" as const,
                    title: "PDF TOOLS",
                    colSpan: "sm:col-span-2 lg:col-span-4",
                    gridCols: "grid-cols-1 sm:grid-cols-2",
                  },
                  {
                    key: "WORD" as const,
                    title: "WORD & OFFICE",
                    colSpan: "sm:col-span-2 lg:col-span-4",
                    gridCols: "grid-cols-1 sm:grid-cols-2",
                  },
                  {
                    key: "SIGN" as const,
                    title: "SIGN & SECURITY",
                    colSpan: "lg:col-span-2",
                    gridCols: "grid-cols-1",
                  },
                  {
                    key: "IMAGE" as const,
                    title: "IMAGE TOOLS",
                    colSpan: "lg:col-span-2",
                    gridCols: "grid-cols-1",
                  },
                ]
              ).map((group) => {
                const groupItems = NAV_ITEMS.filter((i) => i.category === group.key);
                return (
                  <div key={group.key} className={`${group.colSpan} space-y-1.5`}>
                    <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-zinc-800">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                        {group.title}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        ({groupItems.length})
                      </span>
                    </div>
                    <div className={`grid ${group.gridCols} gap-1.5`}>
                      {groupItems.map((item) => {
                        const isActive =
                          currentView === item.view ||
                          currentView === `${item.view}_download`;
                        return (
                          <a
                            key={item.view}
                            href={item.path}
                            tabIndex={isNavOpen ? 0 : -1}
                            onClick={(e) => {
                              e.preventDefault();
                              closeMenu();
                              onSelectView(item.view);
                            }}
                            aria-current={isActive ? "page" : undefined}
                            aria-label={`Launch ${item.title} tool`}
                            className={`group min-h-[42px] px-2.5 py-2 rounded-lg text-xs font-mono font-bold uppercase border transition-all duration-200 cursor-pointer no-underline flex items-center gap-2.5 hover:-translate-y-0.5 active:scale-[0.98] ${
                              isActive
                                ? "bg-white text-black border-white shadow-[1px_1px_0_0_#ffffff]"
                                : "bg-black text-zinc-100 border-zinc-800 hover:border-white hover:bg-zinc-900"
                            }`}
                          >
                            <ModuleIconBadge view={item.view} size="sm" />
                            <span className="truncate">{item.title}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
