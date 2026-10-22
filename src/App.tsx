/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Mail, Copy, Check, ExternalLink, X } from "lucide-react";
import Helmet from "./components/Helmet";
import HeaderNav from "./components/HeaderNav";
import HomeView from "./components/HomeView";
import CompressImgView from "./components/CompressImgView";
import CompressPdfView from "./components/CompressPdfView";
import ConvertImgView from "./components/ConvertImgView";
import ImageToPdfView from "./components/ImageToPdfView";
import MergePdfView from "./components/MergePdfView";
import PdfToImagesView from "./components/PdfToImagesView";
import RemovePdfPagesView from "./components/RemovePdfPagesView";
import OrganizePdfView from "./components/OrganizePdfView";
import WordToPdfView from "./components/WordToPdfView";
import WordToJpgView from "./components/WordToJpgView";
import PdfToWordView from "./components/PdfToWordView";
import ExcelToPdfView from "./components/ExcelToPdfView";
import PptToPdfView from "./components/PptToPdfView";
import PdfToPptView from "./components/PdfToPptView";
import PdfToExcelView from "./components/PdfToExcelView";
import WatermarkPdfView from "./components/WatermarkPdfView";
import LockPdfView from "./components/LockPdfView";
import UnlockPdfView from "./components/UnlockPdfView";
import SignPdfView from "./components/SignPdfView";
import PassportPhotoView from "./components/PassportPhotoView";
import DownloadDeskView from "./components/DownloadDeskView";
import BuyMeCoffeeView from "./components/BuyMeCoffeeView";
import PasswordModal from "./components/PasswordModal";
import GlobalDropOverlay from "./components/GlobalDropOverlay";
import ToolSkeletonLoader from "./components/ToolSkeletonLoader";
import { RetroView } from "./types";

// Lazy-loaded legal & fallback views
const PrivacyView = lazy(() => import("./components/PrivacyView"));
const TermsView = lazy(() => import("./components/TermsView"));
const NotFoundView = lazy(() => import("./components/NotFoundView"));
import { cleanupAllTrackedURLs } from "./utils/urlTracker";
import { ToastProvider } from "./context/ToastContext";
import { FileDropProvider } from "./context/FileDropContext";
import { ThemeProvider } from "./context/ThemeContext";
import { PATH_TO_VIEW_MAP, VIEW_TO_PATH_MAP } from "./utils/routesConfig";

function getViewFromLocation(): RetroView {
  if (typeof window === "undefined") return "home";
  const path = window.location.pathname.toLowerCase().replace(/\/$/, "") || "/";
  return PATH_TO_VIEW_MAP[path] || (path === "/" ? "home" : "not_found");
}

export default function App() {
  const [currentView, setCurrentView] = useState<RetroView>(getViewFromLocation);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [isContactOpen, setIsContactOpen] = useState<boolean>(false);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);

  const handleResetTool = useCallback((tool: string) => {
    setResetKeys((prev) => ({ ...prev, [tool]: (prev[tool] || 0) + 1 }));
    setPendingFile(null);
    setPendingFiles(null);
  }, []);

  // Password prompt state for encrypted PDFs
  const [passwordPrompt, setPasswordPrompt] = useState<{
    isOpen: boolean;
    reason: "required" | "wrong";
    resolve: ((pwd: string | null) => void) | null;
  }>({
    isOpen: false,
    reason: "required",
    resolve: null,
  });

  // Handle browser back/forward history navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(getViewFromLocation());
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Clean up all object URLs when the component unmounts
  useEffect(() => {
    return () => {
      cleanupAllTrackedURLs();
    };
  }, []);

  const handleSelectView = useCallback((view: RetroView) => {
    setCurrentView(view);
    const targetPath = VIEW_TO_PATH_MAP[view] || "/";
    if (window.location.pathname !== targetPath && !view.endsWith("_download")) {
      window.history.pushState({}, "", targetPath);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleRouteWithFiles = useCallback((view: RetroView, files: File[]) => {
    if (files.length > 0) {
      setPendingFile(files[0]);
      setPendingFiles(files);
    }
    handleSelectView(view);
  }, [handleSelectView]);

  // Password modal helper
  const askPassword = useCallback((reason: "required" | "wrong" = "required"): Promise<string | null> => {
    return new Promise((resolve) => {
      setPasswordPrompt({
        isOpen: true,
        reason,
        resolve,
      });
    });
  }, []);

  const handlePasswordSubmit = useCallback((pwd: string) => {
    if (passwordPrompt.resolve) {
      passwordPrompt.resolve(pwd);
    }
    setPasswordPrompt({ isOpen: false, reason: "required", resolve: null });
  }, [passwordPrompt]);

  const handlePasswordCancel = useCallback(() => {
    if (passwordPrompt.resolve) {
      passwordPrompt.resolve(null);
    }
    setPasswordPrompt({ isOpen: false, reason: "required", resolve: null });
  }, [passwordPrompt]);

  return (
    <ThemeProvider>
      <ToastProvider>
        <FileDropProvider currentView={currentView} onRouteWithFiles={handleRouteWithFiles}>
        <div
          className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans transition-colors duration-200 relative"
          id="application-root"
        >
          <Helmet currentView={currentView} path={VIEW_TO_PATH_MAP[currentView]} />

          {/* GLOBAL FULL-SCREEN DRAG AND DROP OVERLAY */}
          <GlobalDropOverlay currentView={currentView} onSelectView={handleSelectView} />

          {/* HEADER & TOP CONTROL DECK */}
          <HeaderNav currentView={currentView} onSelectView={handleSelectView} />

          {/* PASSWORD DIALOG FOR ENCRYPTED PDFS */}
          {passwordPrompt.isOpen && (
            <PasswordModal
              reason={passwordPrompt.reason}
              onSubmit={handlePasswordSubmit}
              onCancel={handlePasswordCancel}
            />
          )}

          {/* MAIN WORKSPACE CANVAS */}
          <main className="flex-1 max-w-[1800px] w-full mx-auto p-3 sm:p-5 md:p-8" id="workspace-canvas">
            <Suspense fallback={<ToolSkeletonLoader variant="download_desk" />}>
              {currentView === "home" && (
                <HomeView
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onSelectView={handleSelectView}
                  onOpenContact={() => {
                    setIsContactOpen(true);
                    setTimeout(() => {
                      document.getElementById("footer-contact-details")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }, 50);
                  }}
                />
              )}

              {(currentView === "compress_img" || currentView === "compress_img_download") && (
                <div className={currentView === "compress_img" ? "block" : "hidden"}>
                  <CompressImgView
                    key={`compress_img_${resetKeys.compress_img || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("compress_img_download")}
                  />
                </div>
              )}

              {(currentView === "compress_pdf" || currentView === "compress_pdf_download") && (
                <div className={currentView === "compress_pdf" ? "block" : "hidden"}>
                  <CompressPdfView
                    key={`compress_pdf_${resetKeys.compress_pdf || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("compress_pdf_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "convert_img" || currentView === "convert_img_download") && (
                <div className={currentView === "convert_img" ? "block" : "hidden"}>
                  <ConvertImgView
                    key={`convert_img_${resetKeys.convert_img || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("convert_img_download")}
                  />
                </div>
              )}

              {(currentView === "image_to_pdf" || currentView === "image_to_pdf_download") && (
                <div className={currentView === "image_to_pdf" ? "block" : "hidden"}>
                  <ImageToPdfView
                    key={`image_to_pdf_${resetKeys.image_to_pdf || 0}`}
                    initialFiles={pendingFiles}
                    onSuccess={() => setCurrentView("image_to_pdf_download")}
                  />
                </div>
              )}

              {(currentView === "merge_pdf" || currentView === "merge_pdf_download") && (
                <div className={currentView === "merge_pdf" ? "block" : "hidden"}>
                  <MergePdfView
                    key={`merge_pdf_${resetKeys.merge_pdf || 0}`}
                    initialFiles={pendingFiles}
                    onSuccess={() => setCurrentView("merge_pdf_download")}
                  />
                </div>
              )}

              {(currentView === "pdf_to_images" || currentView === "pdf_to_images_download") && (
                <div className={currentView === "pdf_to_images" ? "block" : "hidden"}>
                  <PdfToImagesView
                    key={`pdf_to_images_${resetKeys.pdf_to_images || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("pdf_to_images_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "remove_pdf_pages" || currentView === "remove_pdf_pages_download") && (
                <div className={currentView === "remove_pdf_pages" ? "block" : "hidden"}>
                  <RemovePdfPagesView
                    key={`remove_pdf_pages_${resetKeys.remove_pdf_pages || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("remove_pdf_pages_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "organize_pdf" || currentView === "organize_pdf_download") && (
                <div className={currentView === "organize_pdf" ? "block" : "hidden"}>
                  <OrganizePdfView
                    key={`organize_pdf_${resetKeys.organize_pdf || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("organize_pdf_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "word_to_pdf" || currentView === "word_to_pdf_download") && (
                <div className={currentView === "word_to_pdf" ? "block" : "hidden"}>
                  <WordToPdfView
                    key={`word_to_pdf_${resetKeys.word_to_pdf || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("word_to_pdf_download")}
                  />
                </div>
              )}

              {(currentView === "word_to_jpg" || currentView === "word_to_jpg_download") && (
                <div className={currentView === "word_to_jpg" ? "block" : "hidden"}>
                  <WordToJpgView
                    key={`word_to_jpg_${resetKeys.word_to_jpg || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("word_to_jpg_download")}
                  />
                </div>
              )}

              {(currentView === "pdf_to_word" || currentView === "pdf_to_word_download") && (
                <div className={currentView === "pdf_to_word" ? "block" : "hidden"}>
                  <PdfToWordView
                    key={`pdf_to_word_${resetKeys.pdf_to_word || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("pdf_to_word_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "excel_to_pdf" || currentView === "excel_to_pdf_download") && (
                <div className={currentView === "excel_to_pdf" ? "block" : "hidden"}>
                  <ExcelToPdfView
                    key={`excel_to_pdf_${resetKeys.excel_to_pdf || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("excel_to_pdf_download")}
                  />
                </div>
              )}

              {(currentView === "ppt_to_pdf" || currentView === "ppt_to_pdf_download") && (
                <div className={currentView === "ppt_to_pdf" ? "block" : "hidden"}>
                  <PptToPdfView
                    key={`ppt_to_pdf_${resetKeys.ppt_to_pdf || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("ppt_to_pdf_download")}
                  />
                </div>
              )}

              {(currentView === "pdf_to_ppt" || currentView === "pdf_to_ppt_download") && (
                <div className={currentView === "pdf_to_ppt" ? "block" : "hidden"}>
                  <PdfToPptView
                    key={`pdf_to_ppt_${resetKeys.pdf_to_ppt || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("pdf_to_ppt_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "pdf_to_excel" || currentView === "pdf_to_excel_download") && (
                <div className={currentView === "pdf_to_excel" ? "block" : "hidden"}>
                  <PdfToExcelView
                    key={`pdf_to_excel_${resetKeys.pdf_to_excel || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("pdf_to_excel_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "watermark_pdf" || currentView === "watermark_pdf_download") && (
                <div className={currentView === "watermark_pdf" ? "block" : "hidden"}>
                  <WatermarkPdfView
                    key={`watermark_pdf_${resetKeys.watermark_pdf || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("watermark_pdf_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "lock_pdf" || currentView === "lock_pdf_download") && (
                <div className={currentView === "lock_pdf" ? "block" : "hidden"}>
                  <LockPdfView
                    key={`lock_pdf_${resetKeys.lock_pdf || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("lock_pdf_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "unlock_pdf" || currentView === "unlock_pdf_download") && (
                <div className={currentView === "unlock_pdf" ? "block" : "hidden"}>
                  <UnlockPdfView
                    key={`unlock_pdf_${resetKeys.unlock_pdf || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("unlock_pdf_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "sign_pdf" || currentView === "sign_pdf_download") && (
                <div className={currentView === "sign_pdf" ? "block" : "hidden"}>
                  <SignPdfView
                    key={`sign_pdf_${resetKeys.sign_pdf || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("sign_pdf_download")}
                    askPassword={askPassword}
                  />
                </div>
              )}

              {(currentView === "passport_photo" || currentView === "passport_photo_download") && (
                <div className={currentView === "passport_photo" ? "block" : "hidden"}>
                  <PassportPhotoView
                    key={`passport_photo_${resetKeys.passport_photo || 0}`}
                    initialFile={pendingFile}
                    onSuccess={() => setCurrentView("passport_photo_download")}
                  />
                </div>
              )}

              {/* DOWNLOAD DESK VIEW */}
              {currentView.endsWith("_download") && (
                <div className="animate-fade-in">
                  <DownloadDeskView
                    toolKey={currentView.replace("_download", "")}
                    sourceView={currentView.replace("_download", "") as RetroView}
                    onBack={() => setCurrentView(currentView.replace("_download", "") as RetroView)}
                    onAnotherFile={() => {
                      const tool = currentView.replace("_download", "");
                      handleResetTool(tool);
                      setCurrentView(tool as RetroView);
                    }}
                    onBuyMeCoffee={() => handleSelectView("coffee")}
                  />
                </div>
              )}

              {/* LEGAL VIEWS */}
              {currentView === "privacy" && (
                <PrivacyView onBack={() => handleSelectView("home")} />
              )}

              {currentView === "terms" && (
                <TermsView onBack={() => handleSelectView("home")} />
              )}

              {/* BUY ME A COFFEE DEDICATED VIEW */}
              {currentView === "coffee" && (
                <BuyMeCoffeeView
                  onBack={() => handleSelectView("home")}
                  isContactOpen={isContactOpen}
                  onOpenContact={() => {
                    setIsContactOpen((prev) => !prev);
                    setTimeout(() => {
                      document.getElementById("footer-contact-details")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }, 50);
                  }}
                />
              )}

              {/* 404 NOT FOUND */}
              {currentView === "not_found" && (
                <NotFoundView
                  onBack={() => handleSelectView("home")}
                  requestedPath={typeof window !== "undefined" ? window.location.pathname : ""}
                />
              )}
            </Suspense>
          </main>

        {/* FOOTER */}
        <footer className="border-t-3 border-black bg-zinc-950 py-6 sm:py-8 px-3 sm:px-4 md:px-8 shrink-0 text-zinc-400 font-mono text-xs mt-8 sm:mt-12" id="application-footer">
          <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row justify-between items-center gap-5 sm:gap-6">
            <div className="flex flex-col items-center md:items-start gap-1 text-center md:text-left">
              <span className="font-bold text-white uppercase tracking-wider text-[11px] sm:text-xs">
                MONO-TRANSCODER // VER 2.5.0
              </span>
              <span className="text-[10px] sm:text-[11px] text-zinc-500">
                100% Client-Side In-Memory File Processing Engine // Zero-Telemetry
              </span>
            </div>

            <div className="flex flex-col items-center md:items-end gap-2.5 w-full md:w-auto">
              <nav aria-label="Footer Navigation" className="flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-3 gap-y-1.5 text-[11px] sm:text-xs font-mono font-bold uppercase">
                <button
                  type="button"
                  id="footer-contact-button"
                  onClick={() => {
                    setIsContactOpen((prev) => !prev);
                    setCopiedEmail(false);
                  }}
                  className={`cursor-pointer uppercase underline underline-offset-3 transition-all duration-300 ease-in-out py-1 px-1 ${
                    isContactOpen
                      ? "text-emerald-400 font-extrabold decoration-emerald-400"
                      : "text-zinc-400 decoration-zinc-500/30 hover:text-emerald-300 hover:decoration-emerald-300"
                  }`}
                  aria-label="Toggle contact information"
                  aria-expanded={isContactOpen}
                >
                  CONTACT_US
                </button>
                <span className="hidden sm:inline text-zinc-600" aria-hidden="true">|</span>
                <a
                  href="/buy-me-a-coffee"
                  id="footer-coffee-link"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelectView("coffee");
                  }}
                  className={`cursor-pointer uppercase underline underline-offset-3 transition-all duration-300 ease-in-out py-1 px-1 ${
                    currentView === "coffee"
                      ? "text-amber-400 font-extrabold decoration-amber-400"
                      : "text-zinc-400 decoration-zinc-500/30 hover:text-amber-300 hover:decoration-amber-400 active:text-amber-400 active:decoration-amber-400"
                  }`}
                  aria-label="Navigate to Buy Me A Coffee page"
                >
                  BUY_ME_A_COFFEE
                </a>
                <span className="hidden sm:inline text-zinc-600" aria-hidden="true">|</span>
                <a
                  href="/privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelectView("privacy");
                  }}
                  className="hover:text-white underline cursor-pointer py-1 px-1"
                  aria-label="View Privacy Policy"
                >
                  PRIVACY_POLICY
                </a>
                <span className="hidden sm:inline text-zinc-600" aria-hidden="true">|</span>
                <a
                  href="/terms"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelectView("terms");
                  }}
                  className="hover:text-white underline cursor-pointer py-1 px-1"
                  aria-label="View Terms of Service"
                >
                  TERMS_OF_SERVICE
                </a>
                <span className="hidden sm:inline text-zinc-600" aria-hidden="true">|</span>
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelectView("home");
                  }}
                  className="hover:text-white underline cursor-pointer py-1 px-1"
                  aria-label="Back to System Deck"
                >
                  SYSTEM_DECK
                </a>
              </nav>

              {/* Smooth Animated Email Drawer directly below CONTACT_US */}
              <div
                className={`grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] max-w-full ${
                  isContactOpen
                    ? "grid-rows-[1fr] opacity-100 translate-y-0 mt-1 pointer-events-auto"
                    : "grid-rows-[0fr] opacity-0 -translate-y-1 mt-0 pointer-events-none"
                }`}
              >
                <div className="overflow-hidden">
                  <div
                    id="footer-contact-details"
                    aria-hidden={!isContactOpen}
                    className="flex flex-wrap sm:flex-nowrap items-center justify-center sm:justify-start gap-2 p-2 sm:p-2.5 px-3 bg-zinc-950 border-2 border-zinc-700 rounded-lg text-xs font-mono text-white shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] max-w-full overflow-hidden"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-white shrink-0" aria-hidden="true" />
                      <a
                        href="mailto:burnster1826@gmail.com"
                        tabIndex={isContactOpen ? 0 : -1}
                        className="hover:text-white underline font-bold tracking-tight text-zinc-200 transition-colors truncate max-w-[210px] xs:max-w-none text-[11px] sm:text-xs"
                        title="Click to send email"
                      >
                        burnster1826@gmail.com
                      </a>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        tabIndex={isContactOpen ? 0 : -1}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText("burnster1826@gmail.com");
                            setCopiedEmail(true);
                            setTimeout(() => setCopiedEmail(false), 2000);
                          } catch {
                            // fallback
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded text-[10px] font-bold cursor-pointer transition-all duration-150 active:scale-95"
                        title="Copy email to clipboard"
                      >
                        {copiedEmail ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">COPIED</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>COPY</span>
                          </>
                        )}
                      </button>
                      <a
                        href="mailto:burnster1826@gmail.com"
                        tabIndex={isContactOpen ? 0 : -1}
                        className="p-1 hover:text-white text-zinc-400 transition-colors"
                        title="Open mail client"
                        aria-label="Open mail client"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CRAWLABLE INTERNAL TOOL LINKS FOR SEARCH ENGINE INDEXING */}
          <div className="max-w-[1800px] mx-auto mt-6 pt-5 border-t border-zinc-900/80">
            <nav aria-label="All File Conversion & Compression Tools" className="flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1.5 text-[10px] text-zinc-500">
              <span className="text-zinc-400 font-bold uppercase tracking-wider mr-1">TOOLS_INDEX:</span>
              {[
                { label: "Image Compressor (KB)", view: "compress_img" as RetroView, href: "/compress-image" },
                { label: "Compress PDF", view: "compress_pdf" as RetroView, href: "/compress-pdf" },
                { label: "Merge PDF", view: "merge_pdf" as RetroView, href: "/merge-pdf" },
                { label: "Sign PDF", view: "sign_pdf" as RetroView, href: "/sign-pdf" },
                { label: "JPG to PDF", view: "image_to_pdf" as RetroView, href: "/image-to-pdf" },
                { label: "Convert Image", view: "convert_img" as RetroView, href: "/convert-image" },
                { label: "PDF to JPG", view: "pdf_to_images" as RetroView, href: "/pdf-to-images" },
                { label: "Remove PDF Pages", view: "remove_pdf_pages" as RetroView, href: "/remove-pdf-pages" },
                { label: "Organize PDF", view: "organize_pdf" as RetroView, href: "/organize-pdf" },
                { label: "Word to PDF", view: "word_to_pdf" as RetroView, href: "/word-to-pdf" },
                { label: "Word to JPG", view: "word_to_jpg" as RetroView, href: "/word-to-jpg" },
                { label: "PDF to Word", view: "pdf_to_word" as RetroView, href: "/pdf-to-word" },
                { label: "Excel to PDF", view: "excel_to_pdf" as RetroView, href: "/excel-to-pdf" },
                { label: "PowerPoint to PDF", view: "ppt_to_pdf" as RetroView, href: "/powerpoint-to-pdf" },
                { label: "PDF to PowerPoint", view: "pdf_to_ppt" as RetroView, href: "/pdf-to-powerpoint" },
                { label: "PDF to Excel", view: "pdf_to_excel" as RetroView, href: "/pdf-to-excel" },
                { label: "Watermark PDF", view: "watermark_pdf" as RetroView, href: "/watermark-pdf" },
                { label: "Lock PDF", view: "lock_pdf" as RetroView, href: "/lock-pdf" },
                { label: "Unlock PDF", view: "unlock_pdf" as RetroView, href: "/unlock-pdf" },
                { label: "Passport Photo Maker", view: "passport_photo" as RetroView, href: "/passport-photo" },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelectView(item.view);
                  }}
                  className={`hover:text-zinc-200 transition-colors underline decoration-zinc-800 hover:decoration-zinc-400 underline-offset-2 ${
                    currentView === item.view ? "text-white font-bold decoration-white" : ""
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </footer>
        </div>
      </FileDropProvider>
    </ToastProvider>
  </ThemeProvider>
);
}
