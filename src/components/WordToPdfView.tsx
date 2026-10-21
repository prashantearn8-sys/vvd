/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  FileText,
  FolderOpen,
  Zap,
  UploadCloud,
  AlignLeft,
  Table as TableIcon,
  Image as ImageIcon,
} from "lucide-react";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { logger } from "../utils/logger";
import ToolSkeletonLoader from "./ToolSkeletonLoader";

interface WordToPdfViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
}

type DocBlock =
  | {
      type: "paragraph";
      text: string;
      style: "title" | "h1" | "h2" | "h3" | "body" | "list";
      bold?: boolean;
      italic?: boolean;
      align?: "left" | "center" | "right";
    }
  | {
      type: "table";
      rows: string[][];
    }
  | {
      type: "image";
      dataUrl: string;
      mimeType: "image/jpeg" | "image/png";
      bytes: Uint8Array;
      width: number;
      height: number;
    }
  | {
      type: "pageBreak";
    };

type PageSizePreset = "A4" | "LETTER";
type MarginPreset = "COMPACT" | "NORMAL" | "WIDE";
type FontScalePreset = "SMALL" | "MEDIUM" | "LARGE";

const PAGE_DIMENSIONS: Record<PageSizePreset, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

const MARGIN_VALUES: Record<MarginPreset, number> = {
  COMPACT: 36,
  NORMAL: 54,
  WIDE: 72,
};

const FONT_SCALE_MULTIPLIER: Record<FontScalePreset, number> = {
  SMALL: 0.9,
  MEDIUM: 1.0,
  LARGE: 1.15,
};

/**
 * Checks if a string contains only characters supported by standard PDF WinAnsi encoding
 */
function isWinAnsiSafe(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 255 && code !== 8211 && code !== 8212 && code !== 8216 && code !== 8217 && code !== 8220 && code !== 8221 && code !== 8226 && code !== 8230) {
      return false;
    }
  }
  return true;
}

/**
 * Normalizes common typographic punctuation to safe ASCII/WinAnsi equivalents
 */
function normalizeTextForPdf(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, "    ");
}

/**
 * Extracts structured blocks from a .docx archive or plain text buffer in browser memory
 */
async function parseWordDocumentInBrowser(file: File): Promise<DocBlock[]> {
  const arrayBuffer = await file.arrayBuffer();
  const lowerName = file.name.toLowerCase();

  // Check if file is a ZIP-based .docx archive (starts with PK\x03\x04)
  const headerBytes = new Uint8Array(arrayBuffer.slice(0, 4));
  const isZipHeader =
    headerBytes.length >= 4 &&
    headerBytes[0] === 0x50 &&
    headerBytes[1] === 0x4b &&
    headerBytes[2] === 0x03 &&
    headerBytes[3] === 0x04;

  if (isZipHeader || lowerName.endsWith(".docx")) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) {
      throw new Error("Invalid .docx structure: missing word/document.xml.");
    }

    // Parse relationship map for embedded images
    const relsMap = new Map<string, string>();
    const relsFile = zip.file("word/_rels/document.xml.rels");
    if (relsFile) {
      const relsXml = await relsFile.async("string");
      const parser = new DOMParser();
      const relsDom = parser.parseFromString(relsXml, "application/xml");
      const relNodes = Array.from(relsDom.getElementsByTagName("Relationship"));
      for (const rel of relNodes) {
        const id = rel.getAttribute("Id");
        const target = rel.getAttribute("Target");
        if (id && target) {
          relsMap.set(id, target.replace(/^\/+/, ""));
        }
      }
    }

    const xmlText = await docXmlFile.async("string");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");

    const body =
      xmlDoc.getElementsByTagName("w:body")[0] ||
      xmlDoc.getElementsByTagName("body")[0];
    if (!body) {
      throw new Error("Could not locate document body in word/document.xml.");
    }

    const blocks: DocBlock[] = [];

    const extractParagraphBlock = async (pNode: Element): Promise<DocBlock[]> => {
      const result: DocBlock[] = [];
      let style: "title" | "h1" | "h2" | "h3" | "body" | "list" = "body";
      let align: "left" | "center" | "right" = "left";
      let isBold = false;
      let isItalic = false;

      const pPr =
        pNode.getElementsByTagName("w:pPr")[0] ||
        pNode.getElementsByTagName("pPr")[0];
      if (pPr) {
        const pStyleNode =
          pPr.getElementsByTagName("w:pStyle")[0] ||
          pPr.getElementsByTagName("pStyle")[0];
        const styleVal = (
          pStyleNode?.getAttribute("w:val") ||
          pStyleNode?.getAttribute("val") ||
          ""
        ).toLowerCase();

        if (styleVal.includes("title")) style = "title";
        else if (styleVal.includes("heading1") || styleVal === "h1" || styleVal === "1")
          style = "h1";
        else if (styleVal.includes("heading2") || styleVal === "h2" || styleVal === "2")
          style = "h2";
        else if (styleVal.includes("heading3") || styleVal === "h3" || styleVal === "3")
          style = "h3";
        else if (styleVal.includes("list")) style = "list";

        const numPr =
          pPr.getElementsByTagName("w:numPr")[0] ||
          pPr.getElementsByTagName("numPr")[0];
        if (numPr && style === "body") {
          style = "list";
        }

        const jcNode =
          pPr.getElementsByTagName("w:jc")[0] || pPr.getElementsByTagName("jc")[0];
        const jcVal = (
          jcNode?.getAttribute("w:val") ||
          jcNode?.getAttribute("val") ||
          ""
        ).toLowerCase();
        if (jcVal === "center") align = "center";
        else if (jcVal === "right" || jcVal === "end") align = "right";
      }

      // Check for embedded images inside paragraph runs
      const blips = [
        ...Array.from(pNode.getElementsByTagName("a:blip")),
        ...Array.from(pNode.getElementsByTagName("blip")),
      ];
      for (const blip of blips) {
        const embedId =
          blip.getAttribute("r:embed") || blip.getAttribute("embed");
        if (embedId && relsMap.has(embedId)) {
          const targetPath = relsMap.get(embedId)!;
          const fullZipPath = targetPath.startsWith("word/")
            ? targetPath
            : `word/${targetPath}`;
          const mediaFile = zip.file(fullZipPath);
          if (mediaFile) {
            try {
              const imgBytes = await mediaFile.async("uint8array");
              const lowerTarget = fullZipPath.toLowerCase();
              if (
                lowerTarget.endsWith(".png") ||
                lowerTarget.endsWith(".jpg") ||
                lowerTarget.endsWith(".jpeg")
              ) {
                const mimeType = lowerTarget.endsWith(".png")
                  ? "image/png"
                  : "image/jpeg";
                const blob = new Blob([imgBytes], { type: mimeType });
                const dataUrl = await new Promise<string>((res) => {
                  const reader = new FileReader();
                  reader.onloadend = () => res(String(reader.result || ""));
                  reader.readAsDataURL(blob);
                });
                const dims = await new Promise<{ width: number; height: number }>(
                  (res) => {
                    const img = new Image();
                    img.onload = () =>
                      res({
                        width: img.naturalWidth || 400,
                        height: img.naturalHeight || 300,
                      });
                    img.onerror = () => res({ width: 400, height: 300 });
                    img.src = dataUrl;
                  }
                );
                result.push({
                  type: "image",
                  dataUrl,
                  mimeType,
                  bytes: imgBytes,
                  width: dims.width,
                  height: dims.height,
                });
              }
            } catch (imgErr) {
              logger.warn("Skipped embedded DOCX image:", imgErr);
            }
          }
        }
      }

      // Extract text runs
      let textChunks: string[] = [];
      let runBoldCount = 0;
      let runItalicCount = 0;
      let totalRunsWithText = 0;
      let maxFontSizeHalfPts = 0;

      const runs = [
        ...Array.from(pNode.getElementsByTagName("w:r")),
        ...Array.from(pNode.getElementsByTagName("r")),
      ];

      for (const run of runs) {
        const rPr =
          run.getElementsByTagName("w:rPr")[0] ||
          run.getElementsByTagName("rPr")[0];
        let rBold = false;
        let rItalic = false;

        if (rPr) {
          const bNode =
            rPr.getElementsByTagName("w:b")[0] || rPr.getElementsByTagName("b")[0];
          if (bNode) {
            const val = bNode.getAttribute("w:val") || bNode.getAttribute("val");
            if (val !== "0" && val !== "false") rBold = true;
          }
          const iNode =
            rPr.getElementsByTagName("w:i")[0] || rPr.getElementsByTagName("i")[0];
          if (iNode) {
            const val = iNode.getAttribute("w:val") || iNode.getAttribute("val");
            if (val !== "0" && val !== "false") rItalic = true;
          }
          const szNode =
            rPr.getElementsByTagName("w:sz")[0] ||
            rPr.getElementsByTagName("sz")[0];
          if (szNode) {
            const szVal = parseInt(
              szNode.getAttribute("w:val") || szNode.getAttribute("val") || "0",
              10
            );
            if (!isNaN(szVal) && szVal > maxFontSizeHalfPts) {
              maxFontSizeHalfPts = szVal;
            }
          }
        }

        let runStr = "";
        for (let i = 0; i < run.childNodes.length; i++) {
          const child = run.childNodes[i] as Element;
          const nodeName = child.nodeName.toLowerCase();
          if (nodeName === "w:t" || nodeName === "t") {
            runStr += child.textContent || "";
          } else if (nodeName === "w:tab" || nodeName === "tab") {
            runStr += "    ";
          } else if (nodeName === "w:br" || nodeName === "br") {
            const brType =
              child.getAttribute?.("w:type") || child.getAttribute?.("type");
            if (brType === "page") {
              if (textChunks.join("").trim()) {
                result.push({
                  type: "paragraph",
                  text: textChunks.join(""),
                  style,
                  bold: isBold,
                  italic: isItalic,
                  align,
                });
                textChunks = [];
              }
              result.push({ type: "pageBreak" });
            } else {
              runStr += "\n";
            }
          }
        }

        if (runStr.length > 0) {
          textChunks.push(runStr);
          if (runStr.trim().length > 0) {
            totalRunsWithText++;
            if (rBold) runBoldCount++;
            if (rItalic) runItalicCount++;
          }
        }
      }

      // Fallback if paragraph had text outside standard w:r nodes
      if (textChunks.length === 0 && runs.length === 0) {
        const rawText = pNode.textContent?.trim() || "";
        if (rawText) {
          textChunks.push(rawText);
        }
      }

      const combinedText = textChunks.join("").replace(/\r\n/g, "\n");
      if (combinedText.trim().length > 0) {
        if (totalRunsWithText > 0 && runBoldCount === totalRunsWithText) {
          isBold = true;
        }
        if (totalRunsWithText > 0 && runItalicCount === totalRunsWithText) {
          isItalic = true;
        }
        // Infer heading if font size is large
        if (style === "body") {
          if (maxFontSizeHalfPts >= 40) style = "title";
          else if (maxFontSizeHalfPts >= 32) style = "h1";
          else if (maxFontSizeHalfPts >= 28) style = "h2";
          else if (maxFontSizeHalfPts >= 25 && isBold) style = "h3";
        }

        const lines = combinedText.split("\n");
        for (const line of lines) {
          if (line.trim().length > 0) {
            result.push({
              type: "paragraph",
              text: line,
              style,
              bold: isBold,
              italic: isItalic,
              align,
            });
          }
        }
      }

      return result;
    };

    for (let i = 0; i < body.childNodes.length; i++) {
      const node = body.childNodes[i] as Element;
      if (!node || !node.nodeName) continue;
      const tag = node.nodeName.toLowerCase();

      if (tag === "w:p" || tag === "p") {
        const pBlocks = await extractParagraphBlock(node);
        blocks.push(...pBlocks);
      } else if (tag === "w:tbl" || tag === "tbl") {
        const rows: string[][] = [];
        const trNodes = [
          ...Array.from(node.getElementsByTagName("w:tr")),
          ...Array.from(node.getElementsByTagName("tr")),
        ];
        for (const tr of trNodes) {
          const rowCells: string[] = [];
          const tcNodes = [
            ...Array.from(tr.getElementsByTagName("w:tc")),
            ...Array.from(tr.getElementsByTagName("tc")),
          ];
          for (const tc of tcNodes) {
            const cellText = (tc.textContent || "").trim().replace(/\s+/g, " ");
            rowCells.push(cellText);
          }
          if (rowCells.some((c) => c.length > 0)) {
            rows.push(rowCells);
          }
        }
        if (rows.length > 0) {
          blocks.push({ type: "table", rows });
        }
      }
    }

    if (blocks.length === 0) {
      const fallbackText = (body.textContent || "").trim();
      if (fallbackText) {
        blocks.push({
          type: "paragraph",
          text: fallbackText,
          style: "body",
        });
      }
    }

    return blocks;
  }

  // Fallback for plain text / RTF / legacy .doc text extraction
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let rawString = decoder.decode(arrayBuffer);

  if (lowerName.endsWith(".rtf") || rawString.startsWith("{\\rtf")) {
    rawString = rawString
      .replace(/\\par[d]?/g, "\n")
      .replace(/\{\\[^{}]+\}/g, "")
      .replace(/\\[a-zA-Z]+\d*\s?/g, "")
      .replace(/[{}]/g, "");
  }

  const lines = rawString.split(/\r?\n/);
  const blocks: DocBlock[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      blocks.push({
        type: "paragraph",
        text: trimmed,
        style: "body",
      });
    }
  }

  if (blocks.length === 0) {
    throw new Error("No readable text content found in the selected document.");
  }

  return blocks;
}

export default function WordToPdfView({ onSuccess, initialFile }: WordToPdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();

  const [file, setFile] = useState<File | null>(null);
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [pageSize, setPageSize] = useState<PageSizePreset>("A4");
  const [marginPreset, setMarginPreset] = useState<MarginPreset>("NORMAL");
  const [fontScale, setFontScale] = useState<FontScalePreset>("MEDIUM");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadWordFile = useCallback(
    async (selectedFile: File) => {
      const lower = selectedFile.name.toLowerCase();
      const isSupported =
        lower.endsWith(".docx") ||
        lower.endsWith(".doc") ||
        lower.endsWith(".rtf") ||
        lower.endsWith(".txt") ||
        selectedFile.type.includes("word") ||
        selectedFile.type.includes("officedocument") ||
        selectedFile.type === "text/plain";

      if (!isSupported) {
        showToast(
          `Unsupported file: ${selectedFile.name}. Please select a Word (.docx, .doc, .rtf) or text document.`,
          "error"
        );
        return;
      }

      setFile(selectedFile);
      setIsParsing(true);
      try {
        await yieldFrame();
        const extracted = await parseWordDocumentInBrowser(selectedFile);
        setBlocks(extracted);
        showToast(`Loaded "${selectedFile.name}" (${extracted.length} blocks parsed).`, "success");
      } catch (err: any) {
        logger.error("Word parse error:", err);
        showToast(`Could not parse Word file: ${err?.message || err}`, "error");
        setFile(null);
        setBlocks([]);
      } finally {
        setIsParsing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (initialFile) {
      handleLoadWordFile(initialFile);
    }
  }, [initialFile, handleLoadWordFile]);

  useEffect(() => {
    return registerDropHandler((files) => {
      const first = files[0];
      if (first) {
        handleLoadWordFile(first);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, handleLoadWordFile]);

  const stats = useMemo(() => {
    let paragraphs = 0;
    let words = 0;
    let tables = 0;
    let images = 0;

    for (const b of blocks) {
      if (b.type === "paragraph") {
        paragraphs++;
        const w = b.text.trim().split(/\s+/).filter(Boolean).length;
        words += w;
      } else if (b.type === "table") {
        tables++;
        for (const r of b.rows) {
          for (const c of r) {
            words += c.trim().split(/\s+/).filter(Boolean).length;
          }
        }
      } else if (b.type === "image") {
        images++;
      }
    }

    return { paragraphs, words, tables, images };
  }, [blocks]);

  const handleReset = () => {
    setFile(null);
    setBlocks([]);
    setIsParsing(false);
    setIsProcessing(false);
    setProgressMsg("");
  };

  const handleConvertToPdf = async () => {
    if (!file || blocks.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProgressMsg("INITIALIZING_PDF_TYPESETTER...");

    try {
      await yieldFrame();

      const pdfDoc = await PDFDocument.create();
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

      const { width: pageW, height: pageH } = PAGE_DIMENSIONS[pageSize];
      const margin = MARGIN_VALUES[marginPreset];
      const scaleMult = FONT_SCALE_MULTIPLIER[fontScale];
      const maxContentWidth = pageW - margin * 2;

      let currentPage = pdfDoc.addPage([pageW, pageH]);
      let cursorY = pageH - margin;

      const ensureSpace = (neededHeight: number) => {
        if (cursorY - neededHeight < margin) {
          currentPage = pdfDoc.addPage([pageW, pageH]);
          cursorY = pageH - margin;
        }
      };

      // Helper to render non-WinAnsi Unicode lines via high-DPI canvas image embedding
      const drawUnicodeLineViaCanvas = async (
        lineText: string,
        fontSizePt: number,
        isBoldText: boolean,
        isItalicText: boolean,
        xPos: number,
        yPos: number
      ) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const dpiScale = 2.5;
        const pxSize = Math.round(fontSizePt * dpiScale);
        canvas.width = Math.max(100, Math.round(maxContentWidth * dpiScale));
        canvas.height = Math.max(24, Math.round(fontSizePt * 1.6 * dpiScale));

        if (ctx) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#111111";
          ctx.font = `${isItalicText ? "italic " : ""}${
            isBoldText ? "bold " : ""
          }${pxSize}px sans-serif`;
          ctx.textBaseline = "top";
          ctx.fillText(lineText, 0, Math.round(fontSizePt * 0.15 * dpiScale));
        }

        const pngBlob: Blob = await new Promise((res, rej) =>
          canvas.toBlob((b) => (b ? res(b) : rej(new Error("Canvas line export failed"))), "image/png")
        );
        canvas.width = 0;
        canvas.height = 0;

        const pngBytes = await pngBlob.arrayBuffer();
        const embeddedPng = await pdfDoc.embedPng(pngBytes);
        const drawW = maxContentWidth;
        const drawH = fontSizePt * 1.6;
        currentPage.drawImage(embeddedPng, {
          x: xPos,
          y: yPos - fontSizePt * 0.25,
          width: drawW,
          height: drawH,
        });
      };

      for (let idx = 0; idx < blocks.length; idx++) {
        if (idx % 15 === 0) {
          setProgressMsg(`TYPESETTING_BLOCK_${idx + 1}_OF_${blocks.length}...`);
          await yieldFrame();
        }

        const block = blocks[idx];

        if (block.type === "pageBreak") {
          currentPage = pdfDoc.addPage([pageW, pageH]);
          cursorY = pageH - margin;
          continue;
        }

        if (block.type === "image") {
          try {
            const embeddedImg =
              block.mimeType === "image/png"
                ? await pdfDoc.embedPng(block.bytes)
                : await pdfDoc.embedJpg(block.bytes);

            const maxImgW = maxContentWidth;
            const maxImgH = (pageH - margin * 2) * 0.65;
            const ratio = Math.min(
              1,
              maxImgW / Math.max(1, block.width),
              maxImgH / Math.max(1, block.height)
            );
            const drawW = block.width * ratio;
            const drawH = block.height * ratio;

            ensureSpace(drawH + 14);
            currentPage.drawImage(embeddedImg, {
              x: margin + (maxContentWidth - drawW) / 2,
              y: cursorY - drawH,
              width: drawW,
              height: drawH,
            });
            cursorY -= drawH + 14;
          } catch (imgEmbedErr) {
            logger.warn("Skipped image during PDF compilation:", imgEmbedErr);
          }
          continue;
        }

        if (block.type === "table") {
          const rowHeight = Math.round(20 * scaleMult);
          const fontSize = Math.round(9.5 * scaleMult * 10) / 10;
          const numCols = Math.max(1, ...block.rows.map((r) => r.length));
          const colWidth = maxContentWidth / numCols;

          for (let rIdx = 0; rIdx < block.rows.length; rIdx++) {
            ensureSpace(rowHeight + 4);
            const row = block.rows[rIdx];
            const rowTopY = cursorY;

            // Draw cell borders & text
            for (let cIdx = 0; cIdx < numCols; cIdx++) {
              const cellX = margin + cIdx * colWidth;
              currentPage.drawRectangle({
                x: cellX,
                y: rowTopY - rowHeight,
                width: colWidth,
                height: rowHeight,
                borderColor: rgb(0.75, 0.75, 0.75),
                borderWidth: 0.5,
                color: rIdx === 0 ? rgb(0.95, 0.95, 0.95) : undefined,
              });

              const rawCellText = normalizeTextForPdf(row[cIdx] || "");
              const maxChars = Math.max(4, Math.floor((colWidth - 10) / (fontSize * 0.55)));
              const clippedText =
                rawCellText.length > maxChars
                  ? `${rawCellText.slice(0, maxChars - 1)}...`
                  : rawCellText;

              if (clippedText && isWinAnsiSafe(clippedText)) {
                currentPage.drawText(clippedText, {
                  x: cellX + 5,
                  y: rowTopY - rowHeight + 6,
                  size: fontSize,
                  font: rIdx === 0 ? fontBold : fontRegular,
                  color: rgb(0.1, 0.1, 0.1),
                });
              }
            }
            cursorY -= rowHeight;
          }
          cursorY -= 10;
          continue;
        }

        if (block.type === "paragraph") {
          const styleSizes: Record<typeof block.style, number> = {
            title: 22 * scaleMult,
            h1: 17 * scaleMult,
            h2: 14 * scaleMult,
            h3: 12.5 * scaleMult,
            body: 11 * scaleMult,
            list: 11 * scaleMult,
          };

          const fontSize = Math.round(styleSizes[block.style] * 10) / 10;
          const lineHeight = fontSize * 1.45;
          const isBold =
            block.bold ||
            block.style === "title" ||
            block.style === "h1" ||
            block.style === "h2" ||
            block.style === "h3";
          const activeFont = isBold
            ? fontBold
            : block.italic
            ? fontItalic
            : fontRegular;

          const indent = block.style === "list" ? 16 : 0;
          const availWidth = maxContentWidth - indent;
          const prefix = block.style === "list" ? "•  " : "";
          const normalized = normalizeTextForPdf(`${prefix}${block.text}`);
          const winAnsiCompatible = isWinAnsiSafe(normalized);

          // Word-wrap paragraph into lines
          const words = normalized.split(" ");
          const wrappedLines: string[] = [];
          let currentLine = "";

          for (const word of words) {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            let candidateWidth = candidate.length * (fontSize * 0.53);
            if (winAnsiCompatible) {
              try {
                candidateWidth = activeFont.widthOfTextAtSize(candidate, fontSize);
              } catch {
                // fallback width estimate
              }
            }

            if (candidateWidth <= availWidth || !currentLine) {
              currentLine = candidate;
            } else {
              wrappedLines.push(currentLine);
              currentLine = word;
            }
          }
          if (currentLine) {
            wrappedLines.push(currentLine);
          }

          if (block.style === "h1" || block.style === "h2" || block.style === "title") {
            cursorY -= 6;
          }

          for (const line of wrappedLines) {
            ensureSpace(lineHeight + 2);
            cursorY -= lineHeight;

            if (winAnsiCompatible) {
              let xPos = margin + indent;
              if (block.align === "center" || block.align === "right") {
                try {
                  const lw = activeFont.widthOfTextAtSize(line, fontSize);
                  if (block.align === "center") {
                    xPos = margin + Math.max(0, (maxContentWidth - lw) / 2);
                  } else if (block.align === "right") {
                    xPos = margin + Math.max(0, maxContentWidth - lw);
                  }
                } catch {
                  // default left
                }
              }

              currentPage.drawText(line, {
                x: xPos,
                y: cursorY,
                size: fontSize,
                font: activeFont,
                color: rgb(0.08, 0.08, 0.08),
              });
            } else {
              await drawUnicodeLineViaCanvas(
                line,
                fontSize,
                Boolean(isBold),
                Boolean(block.italic),
                margin + indent,
                cursorY
              );
            }
          }

          cursorY -= block.style === "list" ? 3 : 6;
        }
      }

      setProgressMsg("SAVING_PDF_DOCUMENT...");
      const pdfBytes = await pdfDoc.save({
        useObjectStreams: true,
        objectsPerTick: Infinity,
      });

      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));
      const defaultFilename = `${cleanName}_monotranscoder`;

      await saveFile("word_to_pdf", {
        blob: pdfBlob,
        filename: defaultFilename,
        size: pdfBlob.size,
        format: "application/pdf",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast("Word document converted to PDF successfully.", "success");
      onSuccess();
    } catch (err: any) {
      logger.error("Word to PDF conversion error:", err);
      showToast(`Failed to convert Word to PDF: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="word-to-pdf-view"
      aria-labelledby="word-to-pdf-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="word-to-pdf-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            WORD TO PDF CONVERTER // WORD_TO_PDF.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Convert Word (.docx, .rtf, .txt) documents into clean, paginated PDF files directly in browser memory.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="word-to-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload Word file to convert to PDF. Drag and drop or press enter to browse."
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              handleLoadWordFile(e.dataTransfer.files[0]);
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
              if (f) handleLoadWordFile(f);
            }}
            accept=".docx,.doc,.rtf,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
            className="hidden"
            aria-label="Select Word Document"
          />
          <div className="mx-auto w-12 h-12 border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center text-white mb-4 rounded">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE WORD DOCUMENT (.DOCX)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Parses OpenXML paragraphs, headings, lists, tables, and embedded images with zero server uploads.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
            aria-label="Select Word File"
          >
            SELECT_WORD_FILE
          </button>
        </div>
      ) : isParsing || isProcessing ? (
        <ToolSkeletonLoader
          variant="word_to_pdf"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo={`${pageSize} PDF`}
          statusMessage={
            progressMsg ||
            (isParsing ? "PARSING_OPENXML_ARCHIVE..." : "COMPILING_PDF_DOCUMENT...")
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Document Preview & Extracted Structure */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono font-bold text-xs uppercase text-zinc-300 flex items-center gap-1.5">
                <AlignLeft className="w-4 h-4 text-teal-400" /> DOCUMENT_CONTENT_PREVIEW
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold tabular-nums">
                {stats.words} WORDS · {stats.paragraphs} PARAGRAPHS
              </span>
            </div>

            <div className="bg-black border border-zinc-800 rounded-lg p-5 max-h-[420px] overflow-y-auto space-y-3 font-sans text-zinc-200">
              {blocks.slice(0, 80).map((b, i) => {
                if (b.type === "paragraph") {
                  if (b.style === "title" || b.style === "h1") {
                    return (
                      <h3 key={i} className="text-base font-bold text-white pt-1">
                        {b.text}
                      </h3>
                    );
                  }
                  if (b.style === "h2" || b.style === "h3") {
                    return (
                      <h4 key={i} className="text-sm font-bold text-zinc-100 pt-1">
                        {b.text}
                      </h4>
                    );
                  }
                  return (
                    <p
                      key={i}
                      className={`text-xs leading-relaxed text-zinc-300 ${
                        b.style === "list" ? "pl-4" : ""
                      } ${b.bold ? "font-bold text-white" : ""}`}
                    >
                      {b.style === "list" ? `• ${b.text}` : b.text}
                    </p>
                  );
                }
                if (b.type === "table") {
                  return (
                    <div
                      key={i}
                      className="border border-zinc-800 rounded overflow-x-auto my-2"
                    >
                      <table className="w-full text-[11px] font-mono text-left border-collapse">
                        <tbody>
                          {b.rows.slice(0, 6).map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx === 0
                                  ? "bg-zinc-900 font-bold text-white"
                                  : "border-t border-zinc-800 text-zinc-300"
                              }
                            >
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="p-1.5 border-r border-zinc-800 last:border-r-0">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }
                if (b.type === "image") {
                  return (
                    <div key={i} className="my-2 flex justify-center bg-zinc-900/50 p-2 rounded border border-zinc-800">
                      <img
                        src={b.dataUrl}
                        alt="Embedded document graphic"
                        referrerPolicy="no-referrer"
                        className="max-h-40 object-contain rounded"
                      />
                    </div>
                  );
                }
                return null;
              })}
              {blocks.length > 80 && (
                <p className="text-[11px] font-mono text-zinc-500 pt-2 border-t border-zinc-900">
                  + {blocks.length - 80} additional content blocks ready for PDF compilation...
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono tabular-nums">
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">PARAGRAPHS</span>
                <strong className="text-sky-400">{stats.paragraphs}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">WORD_COUNT</span>
                <strong className="text-emerald-400">{stats.words}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">TABLES</span>
                <strong className="text-amber-400 flex items-center gap-1">
                  <TableIcon className="w-3 h-3 text-amber-400" /> {stats.tables}
                </strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">IMAGES</span>
                <strong className="text-violet-400 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3 text-violet-400" /> {stats.images}
                </strong>
              </div>
            </div>
          </div>

          {/* Right: Typesetting Parameters & Action */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4 text-teal-400" /> TYPESET_CONFIG.CFG
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
                  <span className="text-zinc-400">SOURCE_SIZE:</span>
                  <strong className="text-amber-400 tabular-nums">{formatBytes(file.size)}</strong>
                </div>
              </div>

              {/* Page Size Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  PAGE SIZE FORMAT:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["A4", "LETTER"] as PageSizePreset[]).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setPageSize(sz)}
                      className={`py-2 px-3 rounded-lg font-mono text-xs font-bold uppercase border-2 transition-all cursor-pointer ${
                        pageSize === sz
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {sz === "A4" ? "A4 (210 × 297 MM)" : "US LETTER (8.5 × 11 IN)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margin Preset */}
              <div className="space-y-2">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  PAGE MARGINS:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["COMPACT", "NORMAL", "WIDE"] as MarginPreset[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMarginPreset(m)}
                      className={`py-2 px-2 rounded-lg font-mono text-xs font-bold uppercase border-2 transition-all cursor-pointer ${
                        marginPreset === m
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Scale */}
              <div className="space-y-2">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  TYPOGRAPHY SCALE:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["SMALL", "MEDIUM", "LARGE"] as FontScalePreset[]).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => setFontScale(sc)}
                      className={`py-2 px-2 rounded-lg font-mono text-xs font-bold uppercase border-2 transition-all cursor-pointer ${
                        fontScale === sc
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {sc}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConvertToPdf}
              disabled={isProcessing}
              aria-label="Convert Word to PDF Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>CONVERT WORD TO PDF NOW</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
