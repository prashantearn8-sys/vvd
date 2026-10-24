/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { X, Mail, Copy, Check } from "lucide-react";
import { RetroView } from "./types";
import HeaderNav from "./components/HeaderNav";
import GlobalDropOverlay from "./components/GlobalDropOverlay";
import PasswordModal from "./components/PasswordModal";
import Helmet from "./components/Helmet";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { FileDropProvider } from "./context/FileDropContext";
import { AuthProvider } from "./context/AuthContext";
import {
  PATH_TO_VIEW,
  VIEW_TO_PATH,
  getPresetKBFromPath,
  normalizePathname,
} from "./utils/routesConfig";

// Code-split all views via React.lazy so initial load only fetches the active route chunk
const HomeView = React.lazy(() => import("./components/HomeView"));
const CompressImgView = React.lazy(() => import("./components/CompressImgView"));
const CompressPdfView = React.lazy(() => import("./components/CompressPdfView"));
const ConvertImgView = React.lazy(() => import("./components/ConvertImgView"));
const ImageToPdfView = React.lazy(() => import("./components/ImageToPdfView"));
const MergePdfView = React.lazy(() => import("./components/MergePdfView"));
const PdfToImagesView = React.lazy(() => import("./components/PdfToImagesView"));
const RemovePdfPagesView = React.lazy(() => import("./components/RemovePdfPagesView"));
const OrganizePdfView = React.lazy(() => import("./components/OrganizePdfView"));
const WatermarkPdfView = React.lazy(() => import("./components/WatermarkPdfView"));
const WordToPdfView = React.lazy(() => import("./components/WordToPdfView"));
const WordToJpgView = React.lazy(() => import("./components/WordToJpgView"));
const PdfToWordView = React.lazy(() => import("./components/PdfToWordView"));
const ExcelToPdfView = React.lazy(() => import("./components/ExcelToPdfView"));
const PdfToExcelView = React.lazy(() => import("./components/PdfToExcelView"));
const PptToPdfView = React.lazy(() => import("./components/PptToPdfView"));
const PdfToPptView = React.lazy(() => import("./components/PdfToPptView"));
const LockPdfView = React.lazy(() => import("./components/LockPdfView"));
const UnlockPdfView = React.lazy(() => import("./components/UnlockPdfView"));
const SignPdfView = React.lazy(() => import("./components/SignPdfView"));
const PassportPhotoView = React.lazy(() => import("./components/PassportPhotoView"));
const DownloadDeskView = React.lazy(() => import("./components/DownloadDeskView"));
const BuyMeCoffeeView = React.lazy(() => import("./components/BuyMeCoffeeView"));
const PrivacyView = React.lazy(() => import("./components/PrivacyView"));
const TermsView = React.lazy(() => import("./components/TermsView"));
const NotFoundView = React.lazy(() => import("./components/NotFoundView"));

function resolveViewFromLocation(): RetroView {
  if (typeof window === "undefined") return "home";
  const clean = normalizePathname(window.location.pathname);
  return PATH_TO_VIEW[clean] || "not_found";
}

export default function App() {
  const [currentView, setCurrentView] = useState<RetroView>(resolveViewFromLocation);
  const [presetTargetKB, setPresetTargetKB] = useState<number | undefined>(() =>
    typeof window !== "undefined" ? getPresetKBFromPath(window.location.pathname) : undefined
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [routedFiles, setRoutedFiles] = useState<File[] | null>(null);
  const [isContactOpen, setIsContactOpen] = useState<boolean>(false);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);

  // Password modal state for encrypted PDF tools
  const [pwdModalState, setPwdModalState] = useState<{
    isOpen: boolean;
    reason: "required" | "wrong";
  }>({ isOpen: false, reason: "required" });
  const pwdResolverRef = useRef<((pwd: string | null) => void) | null>(null);

  const askPassword = useCallback(
    (reason: "wrong" | "required" = "required"): Promise<string | null> => {
      return new Promise((resolve) => {
        pwdResolverRef.current = resolve;
        setPwdModalState({ isOpen: true, reason });
      });
    },
    []
  );

  const handlePasswordSubmit = (pwd: string) => {
    setPwdModalState((prev) => ({ ...prev, isOpen: false }));
    if (pwdResolverRef.current) {
      pwdResolverRef.current(pwd);
      pwdResolverRef.current = null;
    }
  };

  const handlePasswordCancel = () => {
    setPwdModalState((prev) => ({ ...prev, isOpen: false }));
    if (pwdResolverRef.current) {
      pwdResolverRef.current(null);
      pwdResolverRef.current = null;
    }
  };

  const handleSelectView = useCallback((view: RetroView, preserveRoutedFiles = false) => {
    if (!preserveRoutedFiles) {
      setRoutedFiles(null);
    }
    setCurrentView(view);

    if (typeof window !== "undefined") {
      if (!view.endsWith("_download") && view !== "not_found") {
        const targetPath = VIEW_TO_PATH[view] || "/";
        setPresetTargetKB(getPresetKBFromPath(targetPath));
        if (window.location.pathname !== targetPath) {
          window.history.pushState({ view }, "", targetPath);
        }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleRouteWithFiles = useCallback(
    (view: RetroView, files: File[]) => {
      setRoutedFiles(files);
      handleSelectView(view, true);
    },
    [handleSelectView]
  );

  useEffect(() => {
    const onPopState = () => {
      const path = normalizePathname(window.location.pathname);
      setPresetTargetKB(getPresetKBFromPath(path));
      const mapped = PATH_TO_VIEW[path];
      setCurrentView(mapped || "not_found");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("burnster1826@gmail.com");
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const renderDownloadView = (toolKey: string, sourceView: RetroView) => (
    <DownloadDeskView
      toolKey={toolKey}
      sourceView={sourceView}
      onAnotherFile={() => handleSelectView(sourceView)}
      onBack={() => handleSelectView("home")}
      onBuyMeCoffee={() => handleSelectView("coffee")}
    />
  );

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <FileDropProvider currentView={currentView} onRouteWithFiles={handleRouteWithFiles}>
            <Helmet view={currentView} />
            <div
              id="application-root"
              className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-white selection:text-black"
            >
              <HeaderNav currentView={currentView} onSelectView={handleSelectView} />
              <GlobalDropOverlay currentView={currentView} onSelectView={handleSelectView} />

              <main className="flex-1 w-full px-3 sm:px-5 lg:px-8 py-4 sm:py-6">
                <Suspense fallback={null}>
                  {currentView === "home" && (
                    <HomeView
                      searchQuery={searchQuery}
                      onSearchChange={setSearchQuery}
                      onSelectView={handleSelectView}
                    />
                  )}

                  {currentView === "compress_img" && (
                    <CompressImgView
                      onSuccess={() => handleSelectView("compress_img_download")}
                      initialFile={routedFiles?.[0] || null}
                      initialTargetKB={presetTargetKB}
                    />
                  )}
                  {currentView === "compress_img_download" &&
                    renderDownloadView("compress_img", "compress_img")}

                  {currentView === "compress_pdf" && (
                    <CompressPdfView
                      onSuccess={() => handleSelectView("compress_pdf_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "compress_pdf_download" &&
                    renderDownloadView("compress_pdf", "compress_pdf")}

                  {currentView === "convert_img" && (
                    <ConvertImgView
                      onSuccess={() => handleSelectView("convert_img_download")}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "convert_img_download" &&
                    renderDownloadView("convert_img", "convert_img")}

                  {currentView === "image_to_pdf" && (
                    <ImageToPdfView
                      onSuccess={() => handleSelectView("image_to_pdf_download")}
                      initialFiles={routedFiles}
                    />
                  )}
                  {currentView === "image_to_pdf_download" &&
                    renderDownloadView("image_to_pdf", "image_to_pdf")}

                  {currentView === "merge_pdf" && (
                    <MergePdfView
                      onSuccess={() => handleSelectView("merge_pdf_download")}
                      initialFiles={routedFiles}
                    />
                  )}
                  {currentView === "merge_pdf_download" &&
                    renderDownloadView("merge_pdf", "merge_pdf")}

                  {currentView === "pdf_to_images" && (
                    <PdfToImagesView
                      onSuccess={() => handleSelectView("pdf_to_images_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "pdf_to_images_download" &&
                    renderDownloadView("pdf_to_images", "pdf_to_images")}

                  {currentView === "remove_pdf_pages" && (
                    <RemovePdfPagesView
                      onSuccess={() => handleSelectView("remove_pdf_pages_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "remove_pdf_pages_download" &&
                    renderDownloadView("remove_pdf_pages", "remove_pdf_pages")}

                  {currentView === "organize_pdf" && (
                    <OrganizePdfView
                      onSuccess={() => handleSelectView("organize_pdf_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "organize_pdf_download" &&
                    renderDownloadView("organize_pdf", "organize_pdf")}

                  {currentView === "watermark_pdf" && (
                    <WatermarkPdfView
                      onSuccess={() => handleSelectView("watermark_pdf_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "watermark_pdf_download" &&
                    renderDownloadView("watermark_pdf", "watermark_pdf")}

                  {currentView === "word_to_pdf" && (
                    <WordToPdfView
                      onSuccess={() => handleSelectView("word_to_pdf_download")}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "word_to_pdf_download" &&
                    renderDownloadView("word_to_pdf", "word_to_pdf")}

                  {currentView === "word_to_jpg" && (
                    <WordToJpgView
                      onSuccess={() => handleSelectView("word_to_jpg_download")}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "word_to_jpg_download" &&
                    renderDownloadView("word_to_jpg", "word_to_jpg")}

                  {currentView === "pdf_to_word" && (
                    <PdfToWordView
                      onSuccess={() => handleSelectView("pdf_to_word_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "pdf_to_word_download" &&
                    renderDownloadView("pdf_to_word", "pdf_to_word")}

                  {currentView === "excel_to_pdf" && (
                    <ExcelToPdfView
                      onSuccess={() => handleSelectView("excel_to_pdf_download")}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "excel_to_pdf_download" &&
                    renderDownloadView("excel_to_pdf", "excel_to_pdf")}

                  {currentView === "pdf_to_excel" && (
                    <PdfToExcelView
                      onSuccess={() => handleSelectView("pdf_to_excel_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "pdf_to_excel_download" &&
                    renderDownloadView("pdf_to_excel", "pdf_to_excel")}

                  {currentView === "ppt_to_pdf" && (
                    <PptToPdfView
                      onSuccess={() => handleSelectView("ppt_to_pdf_download")}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "ppt_to_pdf_download" &&
                    renderDownloadView("ppt_to_pdf", "ppt_to_pdf")}

                  {currentView === "pdf_to_ppt" && (
                    <PdfToPptView
                      onSuccess={() => handleSelectView("pdf_to_ppt_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "pdf_to_ppt_download" &&
                    renderDownloadView("pdf_to_ppt", "pdf_to_ppt")}

                  {currentView === "lock_pdf" && (
                    <LockPdfView
                      onSuccess={() => handleSelectView("lock_pdf_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "lock_pdf_download" &&
                    renderDownloadView("lock_pdf", "lock_pdf")}

                  {currentView === "unlock_pdf" && (
                    <UnlockPdfView
                      onSuccess={() => handleSelectView("unlock_pdf_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "unlock_pdf_download" &&
                    renderDownloadView("unlock_pdf", "unlock_pdf")}

                  {currentView === "sign_pdf" && (
                    <SignPdfView
                      onSuccess={() => handleSelectView("sign_pdf_download")}
                      askPassword={askPassword}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "sign_pdf_download" &&
                    renderDownloadView("sign_pdf", "sign_pdf")}

                  {currentView === "passport_photo" && (
                    <PassportPhotoView
                      onSuccess={() => handleSelectView("passport_photo_download")}
                      initialFile={routedFiles?.[0] || null}
                    />
                  )}
                  {currentView === "passport_photo_download" &&
                    renderDownloadView("passport_photo", "passport_photo")}

                  {currentView === "coffee" && (
                    <BuyMeCoffeeView onBack={() => handleSelectView("home")} />
                  )}

                  {currentView === "privacy" && (
                    <PrivacyView onBack={() => handleSelectView("home")} />
                  )}

                  {currentView === "terms" && (
                    <TermsView onBack={() => handleSelectView("home")} />
                  )}

                  {currentView === "not_found" && (
                    <NotFoundView onBack={() => handleSelectView("home")} />
                  )}
                </Suspense>
              </main>

              {/* Footer */}
              <footer id="application-footer" className="border-t border-zinc-800/80 py-5 px-3 sm:px-5 lg:px-8 mt-auto bg-black">
                <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-zinc-400">
                  <div>
                    MONO-TRANSCODER //YOUR DOCUMENTS &amp; PHOTOS NEVER LEAVE YOUR DEVICE
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      id="footer-contact-button"
                      onClick={() => setIsContactOpen(true)}
                      className="hover:text-white transition-colors cursor-pointer"
                    >
                      Contact
                    </button>
                    <a
                      href="/privacy"
                      onClick={(e) => {
                        e.preventDefault();
                        handleSelectView("privacy");
                      }}
                      className="hover:text-white transition-colors"
                    >
                      Privacy Policy
                    </a>
                    <a
                      href="/terms"
                      onClick={(e) => {
                        e.preventDefault();
                        handleSelectView("terms");
                      }}
                      className="hover:text-white transition-colors"
                    >
                      Terms of Service
                    </a>
                    <a
                      href="/support"
                      id="footer-coffee-link"
                      onClick={(e) => {
                        e.preventDefault();
                        handleSelectView("coffee");
                      }}
                      className="hover:text-white transition-colors"
                    >
                      Buy Me a Coffee
                    </a>
                  </div>
                </div>
              </footer>

              {/* Contact Modal */}
              {isContactOpen && (
                <div
                  className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="contact-modal-title"
                  onClick={() => setIsContactOpen(false)}
                >
                  <div
                    className="bg-zinc-950 border-2 border-zinc-800 rounded-xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                      <h2
                        id="contact-modal-title"
                        className="text-sm sm:text-base font-bold text-white font-sans flex items-center gap-2"
                      >
                        <Mail className="w-4 h-4 text-emerald-400" />
                        <span>Contact &amp; Support</span>
                      </h2>
                      <button
                        type="button"
                        onClick={() => setIsContactOpen(false)}
                        aria-label="Close Contact Modal"
                        className="p-1.5 rounded-lg border border-zinc-800 hover:border-white text-zinc-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs font-mono text-zinc-400 leading-relaxed">
                      Have a bug report, feature request, or question about MONO-TRANSCODER? Reach out directly via email:
                    </p>
                    <div className="bg-black border border-zinc-800 rounded-lg p-3 flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-bold text-white truncate">
                        burnster1826@gmail.com
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyEmail}
                        className="px-2.5 py-1.5 bg-white text-black rounded text-[11px] font-mono font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {copiedEmail ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>COPIED</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>COPY</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="pt-1 flex justify-end">
                      <a
                        href="mailto:burnster1826@gmail.com?subject=MONO-TRANSCODER%20Feedback"
                        className="px-3.5 py-2 bg-white text-black rounded-lg text-xs font-mono font-bold uppercase no-underline hover:bg-zinc-200 transition-colors"
                      >
                        SEND EMAIL
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {pwdModalState.isOpen && (
                <PasswordModal
                  reason={pwdModalState.reason}
                  onSubmit={handlePasswordSubmit}
                  onCancel={handlePasswordCancel}
                />
              )}
            </div>
          </FileDropProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
