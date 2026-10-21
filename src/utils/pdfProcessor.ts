/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFRawStream,
  PDFNumber,
} from "pdf-lib";
import { deflate, inflate } from "pako";
import { logger } from "./logger";

export interface PdfCompressOptions {
  level?: "lossless" | "light" | "balanced" | "maximum";
  targetKB?: number;
  allowDownsample?: boolean;
  stripJavaScript?: boolean;
  stripAnnotations?: boolean;
  stripThumbnails?: boolean;
  stripEmbeddedFiles?: boolean;
  stripMetadata?: boolean;
  stripStructuralTags?: boolean;
  onProgress?: (progress: number, message: string) => void;
  askPassword?: (reason?: "wrong" | "required") => Promise<string | null>;
}

/**
 * Loads PDF.js from local bundled asset strictly without external CDN connections.
 */
export async function loadPdfJsLibrary(): Promise<any> {
  let globalPdfjs = (window as any).pdfjsLib;
  if (globalPdfjs) {
    return globalPdfjs;
  }

  const loadScript = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load local PDF script: ${url}`));
      document.head.appendChild(script);
    });
  };

  try {
    await loadScript("/pdf.min.js");
    globalPdfjs = (window as any).pdfjsLib;
  } catch (err) {
    logger.error("Local pdf.min.js failed to load:", err);
    throw new Error("Local PDF processing engine failed to load. Please verify /pdf.min.js is present.");
  }

  if (!globalPdfjs) {
    throw new Error("Local PDF viewer engine failed to initialize.");
  }

  try {
    globalPdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
  } catch (workerErr) {
    logger.warn("Worker registration error:", workerErr);
  }

  return globalPdfjs;
}

/**
 * Safely strips selected PDF objects based on explicit user toggles.
 * Safe defaults:
 * - Preserves internal named destinations (/Names is never deleted wholesale).
 * - Preserves page numbering (/PageLabels is never deleted).
 * - Preserves optional content layer visibility (/OCProperties is never deleted).
 * - Destructive options (annotations/links, JS, attachments, structure tags) default to false.
 */
export function stripUnusedPdfObjects(
  pdfDoc: PDFDocument,
  options: {
    stripJavaScript?: boolean;
    stripAnnotations?: boolean;
    stripThumbnails?: boolean;
    stripEmbeddedFiles?: boolean;
    stripMetadata?: boolean;
    stripStructuralTags?: boolean;
  } = {}
): void {
  const {
    stripJavaScript = false,
    stripAnnotations = false,
    stripThumbnails = true,
    stripEmbeddedFiles = false,
    stripMetadata = true,
    stripStructuralTags = false,
  } = options;

  const catalog = pdfDoc.catalog;
  const pages = pdfDoc.getPages();

  // 1. Strip JavaScript Actions (only if explicitly requested)
  if (stripJavaScript) {
    catalog.delete(PDFName.of("OpenAction"));
    catalog.delete(PDFName.of("AA"));
    catalog.delete(PDFName.of("JavaScript"));

    if (catalog.has(PDFName.of("Names"))) {
      const names = catalog.lookup(PDFName.of("Names"));
      if (names instanceof PDFDict) {
        names.delete(PDFName.of("JavaScript"));
      }
    }

    if (catalog.has(PDFName.of("AcroForm"))) {
      const acroForm = catalog.lookup(PDFName.of("AcroForm"));
      if (acroForm instanceof PDFDict) {
        acroForm.delete(PDFName.of("AA"));
        acroForm.delete(PDFName.of("A"));
      }
    }
  }

  // 2. Strip Thumbnails (only deletes /Thumb; preserves /PageLabels so page numbering is never broken)
  if (stripThumbnails) {
    catalog.delete(PDFName.of("Thumb"));
  }

  // 3. Strip Embedded Files & Attachments (preserves /Names dictionary so named destinations still work)
  if (stripEmbeddedFiles) {
    catalog.delete(PDFName.of("EmbeddedFiles"));
    catalog.delete(PDFName.of("AF"));

    if (catalog.has(PDFName.of("Names"))) {
      const names = catalog.lookup(PDFName.of("Names"));
      if (names instanceof PDFDict) {
        names.delete(PDFName.of("EmbeddedFiles"));
        names.delete(PDFName.of("EF"));
        names.delete(PDFName.of("AF"));
      }
    }
  }

  // 4. Strip XMP & Info Metadata (preserves /OCProperties and /OutputIntents, avoids 1970 epoch dates)
  if (stripMetadata) {
    catalog.delete(PDFName.of("Metadata"));
    catalog.delete(PDFName.of("PieceInfo"));
    catalog.delete(PDFName.of("SpiderInfo"));

    pdfDoc.setTitle("");
    pdfDoc.setAuthor("");
    pdfDoc.setSubject("");
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer("");
    pdfDoc.setCreator("");
  }

  // 5. Strip Accessibility Structure Tree (only if explicitly requested)
  if (stripStructuralTags) {
    catalog.delete(PDFName.of("StructTreeRoot"));
    catalog.delete(PDFName.of("MarkInfo"));
  }

  // Page-level cleaning
  for (const page of pages) {
    if (stripAnnotations) {
      page.node.delete(PDFName.of("Annots"));
    }
    if (stripThumbnails) {
      page.node.delete(PDFName.of("Thumb"));
    }
    if (stripMetadata) {
      page.node.delete(PDFName.of("Metadata"));
      page.node.delete(PDFName.of("PieceInfo"));
    }
    if (stripStructuralTags) {
      page.node.delete(PDFName.of("StructParents"));
    }
    if (stripJavaScript) {
      page.node.delete(PDFName.of("AA"));
      page.node.delete(PDFName.of("A"));
    }
  }

  // Indirect objects traversal
  const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
  for (const [, obj] of indirectObjects) {
    if (obj instanceof PDFDict) {
      if (stripJavaScript) {
        const sType = obj.get(PDFName.of("S"))?.toString();
        if (sType === "/JavaScript") {
          obj.delete(PDFName.of("JS"));
          obj.delete(PDFName.of("S"));
        }
        obj.delete(PDFName.of("AA"));
      }
      if (stripMetadata) {
        const objType = obj.get(PDFName.of("Type"))?.toString();
        if (objType === "/Metadata") {
          obj.delete(PDFName.of("Metadata"));
        }
        obj.delete(PDFName.of("PieceInfo"));
      }
      if (stripThumbnails) {
        obj.delete(PDFName.of("Thumb"));
      }
    }
  }
}

/**
 * Optimizes PDF stream contents using true Maximum Deflate Compression (Level 9).
 * Recompresses uncompressed streams and, when recompressFlate is true, re-optimizes existing FlateDecode streams.
 */
export function optimizePdfStreamsWithMaxDeflate(
  pdfDoc: PDFDocument,
  recompressFlate = true
): void {
  const indirectObjects = pdfDoc.context.enumerateIndirectObjects();

  for (const [ref, obj] of indirectObjects) {
    if (obj instanceof PDFRawStream) {
      const dict = obj.dict;
      const filter = dict.get(PDFName.of("Filter"));
      const filterName = filter?.toString();
      const hasDecodeParms = dict.has(PDFName.of("DecodeParms")) || dict.has(PDFName.of("DP"));

      if (!filter) {
        try {
          const contents = obj.getContents();
          if (contents.length < 64) continue;

          const deflated = deflate(contents, { level: 9 });
          if (deflated.length < contents.length) {
            const newStream = PDFRawStream.of(dict, deflated);
            dict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
            dict.set(PDFName.of("Length"), PDFNumber.of(deflated.length));
            pdfDoc.context.assign(ref, newStream);
          }
        } catch (streamErr) {
          logger.warn("Stream optimization skipped for uncompressed ref:", streamErr);
        }
      } else if (recompressFlate && filterName === "/FlateDecode" && !hasDecodeParms) {
        try {
          const contents = obj.getContents();
          if (contents.length < 256) continue;

          const inflated = inflate(contents);
          const reDeflated = deflate(inflated, { level: 9 });
          if (reDeflated.length < contents.length) {
            const newStream = PDFRawStream.of(dict, reDeflated);
            dict.set(PDFName.of("Length"), PDFNumber.of(reDeflated.length));
            pdfDoc.context.assign(ref, newStream);
          }
        } catch {
          // Keep original stream if inflate/re-deflate is unsupported for this stream
        }
      }
    }
  }
}

/**
 * Downsamples PDF pages via local PDF.js rendering to achieve real size reductions on
 * scanned documents, image-heavy PDFs, or strict targetKB budgets.
 */
async function downsamplePdfViaPdfJs(
  arrayBuffer: ArrayBuffer,
  options: {
    level: "light" | "balanced" | "maximum";
    targetKB?: number;
    askPassword?: (reason?: "wrong" | "required") => Promise<string | null>;
    onProgress?: (progress: number, message: string) => void;
  }
): Promise<Uint8Array> {
  const { level, targetKB, askPassword, onProgress } = options;
  onProgress?.(40, "INITIALIZING_PDFJS_RASTER_OPTIMIZER...");

  const pdfjsLib = await loadPdfJsLibrary();

  const loadWithPassword = async (pwd?: string): Promise<any> => {
    const docParams: any = { data: new Uint8Array(arrayBuffer.slice(0)) };
    if (pwd) docParams.password = pwd;
    const loadingTask = pdfjsLib.getDocument(docParams);
    try {
      return await loadingTask.promise;
    } catch (err: any) {
      const isPasswordRequired =
        err?.name === "PasswordException" ||
        err?.name === "IncorrectPasswordException" ||
        err?.message?.toLowerCase().includes("password");
      if (isPasswordRequired && askPassword) {
        const entered = await askPassword(pwd ? "wrong" : "required");
        if (entered === null) {
          throw new Error("Password decryption cancelled by user.");
        }
        return await loadWithPassword(entered);
      }
      throw err;
    }
  };

  const pdfDocument = await loadWithPassword();

  try {
    const numPages = pdfDocument.numPages;
    if (numPages > 5000) {
      throw new Error("PDF exceeds 5,000 page limit.");
    }

    // Determine scale and JPEG quality from level or targetKB
    const levelPresets = {
      light: { scale: 1.5, quality: 0.82 },
      balanced: { scale: 1.15, quality: 0.65 },
      maximum: { scale: 0.85, quality: 0.45 },
    };

    let baseScale = levelPresets[level].scale;
    let baseQuality = levelPresets[level].quality;

    const targetBytes = targetKB ? targetKB * 1024 : undefined;
    // Reserve ~8% overhead for PDF container structure and xref tables
    const perPageByteBudget = targetBytes ? Math.max(4096, (targetBytes * 0.92) / numPages) : undefined;

    if (perPageByteBudget) {
      // Estimate initial scale & quality from per-page byte budget
      if (perPageByteBudget < 25 * 1024) {
        baseScale = 0.7;
        baseQuality = 0.4;
      } else if (perPageByteBudget < 60 * 1024) {
        baseScale = 0.95;
        baseQuality = 0.58;
      } else if (perPageByteBudget < 120 * 1024) {
        baseScale = 1.2;
        baseQuality = 0.72;
      } else {
        baseScale = 1.45;
        baseQuality = 0.82;
      }
    }

    const outPdf = await PDFDocument.create();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const encodeCanvasJpeg = (c: HTMLCanvasElement, q: number): Promise<Blob> =>
      new Promise((res, rej) =>
        c.toBlob((b) => (b ? res(b) : rej(new Error("Canvas export failed"))), "image/jpeg", q)
      );

    try {
      for (let i = 1; i <= numPages; i++) {
        const pct = Math.round(45 + (i / numPages) * 45);
        onProgress?.(pct, `OPTIMIZING_PAGE_${i}_OF_${numPages}...`);

        const page = await pdfDocument.getPage(i);
        const origViewport = page.getViewport({ scale: 1.0 });
        const renderViewport = page.getViewport({ scale: baseScale });

        const targetW = Math.max(1, Math.round(renderViewport.width));
        const targetH = Math.max(1, Math.round(renderViewport.height));

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        if (ctx) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, targetW, targetH);
          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
        }

        let jpgBlob = await encodeCanvasJpeg(canvas, baseQuality);

        // If targetKB is active and this page exceeded its byte budget, adaptively step down quality/scale
        if (perPageByteBudget && jpgBlob.size > perPageByteBudget) {
          const reducedQuality = Math.max(0.22, baseQuality * (perPageByteBudget / jpgBlob.size) * 0.85);
          jpgBlob = await encodeCanvasJpeg(canvas, reducedQuality);

          if (jpgBlob.size > perPageByteBudget) {
            const downscaleRatio = Math.max(0.4, Math.sqrt(perPageByteBudget / jpgBlob.size) * 0.9);
            const smallVp = page.getViewport({ scale: baseScale * downscaleRatio });
            const sw = Math.max(1, Math.round(smallVp.width));
            const sh = Math.max(1, Math.round(smallVp.height));
            canvas.width = sw;
            canvas.height = sh;
            if (ctx) {
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, sw, sh);
              await page.render({ canvasContext: ctx, viewport: smallVp }).promise;
            }
            jpgBlob = await encodeCanvasJpeg(canvas, Math.max(0.3, reducedQuality));
          }
        }

        const jpgBytes = await jpgBlob.arrayBuffer();
        const embeddedJpg = await outPdf.embedJpg(jpgBytes);
        const pdfPage = outPdf.addPage([origViewport.width, origViewport.height]);
        pdfPage.drawImage(embeddedJpg, {
          x: 0,
          y: 0,
          width: origViewport.width,
          height: origViewport.height,
        });

        if (typeof page.cleanup === "function") {
          page.cleanup();
        }
      }
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }

    onProgress?.(92, "PACKING_OPTIMIZED_PDF_STREAMS...");
    return await outPdf.save({
      useObjectStreams: true,
      objectsPerTick: Infinity,
      updateFieldAppearances: false,
    });
  } finally {
    if (pdfDocument && typeof pdfDocument.destroy === "function") {
      pdfDocument.destroy();
    }
  }
}

/**
 * Full PDF Optimization Engine:
 * - Detects encrypted PDFs instead of corrupting them with ignoreEncryption: true.
 * - Executes safe structural object pruning and Deflate Level 9 stream recompression.
 * - Executes PDF.js page/image downsampling when targetKB or balanced/maximum downsampling is requested.
 */
export async function compressPdfDocument(
  file: File,
  options: PdfCompressOptions = {}
): Promise<{ blob: Blob; size: number }> {
  const {
    level = "balanced",
    targetKB,
    allowDownsample = true,
    stripJavaScript = true,
    stripAnnotations = false,
    stripThumbnails = true,
    stripEmbeddedFiles = true,
    stripMetadata = true,
    stripStructuralTags = level === "maximum",
    onProgress,
    askPassword,
  } = options;

  // Guard against massive file uploads exceeding browser RAM (500 MB ceiling)
  if (file.size > 500 * 1024 * 1024) {
    throw new Error("PDF file size exceeds 500MB safe in-browser processing limit.");
  }

  onProgress?.(10, "LOADING_PDF_BUFFER...");
  const arrayBuffer = await file.arrayBuffer();

  onProgress?.(25, "PARSING_PDF_STRUCTURE...");
  let pdfDoc: PDFDocument | null = null;
  let isEncrypted = false;

  try {
    pdfDoc = await PDFDocument.load(arrayBuffer, {
      updateMetadata: false,
    });
    if (pdfDoc.isEncrypted) {
      isEncrypted = true;
    }
  } catch (loadErr: any) {
    const msg = String(loadErr?.message || loadErr);
    if (
      loadErr?.name === "EncryptedPDFError" ||
      msg.toLowerCase().includes("encrypted") ||
      msg.toLowerCase().includes("password")
    ) {
      isEncrypted = true;
    } else {
      logger.error("PDFDocument.load error:", loadErr);
      throw new Error(`Invalid or corrupt PDF document: ${msg}`);
    }
  }

  // Handle encrypted PDFs safely
  if (isEncrypted) {
    if (allowDownsample && askPassword) {
      const effectiveLevel = level === "lossless" ? "balanced" : level;
      const downsampledBytes = await downsamplePdfViaPdfJs(arrayBuffer, {
        level: effectiveLevel,
        targetKB,
        askPassword,
        onProgress,
      });
      onProgress?.(100, "OPTIMIZATION_COMPLETE");
      const pdfBlob = new Blob([downsampledBytes], { type: "application/pdf" });
      return { blob: pdfBlob, size: pdfBlob.size };
    }
    throw new Error(
      "This PDF document is password-protected or encrypted. Enable 'Downsample Images & Scans' to unlock it with a password, or unlock the PDF before lossless stream compression."
    );
  }

  if (!pdfDoc) {
    throw new Error("Could not parse PDF structure.");
  }

  // Guard against PDF zip bombs (> 5,000 pages)
  if (pdfDoc.getPageCount() > 5000) {
    throw new Error("PDF exceeds 5,000 page limit. Please process a smaller document to prevent memory exhaustion.");
  }

  // 1. Strip selected objects
  onProgress?.(45, "PRUNING_SELECTED_PDF_OBJECTS...");
  stripUnusedPdfObjects(pdfDoc, {
    stripJavaScript,
    stripAnnotations,
    stripThumbnails,
    stripEmbeddedFiles,
    stripMetadata,
    stripStructuralTags,
  });

  // 2. Max Deflate Level 9 Stream Optimization
  onProgress?.(65, "APPLYING_MAX_DEFLATE_LEVEL_9...");
  optimizePdfStreamsWithMaxDeflate(pdfDoc, level !== "light");

  // 3. Compact with Object Streams
  onProgress?.(80, "BUILDING_COMPACT_OBJECT_STREAMS...");
  const losslessBytes = await pdfDoc.save({
    useObjectStreams: true,
    objectsPerTick: Infinity,
    updateFieldAppearances: false,
  });

  const targetBytes = targetKB ? targetKB * 1024 : undefined;
  const needsDownsampleForTarget = targetBytes !== undefined && losslessBytes.byteLength > targetBytes;
  const needsDownsampleForLevel = level === "balanced" || level === "maximum";

  // 4. If allowDownsample is enabled and lossless pass didn't reach targetKB (or level is balanced/maximum), run PDF.js downsampler
  if (allowDownsample && level !== "lossless" && (needsDownsampleForTarget || needsDownsampleForLevel)) {
    const downsampledBytes = await downsamplePdfViaPdfJs(arrayBuffer, {
      level,
      targetKB,
      askPassword,
      onProgress,
    });

    // Pick whichever output is smaller
    const bestBytes =
      downsampledBytes.byteLength < losslessBytes.byteLength ? downsampledBytes : losslessBytes;
    onProgress?.(100, "OPTIMIZATION_COMPLETE");
    const pdfBlob = new Blob([bestBytes], { type: "application/pdf" });
    return { blob: pdfBlob, size: pdfBlob.size };
  }

  onProgress?.(100, "OPTIMIZATION_COMPLETE");
  const pdfBlob = new Blob([losslessBytes], { type: "application/pdf" });
  return {
    blob: pdfBlob,
    size: pdfBlob.size,
  };
}
