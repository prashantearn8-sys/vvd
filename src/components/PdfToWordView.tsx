/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  FileText,
  FolderOpen,
  Zap,
  AlignLeft,
  Image as ImageIcon,
} from "lucide-react";
import JSZip from "jszip";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { loadPdfJsLibrary } from "../utils/pdfProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";
import ModuleIconBadge from "./ModuleIconBadge";

interface PdfToWordViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

interface ExtractedLine {
  type: "text";
  y: number;
  text: string;
  isHeading: boolean;
}

interface ExtractedPdfImage {
  type: "image";
  id: string;
  y: number;
  bytes: Uint8Array;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
}

type PageBlock = ExtractedLine | ExtractedPdfImage;

interface ExtractedPdfPage {
  pageNumber: number;
  blocks: PageBlock[];
  widthPt: number;
  heightPt: number;
}

function escapeXmlText(unsafe: string): string {
  return unsafe
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function multiplyTransform(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Extracts a raw PDF image object (ImageBitmap, HTMLImageElement, or raw pixel buffer)
 * into a JPEG byte array + preview dataUrl using an offscreen canvas.
 */
async function encodePdfImageObjectToJpeg(
  imgObj: any
): Promise<{ bytes: Uint8Array; dataUrl: string; widthPx: number; heightPx: number } | null> {
  if (!imgObj) return null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  try {
    const drawable =
      imgObj.bitmap ||
      (typeof ImageBitmap !== "undefined" && imgObj instanceof ImageBitmap ? imgObj : null) ||
      (typeof HTMLImageElement !== "undefined" && imgObj instanceof HTMLImageElement
        ? imgObj
        : null) ||
      (typeof HTMLCanvasElement !== "undefined" && imgObj instanceof HTMLCanvasElement
        ? imgObj
        : null);

    if (drawable) {
      const w = Math.max(1, Number(imgObj.width || drawable.width || 1));
      const h = Math.max(1, Number(imgObj.height || drawable.height || 1));
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(drawable, 0, 0, w, h);
    } else if (imgObj.data && imgObj.width && imgObj.height) {
      const w = Math.max(1, Number(imgObj.width));
      const h = Math.max(1, Number(imgObj.height));
      canvas.width = w;
      canvas.height = h;

      const src = imgObj.data as Uint8Array | Uint8ClampedArray;
      const rgba = new Uint8ClampedArray(w * h * 4);
      const kind = Number(imgObj.kind || 0);

      if (kind === 3 || src.length === w * h * 4) {
        // RGBA_32BPP — composite over white for clean JPEG export
        for (let i = 0; i < w * h; i++) {
          const idx = i * 4;
          const a = src[idx + 3] / 255;
          rgba[idx] = Math.round(src[idx] * a + 255 * (1 - a));
          rgba[idx + 1] = Math.round(src[idx + 1] * a + 255 * (1 - a));
          rgba[idx + 2] = Math.round(src[idx + 2] * a + 255 * (1 - a));
          rgba[idx + 3] = 255;
        }
      } else if (kind === 2 || src.length === w * h * 3) {
        // RGB_24BPP
        for (let i = 0, j = 0; i < w * h * 4; i += 4, j += 3) {
          rgba[i] = src[j];
          rgba[i + 1] = src[j + 1];
          rgba[i + 2] = src[j + 2];
          rgba[i + 3] = 255;
        }
      } else if (kind === 1) {
        // GRAYSCALE_1BPP
        const rowBytes = (w + 7) >> 3;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const byte = src[y * rowBytes + (x >> 3)];
            const bit = (byte >> (7 - (x & 7))) & 1;
            const val = bit ? 255 : 0;
            const dstIdx = (y * w + x) * 4;
            rgba[dstIdx] = val;
            rgba[dstIdx + 1] = val;
            rgba[dstIdx + 2] = val;
            rgba[dstIdx + 3] = 255;
          }
        }
      } else if (src.length === w * h) {
        // 8-bit grayscale
        for (let i = 0; i < w * h; i++) {
          const val = src[i];
          const dstIdx = i * 4;
          rgba[dstIdx] = val;
          rgba[dstIdx + 1] = val;
          rgba[dstIdx + 2] = val;
          rgba[dstIdx + 3] = 255;
        }
      } else {
        return null;
      }

      const imageData = new ImageData(rgba, w, h);
      ctx.putImageData(imageData, 0, 0);
    } else {
      return null;
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.88)
    );
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      bytes,
      dataUrl,
      widthPx: canvas.width,
      heightPx: canvas.height,
    };
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Packages extracted PDF text, headings, and embedded PDF images into a standard OpenXML .docx archive
 */
async function buildDocxBlob(
  pages: ExtractedPdfPage[],
  docTitle: string
): Promise<Blob> {
  const zip = new JSZip();

  const allImages: ExtractedPdfImage[] = [];
  for (const p of pages) {
    for (const block of p.blocks) {
      if (block.type === "image") {
        allImages.push(block);
      }
    }
  }

  const hasImages = allImages.length > 0;

  // 1. [Content_Types].xml
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasImages ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : ""}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  zip.file("[Content_Types].xml", contentTypesXml);

  // 2. _rels/.rels
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  zip.file("_rels/.rels", rootRelsXml);

  // 3. docProps/core.xml & docProps/app.xml
  const isoNow = new Date().toISOString();
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXmlText(docTitle)}</dc:title>
  <dc:creator>MONO-TRANSCODER</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${isoNow}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${isoNow}</dcterms:modified>
</cp:coreProperties>`;
  zip.file("docProps/core.xml", coreXml);

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>MONO-TRANSCODER Local OpenXML Engine</Application>
  <Pages>${pages.length}</Pages>
</Properties>`;
  zip.file("docProps/app.xml", appXml);

  // 4. word/styles.xml
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
    </w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="240" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="32"/>
      <w:szCs w:val="32"/>
    </w:rPr>
  </w:style>
</w:styles>`;
  zip.file("word/styles.xml", stylesXml);

  // 5. Build word/_rels/document.xml.rels & embed extracted PDF images in word/media/
  const docRelsEntries: string[] = [
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ];

  for (const img of allImages) {
    const mediaFilename = `img_${img.id}.jpg`;
    zip.file(`word/media/${mediaFilename}`, img.bytes);
    docRelsEntries.push(
      `<Relationship Id="rIdImg_${img.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaFilename}"/>`
    );
  }

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${docRelsEntries.join("\n  ")}
</Relationships>`;
  zip.file("word/_rels/document.xml.rels", docRelsXml);

  // 6. Build word/document.xml body paragraphs and inline images in reading order
  const bodyXmlParts: string[] = [];
  let docPrCounter = 1;

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const page = pages[pIdx];

    if (pIdx > 0) {
      bodyXmlParts.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    }

    if (page.blocks.length === 0) {
      bodyXmlParts.push(`<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>`);
      continue;
    }

    for (const block of page.blocks) {
      if (block.type === "text") {
        const escaped = escapeXmlText(block.text);
        if (!escaped.trim()) continue;

        if (block.isHeading) {
          bodyXmlParts.push(
            `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="30"/></w:rPr><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`
          );
        } else {
          bodyXmlParts.push(
            `<w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`
          );
        }
      } else if (block.type === "image") {
        // Convert PDF point width to OpenXML EMUs (1 pt = 12700 EMUs; max printable width = 6.25 in = 450 pt = 5715000 EMUs)
        const displayWidthPt = Math.min(450, Math.max(72, block.widthPt));
        const cx = Math.round(displayWidthPt * 12700);
        const aspect = block.heightPx / Math.max(1, block.widthPx);
        const cy = Math.max(12700, Math.round(cx * aspect));
        const rId = `rIdImg_${block.id}`;
        const prId = docPrCounter++;

        bodyXmlParts.push(`<w:p>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:docPr id="${prId}" name="PDF Image ${prId}"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="${prId}" name="img_${block.id}.jpg"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`);
      }
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXmlParts.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.file("word/document.xml", documentXml);

  return await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export default function PdfToWordView({
  onSuccess,
  askPassword,
  initialFile,
}: PdfToWordViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();

  const [file, setFile] = useState<File | null>(null);
  const [extractedPages, setExtractedPages] = useState<ExtractedPdfPage[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const scanPdfFile = useCallback(
    async (selectedFile: File) => {
      const isPdf =
        selectedFile.type === "application/pdf" ||
        selectedFile.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        showToast(
          `Invalid file type: ${selectedFile.name}. Please select a valid PDF document (.pdf).`,
          "error"
        );
        return;
      }

      if (selectedFile.size > 500 * 1024 * 1024) {
        showToast("PDF file exceeds the 500MB safe in-browser limit.", "error");
        return;
      }

      setFile(selectedFile);
      setExtractedPages([]);
      setIsScanning(true);
      setProgressMsg("SCANNING_PDF_TEXT_AND_IMAGE_STREAMS...");

      let pdfDocument: any = null;

      try {
        await yieldFrame();
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfjsLib = await loadPdfJsLibrary();
        const OPS = pdfjsLib.OPS || {};

        const loadWithPasswordAttempt = async (pwd?: string): Promise<any> => {
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
            if (isPasswordRequired) {
              const entered = await askPassword(pwd ? "wrong" : "required");
              if (entered === null) {
                throw new Error("Password decryption cancelled by user.");
              }
              return await loadWithPasswordAttempt(entered);
            }
            throw err;
          }
        };

        pdfDocument = await loadWithPasswordAttempt();
        const numPages = pdfDocument.numPages;

        const pagesData: ExtractedPdfPage[] = [];
        let globalImgIdx = 1;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (pageNum === 1 || pageNum === numPages || pageNum % 3 === 0) {
            setProgressMsg(`EXTRACTING_TEXT_&_IMAGES_PAGE_${pageNum}_OF_${numPages}...`);
            await yieldFrame();
          }

          const page = await pdfDocument.getPage(pageNum);
          const vp = page.getViewport({ scale: 1.0 });

          // 1. Extract vector text lines and their vertical Y positions
          const textContent = await page.getTextContent();
          const items = (textContent.items || []) as any[];

          const lineBuckets: {
            y: number;
            maxHeight: number;
            runs: { x: number; str: string }[];
          }[] = [];

          let totalFontHeight = 0;
          let fontHeightCount = 0;

          for (const item of items) {
            const str = String(item.str || "");
            if (!str.trim()) continue;
            const transform = item.transform || [1, 0, 0, 1, 0, 0];
            const x = Number(transform[4] || 0);
            const y = Number(transform[5] || 0);
            const h = Math.abs(Number(item.height || transform[3] || 11));

            if (h > 0) {
              totalFontHeight += h;
              fontHeightCount++;
            }

            let bucket = lineBuckets.find((b) => Math.abs(b.y - y) <= 4);
            if (!bucket) {
              bucket = { y, maxHeight: h, runs: [] };
              lineBuckets.push(bucket);
            } else if (h > bucket.maxHeight) {
              bucket.maxHeight = h;
            }
            bucket.runs.push({ x, str });
          }

          const avgFontHeight =
            fontHeightCount > 0 ? totalFontHeight / fontHeightCount : 11;

          const blocks: PageBlock[] = [];
          for (const bucket of lineBuckets) {
            bucket.runs.sort((a, b) => a.x - b.x);
            const lineText = bucket.runs
              .map((r) => r.str)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            if (lineText) {
              const isHeading =
                bucket.maxHeight >= avgFontHeight * 1.28 && lineText.length < 120;
              blocks.push({
                type: "text",
                y: bucket.y,
                text: lineText,
                isHeading,
              });
            }
          }

          // 2. Inspect PDF operator list to locate and extract embedded images (XObjects & Inline Images)
          try {
            const opList = await page.getOperatorList();
            const fnArray = opList?.fnArray || [];
            const argsArray = opList?.argsArray || [];

            const detectedImageOps: {
              isInline: boolean;
              objIdOrData: any;
              minX: number;
              minY: number;
              maxX: number;
              maxY: number;
              widthPt: number;
              heightPt: number;
              topY: number;
            }[] = [];

            let ctm = [1, 0, 0, 1, 0, 0];
            const ctmStack: number[][] = [];

            const opSave = OPS.save ?? 10;
            const opRestore = OPS.restore ?? 11;
            const opTransform = OPS.transform ?? 12;
            const opFormBegin = OPS.paintFormXObjectBegin ?? 74;
            const opFormEnd = OPS.paintFormXObjectEnd ?? 75;
            const opPaintJpeg = OPS.paintJpegXObject ?? 82;
            const opPaintImage = OPS.paintImageXObject ?? 85;
            const opPaintInline = OPS.paintInlineImageXObject ?? 86;
            const opPaintRepeat = OPS.paintImageXObjectRepeat ?? 88;

            for (let i = 0; i < fnArray.length; i++) {
              const fn = fnArray[i];
              const args = argsArray[i];

              if (fn === opSave) {
                ctmStack.push([...ctm]);
              } else if (fn === opRestore) {
                if (ctmStack.length > 0) ctm = ctmStack.pop()!;
              } else if (fn === opTransform) {
                if (Array.isArray(args) && args.length === 6) {
                  ctm = multiplyTransform(ctm, args.map(Number));
                }
              } else if (fn === opFormBegin) {
                ctmStack.push([...ctm]);
                if (Array.isArray(args?.[0]) && args[0].length === 6) {
                  ctm = multiplyTransform(ctm, args[0].map(Number));
                }
              } else if (fn === opFormEnd) {
                if (ctmStack.length > 0) ctm = ctmStack.pop()!;
              } else if (
                fn === opPaintImage ||
                fn === opPaintJpeg ||
                fn === opPaintInline ||
                fn === opPaintRepeat
              ) {
                const [a, b, c, d, e, f] = ctm;
                const xs = [e, a + e, c + e, a + c + e];
                const ys = [f, b + f, d + f, b + d + f];
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                const widthPt = maxX - minX;
                const heightPt = maxY - minY;

                // Filter out tiny 1x1 spacer/mask artifacts (< 10pt)
                if (widthPt >= 10 && heightPt >= 10) {
                  detectedImageOps.push({
                    isInline: fn === opPaintInline,
                    objIdOrData: args?.[0],
                    minX,
                    minY,
                    maxX,
                    maxY,
                    widthPt,
                    heightPt,
                    topY: maxY,
                  });
                }
              }
            }

            // If the page contains embedded images, render once to an offscreen canvas so pdf.js
            // resolves all XObject resources AND provides a pixel-accurate crop fallback
            if (detectedImageOps.length > 0) {
              const renderScale = 1.5;
              const renderVp = page.getViewport({ scale: renderScale });
              const pageCanvas = document.createElement("canvas");
              pageCanvas.width = Math.max(1, Math.round(renderVp.width));
              pageCanvas.height = Math.max(1, Math.round(renderVp.height));
              const pageCtx = pageCanvas.getContext("2d");

              if (pageCtx) {
                pageCtx.fillStyle = "#FFFFFF";
                pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                await page.render({ canvasContext: pageCtx, viewport: renderVp }).promise;
              }

              for (const imgOp of detectedImageOps) {
                let rawObj: any = null;
                if (imgOp.isInline) {
                  rawObj = imgOp.objIdOrData;
                } else if (typeof imgOp.objIdOrData === "string") {
                  try {
                    if (page.objs?.has?.(imgOp.objIdOrData)) {
                      rawObj = page.objs.get(imgOp.objIdOrData);
                    } else if (page.commonObjs?.has?.(imgOp.objIdOrData)) {
                      rawObj = page.commonObjs.get(imgOp.objIdOrData);
                    }
                  } catch {
                    rawObj = null;
                  }
                }

                // 2a. Primary extraction: directly decode the raw PDF Image XObject
                let encoded = await encodePdfImageObjectToJpeg(rawObj);

                // 2b. Fallback extraction: crop the image's exact bounding box from the rendered page canvas
                if (!encoded && pageCtx) {
                  const rect = renderVp.convertToViewportRectangle([
                    imgOp.minX,
                    imgOp.minY,
                    imgOp.maxX,
                    imgOp.maxY,
                  ]);
                  const sx = Math.max(0, Math.floor(Math.min(rect[0], rect[2])));
                  const sy = Math.max(0, Math.floor(Math.min(rect[1], rect[3])));
                  const sw = Math.min(
                    pageCanvas.width - sx,
                    Math.ceil(Math.abs(rect[2] - rect[0]))
                  );
                  const sh = Math.min(
                    pageCanvas.height - sy,
                    Math.ceil(Math.abs(rect[3] - rect[1]))
                  );

                  if (sw >= 10 && sh >= 10) {
                    const cropCanvas = document.createElement("canvas");
                    cropCanvas.width = sw;
                    cropCanvas.height = sh;
                    const cropCtx = cropCanvas.getContext("2d");
                    if (cropCtx) {
                      cropCtx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
                      const dataUrl = cropCanvas.toDataURL("image/jpeg", 0.88);
                      const blob: Blob | null = await new Promise((res) =>
                        cropCanvas.toBlob((b) => res(b), "image/jpeg", 0.88)
                      );
                      if (blob) {
                        encoded = {
                          bytes: new Uint8Array(await blob.arrayBuffer()),
                          dataUrl,
                          widthPx: sw,
                          heightPx: sh,
                        };
                      }
                    }
                    cropCanvas.width = 0;
                    cropCanvas.height = 0;
                  }
                }

                if (encoded) {
                  const imgId = `${pageNum}_${globalImgIdx++}`;
                  blocks.push({
                    type: "image",
                    id: imgId,
                    y: imgOp.topY,
                    bytes: encoded.bytes,
                    dataUrl: encoded.dataUrl,
                    widthPx: encoded.widthPx,
                    heightPx: encoded.heightPx,
                    widthPt: imgOp.widthPt,
                    heightPt: imgOp.heightPt,
                  });
                }
              }

              pageCanvas.width = 0;
              pageCanvas.height = 0;
            }
          } catch (imgErr) {
            logger.warn(`Page ${pageNum} image extraction warning:`, imgErr);
          }

          // Sort all page blocks (text lines + embedded images) top-to-bottom by PDF Y coordinate
          blocks.sort((a, b) => b.y - a.y);

          pagesData.push({
            pageNumber: pageNum,
            blocks,
            widthPt: vp.width,
            heightPt: vp.height,
          });

          if (typeof page.cleanup === "function") page.cleanup();
        }

        setExtractedPages(pagesData);
      } catch (err: any) {
        logger.error("PDF to Word scan error:", err);
        showToast(`Could not read PDF: ${err?.message || err}`, "error");
        setFile(null);
        setExtractedPages([]);
      } finally {
        setIsScanning(false);
        setProgressMsg("");
        if (pdfDocument && typeof pdfDocument.destroy === "function") {
          pdfDocument.destroy();
        }
      }
    },
    [askPassword, showToast]
  );

  useEffect(() => {
    if (initialFile) {
      scanPdfFile(initialFile);
    }
  }, [initialFile, scanPdfFile]);

  useEffect(() => {
    return registerDropHandler((files) => {
      const first = files[0];
      if (first) {
        scanPdfFile(first);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, scanPdfFile]);

  const stats = useMemo(() => {
    let linesCount = 0;
    let wordsCount = 0;
    let imagesCount = 0;
    for (const p of extractedPages) {
      for (const b of p.blocks) {
        if (b.type === "text") {
          linesCount++;
          wordsCount += b.text.split(/\s+/).filter(Boolean).length;
        } else if (b.type === "image") {
          imagesCount++;
        }
      }
    }
    return {
      pages: extractedPages.length,
      lines: linesCount,
      words: wordsCount,
      images: imagesCount,
    };
  }, [extractedPages]);

  const handleReset = () => {
    setFile(null);
    setExtractedPages([]);
    setIsScanning(false);
    setIsProcessing(false);
    setProgressMsg("");
  };

  const handleExportWordDocx = async () => {
    if (!file || extractedPages.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProgressMsg("PACKING_OPENXML_WORD_ARCHIVE...");

    try {
      await yieldFrame();
      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));
      const docxBlob = await buildDocxBlob(extractedPages, cleanName);
      const defaultFilename = `${cleanName}_monotranscoder`;

      await saveFile("pdf_to_word", {
        blob: docxBlob,
        filename: defaultFilename,
        size: docxBlob.size,
        format: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast("PDF converted to Word (.docx) successfully.", "success");
      onSuccess();
    } catch (err: any) {
      logger.error("PDF to Word export error:", err);
      showToast(`Failed to convert PDF to Word: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="pdf-to-word-view"
      aria-labelledby="pdf-to-word-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="pdf-to-word-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            PDF TO WORD CONVERTER // PDF_TO_WORD.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Extract PDF text, headings, and embedded PDF images into an editable Microsoft Word (.docx) document in browser memory.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="pdf-to-word-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF file to convert to Word. Drag and drop or press enter to browse."
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              scanPdfFile(e.dataTransfer.files[0]);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
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
              if (f) scanPdfFile(f);
            }}
            accept="application/pdf,.pdf"
            className="hidden"
            aria-label="Select PDF Document"
          />
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="pdf_to_word" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PDF TO CONVERT TO WORD (.DOCX)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Reconstructs editable paragraphs, headings, and embedded PDF images into a standard .DOCX file locally.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
            aria-label="Select PDF File"
          >
            SELECT_PDF_FILE
          </button>
        </div>
      ) : isScanning || isProcessing ? (
        <ToolSkeletonLoader
          variant="pdf_to_word"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          fileCount={extractedPages.length || 4}
          targetInfo="OPENXML .DOCX"
          statusMessage={
            progressMsg ||
            (isScanning ? "SCANNING_PDF_TEXT_AND_IMAGE_STREAMS..." : "GENERATING_DOCX_FILE...")
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Extracted Document & Image Preview */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono font-bold text-xs uppercase text-zinc-300 flex items-center gap-1.5">
                <AlignLeft className="w-4 h-4" /> EXTRACTED_DOCUMENT_PREVIEW
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold tabular-nums">
                {stats.pages} PAGES · {stats.words} WORDS · {stats.images} IMAGES
              </span>
            </div>

            <div className="bg-black border border-zinc-800 rounded-lg p-5 max-h-[420px] overflow-y-auto space-y-5 font-sans text-zinc-200">
              {extractedPages.slice(0, 15).map((p) => (
                <div
                  key={p.pageNumber}
                  className="space-y-2.5 pb-4 border-b border-zinc-900 last:border-b-0"
                >
                  <div className="text-[10px] font-mono font-bold uppercase text-zinc-500">
                    PAGE #{p.pageNumber}
                  </div>
                  {p.blocks.length > 0 ? (
                    p.blocks.map((block, bIdx) =>
                      block.type === "text" ? (
                        block.isHeading ? (
                          <h4 key={bIdx} className="text-sm font-bold text-white pt-1">
                            {block.text}
                          </h4>
                        ) : (
                          <p key={bIdx} className="text-xs leading-relaxed text-zinc-300">
                            {block.text}
                          </p>
                        )
                      ) : (
                        <div
                          key={bIdx}
                          className="my-2 p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg inline-block max-w-full"
                        >
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-300 mb-1.5">
                            <ImageIcon className="w-3 h-3 text-violet-400" />
                            <span>
                              EMBEDDED_IMAGE ({block.widthPx}×{block.heightPx}px)
                            </span>
                          </div>
                          <img
                            src={block.dataUrl}
                            alt={`Extracted from page ${p.pageNumber}`}
                            className="max-h-40 w-auto rounded border border-zinc-800 object-contain bg-white"
                          />
                        </div>
                      )
                    )
                  ) : (
                    <p className="text-xs font-mono text-zinc-500">
                      [Blank page — no selectable text or embedded image objects found on Page {p.pageNumber}]
                    </p>
                  )}
                </div>
              ))}
              {extractedPages.length > 15 && (
                <p className="text-[11px] font-mono text-zinc-500">
                  + {extractedPages.length - 15} additional pages ready for .DOCX export...
                </p>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono tabular-nums">
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">TOTAL_PAGES</span>
                <strong className="text-sky-400">{stats.pages}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">TEXT_LINES</span>
                <strong className="text-amber-400">{stats.lines}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">WORD_COUNT</span>
                <strong className="text-emerald-400">{stats.words}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">IMAGES</span>
                <strong className="text-violet-400">{stats.images}</strong>
              </div>
            </div>
          </div>

          {/* Right: DOCX Export Summary & Action */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4 text-emerald-400" /> DOCX_EXPORT_CONFIG.CFG
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
                  <span className="text-zinc-400">SOURCE_PDF:</span>
                  <strong className="text-emerald-400 truncate max-w-[180px]" title={file.name}>
                    {file.name}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">FILE_SIZE:</span>
                  <strong className="text-amber-400 tabular-nums">{formatBytes(file.size)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">EXTRACTED_IMAGES:</span>
                  <strong className="text-violet-400 tabular-nums">{stats.images} EMBEDDED</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">OUTPUT_FORMAT:</span>
                  <strong className="text-sky-400">WORD (.DOCX)</strong>
                </div>
              </div>

              <div className="bg-black border border-zinc-800 p-3.5 rounded-lg space-y-2 text-[11px] font-mono text-zinc-400 leading-relaxed">
                <div className="text-white font-bold uppercase text-xs flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-white" />
                  AUTOMATIC_DOCX_PIPELINE
                </div>
                <p>
                  • <strong className="text-zinc-200">Text &amp; Headings:</strong> Reconstructs paragraphs and headings sorted by vertical position.
                </p>
                <p>
                  • <strong className="text-zinc-200">Embedded PDF Images:</strong> Automatically extracts image XObjects from each PDF page, converts them to media assets (<code className="text-white font-bold">word/media/</code>), and places them inline at their reading position.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportWordDocx}
              disabled={isProcessing}
              aria-label="Convert PDF to Word Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>CONVERT PDF TO WORD (.DOCX)</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
