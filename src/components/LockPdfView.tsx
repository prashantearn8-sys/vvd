/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  Lock,
  FolderOpen,
  Zap,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { loadPdfJsLibrary } from "../utils/pdfProcessor";
import { encryptPdfBuffer } from "../utils/pdfCrypto";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ModuleIconBadge from "./ModuleIconBadge";

interface LockPdfViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

export default function LockPdfView({
  onSuccess,
  askPassword,
  initialFile,
}: LockPdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [sourceOpenPassword, setSourceOpenPassword] = useState<string | undefined>(undefined);
  const [pageCount, setPageCount] = useState<number>(0);
  const [coverThumbUrl, setCoverThumbUrl] = useState<string>("");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Password required to open the PDF
  const [userPassword, setUserPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);

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
      setProgressMsg("INSPECTING_PDF_DOCUMENT...");

      let pdfDoc: any = null;
      let usedPwd: string | undefined = undefined;
      try {
        await yieldFrame();
        const arrayBuffer = await selected.arrayBuffer();
        const pdfjsLib = await loadPdfJsLibrary();

        const openWithPwd = async (pwd?: string): Promise<any> => {
          const params: any = { data: new Uint8Array(arrayBuffer.slice(0)) };
          if (pwd) params.password = pwd;
          try {
            const loaded = await pdfjsLib.getDocument(params).promise;
            usedPwd = pwd;
            return loaded;
          } catch (err: any) {
            const isPwd =
              err?.name === "PasswordException" ||
              err?.name === "IncorrectPasswordException" ||
              String(err?.message || "").toLowerCase().includes("password");
            if (isPwd) {
              const entered = await askPassword(pwd ? "wrong" : "required");
              if (entered === null) {
                throw new Error("Password prompt cancelled.");
              }
              return openWithPwd(entered);
            }
            throw err;
          }
        };

        pdfDoc = await openWithPwd();
        const total = pdfDoc.numPages;
        const page = await pdfDoc.getPage(1);
        const vp = page.getViewport({ scale: 0.8 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(vp.width));
        canvas.height = Math.max(1, Math.round(vp.height));
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
        }
        setCoverThumbUrl(canvas.toDataURL("image/jpeg", 0.85));
        canvas.width = 0;
        canvas.height = 0;
        if (typeof page.cleanup === "function") page.cleanup();

        setPdfBuffer(arrayBuffer);
        setSourceOpenPassword(usedPwd);
        setPageCount(total);
      } catch (err: any) {
        logger.error("Lock PDF load error:", err);
        showToast(`Failed to load PDF: ${err?.message || err}`, "error");
        setFile(null);
        setPdfBuffer(null);
      } finally {
        if (pdfDoc && typeof pdfDoc.destroy === "function") {
          pdfDoc.destroy();
        }
        setIsParsing(false);
        setProgressMsg("");
      }
    },
    [askPassword, showToast]
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

  const passwordStrength = useMemo(() => {
    if (!userPassword) return { label: "ENTER PASSWORD", color: "text-zinc-500", pct: 0 };
    let score = 0;
    if (userPassword.length >= 4) score += 25;
    if (userPassword.length >= 8) score += 25;
    if (/[A-Z]/.test(userPassword) && /[a-z]/.test(userPassword)) score += 25;
    if (/\d/.test(userPassword) || /[^A-Za-z0-9]/.test(userPassword)) score += 25;

    if (score <= 25) return { label: "BASIC", color: "text-amber-400", pct: 25 };
    if (score <= 50) return { label: "MODERATE", color: "text-sky-400", pct: 50 };
    if (score <= 75) return { label: "STRONG", color: "text-emerald-400", pct: 75 };
    return { label: "MAXIMUM", color: "text-emerald-400", pct: 100 };
  }, [userPassword]);

  const passwordsMatch =
    userPassword.length > 0 &&
    confirmPassword.length > 0 &&
    userPassword === confirmPassword;

  const handleReset = () => {
    setFile(null);
    setPdfBuffer(null);
    setSourceOpenPassword(undefined);
    setPageCount(0);
    setCoverThumbUrl("");
    setUserPassword("");
    setConfirmPassword("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /**
   * Rebuilds an unencrypted PDF buffer from PDF.js if source was previously encrypted or has non-standard streams
   */
  const buildCleanPdfBufferViaPdfJs = async (
    rawBuf: ArrayBuffer,
    pwd?: string
  ): Promise<ArrayBuffer> => {
    const pdfjsLib = await loadPdfJsLibrary();
    const params: any = { data: new Uint8Array(rawBuf.slice(0)) };
    if (pwd) params.password = pwd;
    const pdfJsDoc = await pdfjsLib.getDocument(params).promise;
    const outPdf = await PDFDocument.create();

    try {
      for (let p = 1; p <= pdfJsDoc.numPages; p++) {
        setProgressMsg(`PREPARING_PAGE_${p}_OF_${pdfJsDoc.numPages}...`);
        await yieldFrame();
        const page = await pdfJsDoc.getPage(p);
        const origVp = page.getViewport({ scale: 1.0 });
        const renderVp = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(renderVp.width));
        canvas.height = Math.max(1, Math.round(renderVp.height));
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: renderVp }).promise;
        }
        const jpgDataUrl = canvas.toDataURL("image/jpeg", 0.92);
        canvas.width = 0;
        canvas.height = 0;
        if (typeof page.cleanup === "function") page.cleanup();

        const b64 = jpgDataUrl.split(",")[1] || "";
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        const embedded = await outPdf.embedJpg(bytes);
        const pdfPage = outPdf.addPage([origVp.width, origVp.height]);
        pdfPage.drawImage(embedded, {
          x: 0,
          y: 0,
          width: origVp.width,
          height: origVp.height,
        });
      }
    } finally {
      if (typeof pdfJsDoc.destroy === "function") pdfJsDoc.destroy();
    }

    const saved = await outPdf.save({ useObjectStreams: false });
    return saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength);
  };

  const handleLockPdf = async () => {
    if (!file || !pdfBuffer) return;
    if (!userPassword) {
      showToast("Please enter a password required to open the PDF.", "error");
      return;
    }
    if (userPassword !== confirmPassword) {
      showToast("Passwords do not match. Please re-enter the same password.", "error");
      return;
    }

    setIsProcessing(true);
    setProgressMsg("ADDING_OPEN_PASSWORD_TO_PDF...");

    try {
      await yieldFrame();
      let targetBuffer = pdfBuffer;
      if (sourceOpenPassword) {
        targetBuffer = await buildCleanPdfBufferViaPdfJs(pdfBuffer, sourceOpenPassword);
      }

      let encryptedBytes: Uint8Array;
      try {
        encryptedBytes = await encryptPdfBuffer(targetBuffer, {
          userPassword,
        });
      } catch {
        // Fallback: normalize via PDF.js and encrypt
        const cleanBuf = await buildCleanPdfBufferViaPdfJs(pdfBuffer, sourceOpenPassword);
        encryptedBytes = await encryptPdfBuffer(cleanBuf, {
          userPassword,
        });
      }

      const pdfBlob = new Blob([encryptedBytes], { type: "application/pdf" });
      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));

      await saveFile("lock_pdf", {
        blob: pdfBlob,
        filename: `${cleanName}_monotranscoder`,
        size: pdfBlob.size,
        format: "application/pdf",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast("Password added to PDF! Opening this PDF now requires your password.", "success");
      onSuccess();
    } catch (err: any) {
      logger.error("Lock PDF error:", err);
      showToast(`Failed to lock PDF: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="lock-pdf-view"
      aria-labelledby="lock-pdf-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="lock-pdf-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            Lock PDF (Basic Password Protection)
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Applies standard PDF RC4-128 (V2/R3) basic password protection locally in your browser to prevent casual opening. For high-security archival encryption, use dedicated AES-256 desktop tools (e.g., Acrobat or qpdf).
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="lock-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF file to password protect"
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
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="lock_pdf" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PDF TO LOCK (.PDF)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Adds a password required to open the PDF. Processed 100% locally in your browser.
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
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Document Preview & Lock Status */}
          <div className="lg:col-span-6 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono font-bold text-xs uppercase text-zinc-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400" /> PDF_LOCK_PREVIEW
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold tabular-nums">
                {pageCount} PAGE(S) READY
              </span>
            </div>

            <div className="bg-black border border-zinc-800 rounded-lg p-4 sm:p-6 flex flex-col items-center justify-center min-h-[220px] sm:min-h-[340px] space-y-4">
              {coverThumbUrl && (
                <div className="relative border-2 border-zinc-700 rounded overflow-hidden shadow-xl">
                  <img
                    src={coverThumbUrl}
                    alt="Document cover preview"
                    referrerPolicy="no-referrer"
                    className="max-h-60 object-contain block"
                  />
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 p-3">
                    <div className="w-12 h-12 rounded-full bg-black/90 border-2 border-amber-400 flex items-center justify-center text-amber-400 shadow-lg">
                      <Lock className="w-6 h-6" />
                    </div>
                    <span className="px-2.5 py-1 rounded bg-black/90 border border-zinc-700 text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                      PASSWORD REQUIRED TO OPEN
                    </span>
                  </div>
                </div>
              )}
              <div className="text-center font-mono">
                <p className="text-xs font-bold text-white truncate max-w-xs">{file.name}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {formatBytes(file.size)} · {pageCount} Page(s) · 128-Bit Open Password Lock
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono tabular-nums">
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">PROTECTION</span>
                <strong className="text-amber-400">OPEN_PASSWORD</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">PAGES_LOCKED</span>
                <strong className="text-emerald-400">ALL ({pageCount})</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">STATUS</span>
                <strong className={passwordsMatch ? "text-emerald-400" : "text-zinc-400"}>
                  {passwordsMatch ? "READY_TO_LOCK" : "SET_PASSWORD"}
                </strong>
              </div>
            </div>
          </div>

          {/* Right: Set Password to Open PDF */}
          <div className="lg:col-span-6 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4 text-amber-400" /> SET_OPEN_PASSWORD.CFG
                </h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                >
                  [CHANGE_FILE]
                </button>
              </div>

              <div className="bg-black border border-zinc-800 p-3.5 rounded-lg text-xs font-mono text-zinc-300 leading-relaxed">
                Enter the password below. Once locked, any PDF viewer (Chrome, Adobe Acrobat, Preview, Edge, mobile) will ask for this password before opening the file.
              </div>

              {/* Password to Open PDF */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="pdf-open-password"
                    className="text-xs font-mono font-bold uppercase text-white flex items-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" /> PASSWORD TO OPEN PDF:
                  </label>
                  <span className={`text-[10px] font-mono font-bold ${passwordStrength.color}`}>
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="relative">
                  <input
                    id="pdf-open-password"
                    type={showPassword ? "text" : "password"}
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="Enter password to open PDF..."
                    autoComplete="new-password"
                    className="w-full p-3 pr-10 bg-black border-2 border-zinc-700 text-white rounded-lg text-xs font-mono focus:border-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Strength Bar */}
                <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${passwordStrength.pct}%` }}
                  />
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="pdf-confirm-password"
                    className="block text-xs font-mono font-bold uppercase text-white"
                  >
                    CONFIRM PASSWORD:
                  </label>
                  {confirmPassword.length > 0 && (
                    <span
                      className={`text-[10px] font-mono font-bold flex items-center gap-1 ${
                        passwordsMatch ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {passwordsMatch ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> MATCHED
                        </>
                      ) : (
                        "DOES NOT MATCH"
                      )}
                    </span>
                  )}
                </div>
                <input
                  id="pdf-confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && passwordsMatch) {
                      handleLockPdf();
                    }
                  }}
                  placeholder="Re-enter password to confirm..."
                  autoComplete="new-password"
                  className="w-full p-3 bg-black border-2 border-zinc-700 text-white rounded-lg text-xs font-mono focus:border-white focus:outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleLockPdf}
              disabled={isProcessing || !userPassword || userPassword !== confirmPassword}
              aria-label="Add Password and Lock PDF Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>ADD PASSWORD &amp; LOCK PDF NOW</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
