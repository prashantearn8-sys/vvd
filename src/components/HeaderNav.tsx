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
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { RetroView } from "../types";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
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
    label: "Sign PDF",
    title: "Sign PDF",
    category: "SIGN",
    path: "/sign-pdf",
    iconBg: "#4a78a6",
  },
  {
    view: "lock_pdf",
    label: "Lock PDF",
    title: "Lock PDF",
    category: "SIGN",
    path: "/lock-pdf",
    iconBg: "#9e6b3b",
  },
  {
    view: "unlock_pdf",
    label: "Unlock PDF",
    title: "Unlock PDF",
    category: "SIGN",
    path: "/unlock-pdf",
    iconBg: "#4a8c6f",
  },
  {
    view: "passport_photo",
    label: "Passport Photo",
    title: "Passport Photo",
    category: "SIGN",
    path: "/passport-photo",
    iconBg: "#5c8c46",
  },
  {
    view: "compress_img",
    label: "Compress Image",
    title: "Compress Image",
    category: "IMAGE",
    path: "/compress-image",
    iconBg: "#3b8a6e",
  },
  {
    view: "convert_img",
    label: "Convert Image",
    title: "Convert Image",
    category: "IMAGE",
    path: "/convert-image",
    iconBg: "#d08238",
  },
  {
    view: "compress_pdf",
    label: "Compress PDF",
    title: "Compress PDF",
    category: "PDF",
    path: "/compress-pdf",
    iconBg: "#c25953",
  },
  {
    view: "image_to_pdf",
    label: "Image to PDF",
    title: "Image to PDF",
    category: "PDF",
    path: "/image-to-pdf",
    iconBg: "#c86a42",
  },
  {
    view: "merge_pdf",
    label: "Merge PDF",
    title: "Merge PDF",
    category: "PDF",
    path: "/merge-pdf",
    iconBg: "#38839e",
  },
  {
    view: "pdf_to_images",
    label: "PDF to Images",
    title: "PDF to Images",
    category: "PDF",
    path: "/pdf-to-images",
    iconBg: "#885da6",
  },
  {
    view: "remove_pdf_pages",
    label: "Remove Pages",
    title: "Remove Pages",
    category: "PDF",
    path: "/remove-pdf-pages",
    iconBg: "#b84d5c",
  },
  {
    view: "organize_pdf",
    label: "Organize PDF",
    title: "Organize PDF",
    category: "PDF",
    path: "/organize-pdf",
    iconBg: "#3a8882",
  },
  {
    view: "watermark_pdf",
    label: "Watermark PDF",
    title: "Watermark PDF",
    category: "PDF",
    path: "/watermark-pdf",
    iconBg: "#46829e",
  },
  {
    view: "word_to_pdf",
    label: "Word to PDF",
    title: "Word to PDF",
    category: "WORD",
    path: "/word-to-pdf",
    iconBg: "#4868a8",
  },
  {
    view: "word_to_jpg",
    label: "Word to Image",
    title: "Word to Image",
    category: "WORD",
    path: "/word-to-jpg",
    iconBg: "#5c64a8",
  },
  {
    view: "pdf_to_word",
    label: "PDF to Word",
    title: "PDF to Word",
    category: "WORD",
    path: "/pdf-to-word",
    iconBg: "#3c7ea6",
  },
  {
    view: "excel_to_pdf",
    label: "Excel to PDF",
    title: "Excel to PDF",
    category: "WORD",
    path: "/excel-to-pdf",
    iconBg: "#2f7d58",
  },
  {
    view: "pdf_to_excel",
    label: "PDF to Excel",
    title: "PDF to Excel",
    category: "WORD",
    path: "/pdf-to-excel",
    iconBg: "#35856c",
  },
  {
    view: "ppt_to_pdf",
    label: "PowerPoint to PDF",
    title: "PowerPoint to PDF",
    category: "WORD",
    path: "/powerpoint-to-pdf",
    iconBg: "#c46238",
  },
  {
    view: "pdf_to_ppt",
    label: "PDF to PowerPoint",
    title: "PDF to PowerPoint",
    category: "WORD",
    path: "/pdf-to-powerpoint",
    iconBg: "#b86b35",
  },
];

export default function HeaderNav({ currentView, onSelectView }: HeaderNavProps) {
  const { theme, toggleTheme } = useTheme();
  const {
    user,
    profile,
    privateInfo,
    isAuthReady,
    isSigningIn,
    signInWithGoogle,
    signOutUser,
  } = useAuth();
  const [isNavOpen, setIsNavOpen] = useState<boolean>(false);
  const [isAccountOpen, setIsAccountOpen] = useState<boolean>(false);
  const [avatarError, setAvatarError] = useState<boolean>(false);
  const suppressHoverRef = useRef<boolean>(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

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
    if (!isAccountOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setIsAccountOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountOpen]);

  useEffect(() => {
    return () => clearHoverTimer();
  }, []);

  const displayName =
    user?.displayName ||
    profile?.displayName ||
    user?.email?.split("@")[0] ||
    "Operator";
  const displayEmail = privateInfo?.email || user?.email || "";
  const googleProviderPhoto = user?.providerData?.find((p) => p?.photoURL)?.photoURL || "";
  const avatarUrl = user?.photoURL || googleProviderPhoto || profile?.photoURL || "";

  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);

  return (
    <div ref={containerRef} className="sticky top-0 z-40">
      {/* ALWAYS VISIBLE STICKY SITE HEADER */}
      <header
        className="border-b-2 border-black bg-black/95 backdrop-blur-md py-2 sm:py-2.5 px-3 sm:px-5 lg:px-8 shrink-0 shadow-md relative z-20"
        id="site-header"
      >
        <div className="w-full flex items-center justify-between gap-3 sm:gap-4">
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
              <h1 className="text-lg xs:text-xl sm:text-2xl font-extrabold uppercase tracking-tight sm:tracking-tighter font-sans leading-none text-white truncate">
                MONO-TRANSCODER
              </h1>
            ) : (
              <span className="text-lg xs:text-xl sm:text-2xl font-extrabold uppercase tracking-tight sm:tracking-tighter font-sans leading-none text-white block truncate">
                MONO-TRANSCODER
              </span>
            )}
            <p className="text-[9px] xs:text-[10px] sm:text-[11px] text-zinc-400 font-mono mt-0.5 uppercase tracking-tight sm:tracking-normal truncate max-w-[210px] xs:max-w-[280px] sm:max-w-none">
              100% Private File Converter &amp; Compressor // Zero Uploads
            </p>
          </a>

          {/* Header Action Controls (Theme Toggle, Sign-In / Google Profile Photo, 3-Line Menu) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* 1. Light / Dark Theme Toggle Button (Animated Dual-Icon Morph) */}
            <button
              type="button"
              onClick={(e) => toggleTheme(e)}
              aria-label={theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
              title={theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
              className="w-8 h-8 sm:w-9 sm:h-9 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 shrink-0 relative overflow-hidden"
            >
              <span
                className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
                  theme === "dark"
                    ? "opacity-100 rotate-0 scale-100"
                    : "opacity-0 -rotate-90 scale-50 pointer-events-none"
                }`}
              >
                <Moon className="w-4 h-4 text-indigo-400" />
              </span>
              <span
                className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
                  theme === "light"
                    ? "opacity-100 rotate-0 scale-100"
                    : "opacity-0 rotate-90 scale-50 pointer-events-none"
                }`}
              >
                <Sun className="w-4 h-4 text-amber-500" />
              </span>
            </button>

            {/* 2. Sign-In Logo / Google Account Profile Photo Button */}
            <div ref={accountMenuRef} className="relative shrink-0">
              {!user ? (
                <button
                  type="button"
                  id="header-sign-in-button"
                  onClick={signInWithGoogle}
                  disabled={!isAuthReady || isSigningIn}
                  aria-label="Sign in with Google"
                  title="Sign in with Google"
                  className="w-8 h-8 sm:w-9 sm:h-9 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 shrink-0 relative overflow-hidden disabled:opacity-60"
                >
                  <UserIcon className="w-4 h-4 text-zinc-200" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    id="header-account-button"
                    onClick={() => {
                      setIsAccountOpen((prev) => !prev);
                    }}
                    aria-expanded={isAccountOpen}
                    aria-label="Open account menu"
                    title={`Signed in as ${displayName}`}
                    className="w-8 h-8 sm:w-9 sm:h-9 p-0 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-700 hover:border-zinc-400 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 shrink-0 relative overflow-hidden"
                  >
                    {avatarUrl && !avatarError ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarError(true)}
                        className="w-full h-full object-cover block"
                      />
                    ) : (
                      <span className="w-full h-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-mono font-bold uppercase">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </button>

                  {isAccountOpen && (
                    <div
                      className="absolute right-0 mt-2 w-72 sm:w-80 bg-zinc-950 border-2 border-zinc-700 rounded-xl shadow-2xl p-3.5 z-50 font-mono text-xs space-y-3 animate-fade-in"
                      role="dialog"
                      aria-label="Account Profile"
                    >
                      <div className="flex items-center gap-3 pb-2.5 border-b border-zinc-800">
                        {avatarUrl && !avatarError ? (
                          <img
                            src={avatarUrl}
                            alt={displayName}
                            referrerPolicy="no-referrer"
                            onError={() => setAvatarError(true)}
                            className="w-10 h-10 rounded-lg object-cover border border-zinc-700 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-emerald-400 shrink-0">
                            <UserIcon className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-white truncate text-xs">
                            {displayName}
                          </p>
                          {displayEmail && (
                            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                              {displayEmail}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          setIsAccountOpen(false);
                          await signOutUser();
                        }}
                        className="w-full py-2 px-3 bg-zinc-900 hover:bg-red-950/60 text-zinc-200 hover:text-red-300 border border-zinc-800 hover:border-red-800/70 rounded-lg flex items-center justify-center gap-2 font-bold uppercase text-xs cursor-pointer transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>SIGN OUT</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 3. 3-Line Hamburger / Red Close Toggle Button */}
            <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <button
                type="button"
                onClick={handleToggleButtonClick}
                aria-expanded={isNavOpen}
                aria-controls="tools-navigation"
                aria-label={isNavOpen ? "Hide Tool Navigation" : "Show Tool Navigation"}
                title={isNavOpen ? "Close Tool Navigation (Esc)" : "Open Tool Navigation"}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] border active:scale-95 relative overflow-hidden ${
                  isNavOpen
                    ? "bg-red-600 hover:bg-red-500 border-red-500 text-white"
                    : "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 hover:border-zinc-500 text-white"
                }`}
              >
                <span
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
                    isNavOpen
                      ? "opacity-0 rotate-90 scale-50 pointer-events-none"
                      : "opacity-100 rotate-0 scale-100"
                  }`}
                >
                  <Menu className="w-4 h-4 text-white" />
                </span>
                <span
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
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

      {/* COMPACT CATEGORIZED TOOL NAVIGATION BAR (CATEGORIES IN COLUMNS) */}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`grid transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
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
            className="border-b-2 border-black bg-zinc-950/98 backdrop-blur-md py-4 px-3 sm:px-5 lg:px-8 shadow-2xl max-h-[calc(100dvh-52px)] overflow-y-auto overscroll-contain"
          >
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 pb-2 items-start">
              {(
                [
                  {
                    key: "PDF" as const,
                    title: "PDF TOOLS",
                  },
                  {
                    key: "WORD" as const,
                    title: "WORD & OFFICE",
                  },
                  {
                    key: "IMAGE" as const,
                    title: "IMAGE TOOLS",
                  },
                  {
                    key: "SIGN" as const,
                    title: "SIGN & SECURITY",
                  },
                ]
              ).map((group) => {
                const groupItems = NAV_ITEMS.filter((i) => i.category === group.key);
                return (
                  <div
                    key={group.key}
                    className="flex flex-col gap-2 bg-black/40 border border-zinc-800/80 rounded-xl p-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800 px-1">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-200">
                        {group.title}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        ({groupItems.length})
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
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
                            aria-label={`Open ${item.title} tool`}
                            className={`group min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all duration-200 cursor-pointer no-underline flex items-center gap-2.5 hover:translate-x-0.5 active:scale-[0.98] ${
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
