/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Unlock,
  FolderOpen,
  Zap,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { loadPdfJsLibrary } from "../utils/pdfProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";

interface UnlockPdfViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

type RenderDpiPreset = "150_DPI" | "220_DPI" | "300_DPI";

const DPI_SCALE_MAP: Record<RenderDpiPreset, { scale: number; label: string }> = {
  "150_DPI": { scale: 1.5, label: "150 DPI (FAST)" },
  "220_DPI": { scale: 2.1, label: "220 DPI (HD)" },
  "300_DPI": { scale: 2.8, label: "300 DPI (PRINT)" },
};

export default function UnlockPdfView({
  onSuccess,
  askPassword,
  initialFile,
}: UnlockPdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [verifiedPassword, setVerifiedPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [wasPasswordEncrypted, setWasPasswordEncrypted] = useState<boolean>(false);
  const [pageCount, setPageCount] = useState<number>(0);
  const [coverThumbUrl, setCoverThumbUrl] = useState<string>("");
  const [renderDpi, setRenderDpi] = useState<RenderDpiPreset>("220_DPI");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

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
      setProgressMsg("DETECTING_PDF_ENCRYPTION_DICTIONARY...");

      let pdfDoc: any = null;
      try {
        await yieldFrame();
        const arrayBuffer = await selected.arrayBuffer();
        const pdfjsLib = await loadPdfJsLibrary();

        let usedPassword = "";
        let neededPassword = false;

        const openWithPwd = async (pwd?: string): Promise<any> => {
          const params: any = { data: new Uint8Array(arrayBuffer.slice(0)) };
          if (pwd) params.password = pwd;
          try {
            const doc = await pdfjsLib.getDocument(params).promise;
            if (pwd) usedPassword = pwd;
            return doc;
          } catch (err: any) {
            const isPwd =
              err?.name === "PasswordException" ||
              err?.name === "IncorrectPasswordException" ||
              String(err?.message || "").toLowerCase().includes("password");
            if (isPwd) {
              neededPassword = true;
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

        // Also check if pdf-lib considers it encrypted (e.g. Owner password restrictions without open password)
        if (!neededPassword) {
          try {
            const checkDoc = await PDFDocument.load(arrayBuffer, { updateMetadata: false });
            if (checkDoc.isEncrypted) neededPassword = true;
          } catch {
            neededPassword = true;
          }
        }

        const page = await pdfDoc.getPage(1);
        const vp = page.getViewport({ scale: 0.7 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(vp.width));
        canvas.height = Math.max(1, Math.round(vp.height));
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
        }
        setCoverThumbUrl(canvas.toDataURL("image/jpeg", 0.84));
        canvas.width = 0;
        canvas.height = 0;
        if (typeof page.cleanup === "function") page.cleanup();

        setPdfBuffer(arrayBuffer);
        setVerifiedPassword(usedPassword);
        setWasPasswordEncrypted(neededPassword);
        setPageCount(total);
      } catch (err: any) {
        logger.error("Unlock PDF load error:", err);
        showToast(`Failed to unlock PDF: ${err?.message || err}`, "error");
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

  const handleReset = () => {
    setFile(null);
    setPdfBuffer(null);
    setVerifiedPassword("");
    setWasPasswordEncrypted(false);
    setPageCount(0);
    setCoverThumbUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUnlockAndSave = async () => {
    if (!file || !pdfBuffer) return;

    setIsProcessing(true);
    setProgressMsg("STRIPPING_ENCRYPTION_AND_REBUILDING_PDF...");

    let pdfDocJs: any = null;
    try {
      await yieldFrame();

      // If the PDF was NOT encrypted with a user open password and pdf-lib can load it cleanly, do a lossless clone
      let unlockedBytes: Uint8Array | null = null;
      if (!wasPasswordEncrypted) {
        try {
          const srcDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });
          const cleanDoc = await PDFDocument.create();
          const copiedPages = await cleanDoc.copyPages(srcDoc, srcDoc.getPageIndices());
          for (const p of copiedPages) cleanDoc.addPage(p);
          unlockedBytes = await cleanDoc.save({
            useObjectStreams: true,
            objectsPerTick: Infinity,
          });
        } catch {
          unlockedBytes = null;
        }
      }

      // If encrypted with user/owner cipher, reconstruct clean unencrypted PDF via authenticated PDF.js session
      if (!unlockedBytes) {
        const pdfjsLib = await loadPdfJsLibrary();
        const params: any = { data: new Uint8Array(pdfBuffer.slice(0)) };
        if (verifiedPassword) params.password = verifiedPassword;
        pdfDocJs = await pdfjsLib.getDocument(params).promise;

        const outPdf = await PDFDocument.create();
        const scale = DPI_SCALE_MAP[renderDpi].scale;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        for (let i = 1; i <= pdfDocJs.numPages; i++) {
          setProgressMsg(`DECRYPTING_PAGE_${i}_OF_${pdfDocJs.numPages}...`);
          await yieldFrame();

          const page = await pdfDocJs.getPage(i);
          const origVp = page.getViewport({ scale: 1.0 });
          const renderVp = page.getViewport({ scale });

          canvas.width = Math.max(1, Math.round(renderVp.width));
          canvas.height = Math.max(1, Math.round(renderVp.height));
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: renderVp }).promise;
          }

          const jpgBlob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob(
              (b) => (b ? res(b) : rej(new Error("Canvas export failed"))),
              "image/jpeg",
              0.9
            )
          );
          const jpgBytes = await jpgBlob.arrayBuffer();
          const embeddedJpg = await outPdf.embedJpg(jpgBytes);
          const newPage = outPdf.addPage([origVp.width, origVp.height]);
          newPage.drawImage(embeddedJpg, {
            x: 0,
            y: 0,
            width: origVp.width,
            height: origVp.height,
          });

          if (typeof page.cleanup === "function") page.cleanup();
        }

        canvas.width = 0;
        canvas.height = 0;

        setProgressMsg("SAVING_UNLOCKED_PDF...");
        unlockedBytes = await outPdf.save({
          useObjectStreams: true,
          objectsPerTick: Infinity,
        });
      }

      const pdfBlob = new Blob([unlockedBytes], { type: "application/pdf" });
      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));

      await saveFile("unlock_pdf", {
        blob: pdfBlob,
        filename: `${cleanName}_unlocked`,
        size: pdfBlob.size,
        format: "application/pdf",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast("PDF unlocked and restrictions removed successfully.", "success");
      onSuccess();
    } catch (err: any) {
      logger.error("Unlock PDF error:", err);
      showToast(`Failed to unlock PDF: ${err?.message || err}`, "error");
    } finally {
      if (pdfDocJs && typeof pdfDocJs.destroy === "function") {
        pdfDocJs.destroy();
      }
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="unlock-pdf-view"
      aria-labelledby="unlock-pdf-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="unlock-pdf-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            UNLOCK PDF // UNLOCK_PDF.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Remove password prompts and printing/copying restrictions from encrypted PDF files in local browser memory.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="unlock-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload encrypted PDF file to unlock"
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
            <Unlock className="w-6 h-6" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PROTECTED PDF (.PDF)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Decrypts password-protected PDFs and strips Owner permissions 100% locally in your browser.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
          >
            SELECT_PROTECTED_PDF
          </button>
        </div>
      ) : isParsing || isProcessing ? (
        <ToolSkeletonLoader
          variant="unlock_pdf"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo="UNENCRYPTED PDF"
          statusMessage={
            progressMsg ||
            (isParsing ? "AUTHENTICATING_PDF_KEY..." : "RECONSTRUCTING_UNLOCKED_PDF...")
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Unlocked Document Preview */}
          <div className="lg:col-span-6 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono font-bold text-xs uppercase text-zinc-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> DECRYPTED_PREVIEW_STATE
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ACCESS VERIFIED
              </span>
            </div>

            <div className="bg-black border border-zinc-800 rounded-lg p-4 sm:p-6 flex flex-col items-center justify-center min-h-[220px] sm:min-h-[320px] space-y-4">
              {coverThumbUrl && (
                <div className="relative border-2 border-zinc-700 rounded overflow-hidden shadow-xl">
                  <img
                    src={coverThumbUrl}
                    alt="Unlocked PDF cover preview"
                    referrerPolicy="no-referrer"
                    className="max-h-60 object-contain block"
                  />
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-emerald-500 text-black font-mono font-bold text-[10px] uppercase flex items-center gap-1 shadow">
                    <Unlock className="w-3 h-3" /> UNLOCKED
                  </div>
                </div>
              )}
              <div className="text-center font-mono">
                <p className="text-xs font-bold text-white truncate max-w-xs">{file.name}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {formatBytes(file.size)} · {pageCount} Page(s) · Ready for Permanent Decryption
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono tabular-nums">
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">SOURCE_STATE</span>
                <strong className="text-amber-400">
                  {wasPasswordEncrypted ? "ENCRYPTED" : "RESTRICTED"}
                </strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">OUTPUT_STATE</span>
                <strong className="text-emerald-400">100% OPEN</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">PAGES</span>
                <strong className="text-sky-400">{pageCount}</strong>
              </div>
            </div>
          </div>

          {/* Right: Decryption Settings */}
          <div className="lg:col-span-6 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4 text-emerald-400" /> DECRYPT_CONFIG.CFG
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
                  <span className="text-zinc-400">SOURCE_FILE:</span>
                  <strong className="text-emerald-400 truncate max-w-[180px]" title={file.name}>
                    {file.name}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">SECURITY_STATUS:</span>
                  <strong className="text-emerald-400">
                    {verifiedPassword
                      ? "OPEN PASSWORD AUTHENTICATED"
                      : "READY TO STRIP RESTRICTIONS"}
                  </strong>
                </div>
              </div>

              {verifiedPassword && (
                <div className="space-y-1.5">
                  <label className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-emerald-400" /> VERIFIED DOCUMENT PASSWORD:
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={verifiedPassword}
                      onChange={(e) => setVerifiedPassword(e.target.value)}
                      className="w-full p-2.5 pr-10 bg-black border-2 border-zinc-700 text-white rounded-lg text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {wasPasswordEncrypted && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                    RECONSTRUCTION QUALITY:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["150_DPI", "220_DPI", "300_DPI"] as RenderDpiPreset[]).map((dpi) => (
                      <button
                        key={dpi}
                        type="button"
                        onClick={() => setRenderDpi(dpi)}
                        className={`py-2 px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                          renderDpi === dpi
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {DPI_SCALE_MAP[dpi].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-black border border-zinc-800 rounded-lg p-3.5 text-xs font-mono text-zinc-400 space-y-1.5">
                <p className="text-white font-bold uppercase">WHAT WILL BE REMOVED:</p>
                <p>• User Open Password prompt on launch</p>
                <p>• Owner Permission locks (Printing, Copying, Annotating)</p>
                <p>• Standard Security Handler (/Encrypt dictionary)</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleUnlockAndSave}
              disabled={isProcessing}
              aria-label="Unlock PDF Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>UNLOCK &amp; SAVE PDF NOW</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
