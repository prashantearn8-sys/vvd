/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  Table as TableIcon,
  FolderOpen,
  Zap,
  Layers,
  Grid,
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
import ModuleIconBadge from "./ModuleIconBadge";

interface ExcelToPdfViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
}

interface ParsedWorksheet {
  name: string;
  rows: string[][];
  colCount: number;
}

type PageSizePreset = "A4" | "LETTER";
type OrientationPreset = "LANDSCAPE" | "PORTRAIT";
type SheetScope = "ALL_SHEETS" | "ACTIVE_SHEET";
type FontScalePreset = "SMALL" | "MEDIUM" | "LARGE";

const PAGE_DIMENSIONS: Record<PageSizePreset, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

const FONT_SCALE_MULTIPLIER: Record<FontScalePreset, number> = {
  SMALL: 0.85,
  MEDIUM: 1.0,
  LARGE: 1.15,
};

function normalizeTextForPdf(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, "  ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

/**
 * Converts an Excel column letter sequence ("A", "B", "AA") to 0-based index
 */
function colLettersToIndex(cellRef: string): number {
  const match = cellRef.match(/^[A-Za-z]+/);
  if (!match) return 0;
  const letters = match[0].toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, col - 1);
}

/**
 * Parses CSV or TSV text into a 2D array of strings
 */
function parseDelimitedText(text: string): string[][] {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join("\n");
  const tabCount = (firstLines.match(/\t/g) || []).length;
  const semiCount = (firstLines.match(/;/g) || []).length;
  const commaCount = (firstLines.match(/,/g) || []).length;

  let delimiter = ",";
  if (tabCount > commaCount && tabCount > semiCount) delimiter = "\t";
  else if (semiCount > commaCount) delimiter = ";";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentVal += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentVal += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentVal.trim());
        currentVal = "";
      } else if (ch === "\r" && next === "\n") {
        currentRow.push(currentVal.trim());
        if (currentRow.some((c) => c !== "")) rows.push(currentRow);
        currentRow = [];
        currentVal = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        currentRow.push(currentVal.trim());
        if (currentRow.some((c) => c !== "")) rows.push(currentRow);
        currentRow = [];
        currentVal = "";
      } else {
        currentVal += ch;
      }
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((c) => c !== "")) rows.push(currentRow);
  }

  return rows;
}

/**
 * Unpacks an .xlsx OpenXML workbook or .csv/.tsv spreadsheet in local browser memory
 */
async function parseSpreadsheetInBrowser(file: File): Promise<ParsedWorksheet[]> {
  const arrayBuffer = await file.arrayBuffer();
  const lowerName = file.name.toLowerCase();

  const headerBytes = new Uint8Array(arrayBuffer.slice(0, 4));
  const isZipHeader =
    headerBytes.length >= 4 &&
    headerBytes[0] === 0x50 &&
    headerBytes[1] === 0x4b &&
    headerBytes[2] === 0x03 &&
    headerBytes[3] === 0x04;

  if (isZipHeader || lowerName.endsWith(".xlsx")) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const parser = new DOMParser();

    // 1. Parse Shared Strings Table (xl/sharedStrings.xml)
    const sharedStrings: string[] = [];
    const sstFile = zip.file("xl/sharedStrings.xml");
    if (sstFile) {
      const sstXml = await sstFile.async("string");
      const sstDoc = parser.parseFromString(sstXml, "application/xml");
      const siNodes = Array.from(sstDoc.getElementsByTagName("si"));
      for (const si of siNodes) {
        const tNodes = Array.from(si.getElementsByTagName("t"));
        const combined = tNodes.map((n) => n.textContent || "").join("");
        sharedStrings.push(combined);
      }
    }

    // 2. Parse Workbook relationships & sheet names
    const relsMap = new Map<string, string>();
    const wbRelsFile = zip.file("xl/_rels/workbook.xml.rels");
    if (wbRelsFile) {
      const relsXml = await wbRelsFile.async("string");
      const relsDoc = parser.parseFromString(relsXml, "application/xml");
      const relNodes = Array.from(relsDoc.getElementsByTagName("Relationship"));
      for (const rel of relNodes) {
        const id = rel.getAttribute("Id");
        const target = rel.getAttribute("Target");
        if (id && target) {
          const cleanTarget = target.replace(/^\/+/, "");
          relsMap.set(
            id,
            cleanTarget.startsWith("xl/") ? cleanTarget : `xl/${cleanTarget}`
          );
        }
      }
    }

    const sheetEntries: { name: string; path: string }[] = [];
    const wbFile = zip.file("xl/workbook.xml");
    if (wbFile) {
      const wbXml = await wbFile.async("string");
      const wbDoc = parser.parseFromString(wbXml, "application/xml");
      const sheetNodes = Array.from(wbDoc.getElementsByTagName("sheet"));
      sheetNodes.forEach((node, idx) => {
        const name = node.getAttribute("name") || `Sheet ${idx + 1}`;
        const rId =
          node.getAttribute("r:id") ||
          node.getAttributeNS(
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
            "id"
          ) ||
          "";
        const resolvedPath =
          relsMap.get(rId) || `xl/worksheets/sheet${idx + 1}.xml`;
        sheetEntries.push({ name, path: resolvedPath });
      });
    }

    if (sheetEntries.length === 0) {
      const fallbackFiles = Object.keys(zip.files)
        .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
        .sort();
      fallbackFiles.forEach((p, idx) => {
        sheetEntries.push({ name: `Sheet ${idx + 1}`, path: p });
      });
    }

    const worksheets: ParsedWorksheet[] = [];

    for (const entry of sheetEntries) {
      const sheetFile = zip.file(entry.path);
      if (!sheetFile) continue;

      const sheetXml = await sheetFile.async("string");
      const sheetDoc = parser.parseFromString(sheetXml, "application/xml");
      const rowNodes = Array.from(sheetDoc.getElementsByTagName("row"));

      const rows: string[][] = [];
      let maxCols = 0;

      for (const rowNode of rowNodes) {
        const cellNodes = Array.from(rowNode.getElementsByTagName("c"));
        const rowValues: string[] = [];

        for (let cIdx = 0; cIdx < cellNodes.length; cIdx++) {
          const cell = cellNodes[cIdx];
          const refAttr = cell.getAttribute("r");
          const colIdx = refAttr ? colLettersToIndex(refAttr) : cIdx;
          const cellType = cell.getAttribute("t") || "";

          let val = "";
          if (cellType === "inlineStr") {
            const tNodes = Array.from(cell.getElementsByTagName("t"));
            val = tNodes.map((n) => n.textContent || "").join("");
          } else {
            const vNode = cell.getElementsByTagName("v")[0];
            const rawV = vNode?.textContent || "";
            if (cellType === "s") {
              const sstIdx = parseInt(rawV, 10);
              val =
                !Number.isNaN(sstIdx) && sharedStrings[sstIdx] !== undefined
                  ? sharedStrings[sstIdx]
                  : rawV;
            } else if (cellType === "b") {
              val = rawV === "1" ? "TRUE" : "FALSE";
            } else {
              val = rawV;
              // Format clean floating point numbers if needed
              if (val && /^-?\d+\.\d{5,}$/.test(val)) {
                const num = parseFloat(val);
                if (!Number.isNaN(num)) {
                  val = Number(num.toFixed(4)).toString();
                }
              }
            }
          }

          while (rowValues.length <= colIdx) {
            rowValues.push("");
          }
          rowValues[colIdx] = val.trim();
        }

        if (rowValues.some((v) => v !== "")) {
          maxCols = Math.max(maxCols, rowValues.length);
          rows.push(rowValues);
        }
      }

      // Normalize all rows to maxCols
      const normalizedRows = rows.map((r) => {
        const copy = [...r];
        while (copy.length < maxCols) copy.push("");
        return copy;
      });

      if (normalizedRows.length > 0 && maxCols > 0) {
        worksheets.push({
          name: entry.name,
          rows: normalizedRows,
          colCount: maxCols,
        });
      }
    }

    if (worksheets.length === 0) {
      throw new Error("No non-empty worksheet cells were found in this .xlsx workbook.");
    }

    return worksheets;
  }

  // Fallback: Parse as CSV / TSV / delimited text
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const text = decoder.decode(arrayBuffer);
  const rows = parseDelimitedText(text);
  const maxCols = rows.reduce((acc, r) => Math.max(acc, r.length), 0);
  if (rows.length === 0 || maxCols === 0) {
    throw new Error("The uploaded spreadsheet appears to be empty.");
  }

  const normalizedRows = rows.map((r) => {
    const copy = [...r];
    while (copy.length < maxCols) copy.push("");
    return copy;
  });

  return [
    {
      name: file.name.replace(/\.[^/.]+$/, "") || "Sheet 1",
      rows: normalizedRows,
      colCount: maxCols,
    },
  ];
}

export default function ExcelToPdfView({ onSuccess, initialFile }: ExcelToPdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ParsedWorksheet[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState<number>(0);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Layout & Table Options
  const [pageSize, setPageSize] = useState<PageSizePreset>("A4");
  const [orientation, setOrientation] = useState<OrientationPreset>("LANDSCAPE");
  const [sheetScope, setSheetScope] = useState<SheetScope>("ALL_SHEETS");
  const [fontScale, setFontScale] = useState<FontScalePreset>("MEDIUM");
  const [repeatHeader, setRepeatHeader] = useState<boolean>(true);
  const [showGridlines, setShowGridlines] = useState<boolean>(true);
  const [zebraStripes, setZebraStripes] = useState<boolean>(true);

  const handleLoadExcelFile = useCallback(
    async (selected: File) => {
      const lower = selected.name.toLowerCase();
      if (
        !lower.endsWith(".xlsx") &&
        !lower.endsWith(".csv") &&
        !lower.endsWith(".tsv") &&
        !lower.endsWith(".txt")
      ) {
        showToast("Please select a valid Excel (.xlsx), CSV (.csv), or TSV (.tsv) file.", "error");
        return;
      }

      setFile(selected);
      setIsParsing(true);
      setProgressMsg("UNPACKING_SPREADSHEET_WORKBOOK...");

      try {
        await yieldFrame();
        const parsed = await parseSpreadsheetInBrowser(selected);
        setSheets(parsed);
        setActiveSheetIdx(0);
      } catch (err: any) {
        logger.error("Excel parsing failed:", err);
        showToast(`Could not parse spreadsheet: ${err?.message || err}`, "error");
        setFile(null);
        setSheets([]);
      } finally {
        setIsParsing(false);
        setProgressMsg("");
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (initialFile) {
      handleLoadExcelFile(initialFile);
    }
  }, [initialFile, handleLoadExcelFile]);

  useEffect(() => {
    return registerDropHandler((droppedFiles) => {
      if (droppedFiles.length > 0) {
        handleLoadExcelFile(droppedFiles[0]);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, handleLoadExcelFile]);

  const stats = useMemo(() => {
    let totalRows = 0;
    let maxCols = 0;
    let nonEmptyCells = 0;
    for (const s of sheets) {
      totalRows += s.rows.length;
      maxCols = Math.max(maxCols, s.colCount);
      for (const r of s.rows) {
        for (const c of r) {
          if (c.trim() !== "") nonEmptyCells++;
        }
      }
    }
    return {
      sheetsCount: sheets.length,
      totalRows,
      maxCols,
      nonEmptyCells,
    };
  }, [sheets]);

  const activeSheet = sheets[activeSheetIdx] || sheets[0] || null;

  const handleReset = () => {
    setFile(null);
    setSheets([]);
    setActiveSheetIdx(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConvertToPdf = async () => {
    if (!file || sheets.length === 0) return;

    setIsProcessing(true);
    setProgressMsg("INITIALIZING_PDF_TABLE_ENGINE...");

    try {
      await yieldFrame();
      const pdfDoc = await PDFDocument.create();
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const baseDim = PAGE_DIMENSIONS[pageSize];
      const pageWidth = orientation === "LANDSCAPE" ? baseDim.height : baseDim.width;
      const pageHeight = orientation === "LANDSCAPE" ? baseDim.width : baseDim.height;
      const margin = 36;
      const usableWidth = pageWidth - margin * 2;
      const scaleMult = FONT_SCALE_MULTIPLIER[fontScale];

      const targetSheets =
        sheetScope === "ACTIVE_SHEET" && activeSheet ? [activeSheet] : sheets;

      for (let sIdx = 0; sIdx < targetSheets.length; sIdx++) {
        const sheet = targetSheets[sIdx];
        setProgressMsg(`TYPESETTING_SHEET_${sIdx + 1}_OF_${targetSheets.length} (${sheet.name})...`);
        await yieldFrame();

        const colCount = Math.max(1, sheet.colCount);
        const fontSize = Math.max(6.5, Math.min(10.5, (colCount > 10 ? 7.5 : 9) * scaleMult));
        const rowHeight = Math.round(fontSize * 2.15);

        // Compute proportional column widths from average/max character length per column
        const colWeights = new Array(colCount).fill(4);
        const sampleLimit = Math.min(sheet.rows.length, 120);
        for (let r = 0; r < sampleLimit; r++) {
          const row = sheet.rows[r];
          for (let c = 0; c < colCount; c++) {
            const len = (row[c] || "").length;
            colWeights[c] = Math.max(colWeights[c], Math.min(36, len + 2));
          }
        }
        const totalWeight = colWeights.reduce((a, b) => a + b, 0) || colCount;
        const colWidths = colWeights.map((w) => (w / totalWeight) * usableWidth);

        let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        let cursorY = pageHeight - margin;

        const drawSheetBanner = (isContinuation: boolean) => {
          const titleText = normalizeTextForPdf(
            isContinuation ? `${sheet.name} (Continued)` : sheet.name
          );
          currentPage.drawText(titleText || `Sheet ${sIdx + 1}`, {
            x: margin,
            y: cursorY - 12,
            size: 11 * scaleMult,
            font: fontBold,
            color: rgb(0.1, 0.1, 0.12),
          });
          cursorY -= 22;
        };

        const drawRow = (rowCells: string[], isHeader: boolean, rowIdx: number) => {
          const yBottom = cursorY - rowHeight;

          // Fill background
          if (isHeader) {
            currentPage.drawRectangle({
              x: margin,
              y: yBottom,
              width: usableWidth,
              height: rowHeight,
              color: rgb(0.14, 0.16, 0.2),
            });
          } else if (zebraStripes && rowIdx % 2 === 1) {
            currentPage.drawRectangle({
              x: margin,
              y: yBottom,
              width: usableWidth,
              height: rowHeight,
              color: rgb(0.96, 0.96, 0.97),
            });
          }

          let xCursor = margin;
          for (let c = 0; c < colCount; c++) {
            const cw = colWidths[c];
            if (showGridlines) {
              currentPage.drawRectangle({
                x: xCursor,
                y: yBottom,
                width: cw,
                height: rowHeight,
                borderColor: isHeader ? rgb(0.28, 0.3, 0.36) : rgb(0.82, 0.83, 0.86),
                borderWidth: 0.5,
              });
            }

            const rawCell = normalizeTextForPdf(rowCells[c] || "");
            if (rawCell) {
              const activeFont = isHeader ? fontBold : fontRegular;
              const maxTextW = Math.max(8, cw - 8);
              let truncated = rawCell;
              while (
                truncated.length > 1 &&
                activeFont.widthOfTextAtSize(truncated, fontSize) > maxTextW
              ) {
                truncated = truncated.slice(0, -1);
              }
              if (truncated.length < rawCell.length && truncated.length > 2) {
                truncated = `${truncated.slice(0, -1)}.`;
              }

              currentPage.drawText(truncated, {
                x: xCursor + 4,
                y: yBottom + (rowHeight - fontSize) / 2 + 1,
                size: fontSize,
                font: activeFont,
                color: isHeader ? rgb(1, 1, 1) : rgb(0.1, 0.1, 0.12),
              });
            }

            xCursor += cw;
          }

          cursorY -= rowHeight;
        };

        drawSheetBanner(false);

        const headerRow = sheet.rows[0] || [];
        if (sheet.rows.length > 0) {
          drawRow(headerRow, true, 0);
        }

        for (let r = 1; r < sheet.rows.length; r++) {
          if (cursorY - rowHeight < margin + 16) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            cursorY = pageHeight - margin;
            drawSheetBanner(true);
            if (repeatHeader && sheet.rows.length > 0) {
              drawRow(headerRow, true, 0);
            }
          }
          drawRow(sheet.rows[r], false, r);
        }
      }

      setProgressMsg("SAVING_PDF_DOCUMENT...");
      const pdfBytes = await pdfDoc.save({
        useObjectStreams: true,
        objectsPerTick: Infinity,
      });

      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));

      await saveFile("excel_to_pdf", {
        blob: pdfBlob,
        filename: `${cleanName}_monotranscoder`,
        size: pdfBlob.size,
        format: "application/pdf",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast("Spreadsheet converted to PDF successfully.", "success");
      onSuccess();
    } catch (err: any) {
      logger.error("Excel to PDF error:", err);
      showToast(`Failed to convert spreadsheet to PDF: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="excel-to-pdf-view"
      aria-labelledby="excel-to-pdf-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="excel-to-pdf-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            EXCEL TO PDF CONVERTER // EXCEL_TO_PDF.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Convert Excel (.xlsx) workbooks and CSV/TSV spreadsheets into clean, paginated PDF tables in local RAM.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="excel-to-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload Excel or CSV file to convert to PDF"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              handleLoadExcelFile(e.dataTransfer.files[0]);
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
              if (f) handleLoadExcelFile(f);
            }}
            accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            aria-label="Select Excel or CSV File"
          />
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="excel_to_pdf" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE EXCEL WORKBOOK (.XLSX, .CSV)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Unpacks multi-sheet OpenXML workbooks, shared string tables, and CSV grids with zero server uploads.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
          >
            SELECT_EXCEL_FILE
          </button>
        </div>
      ) : isParsing || isProcessing ? (
        <ToolSkeletonLoader
          variant="excel_to_pdf"
          fileName={file.name}
          fileSize={formatBytes(file.size)}
          targetInfo={`${pageSize} ${orientation}`}
          statusMessage={
            progressMsg ||
            (isParsing ? "PARSING_XLSX_WORKBOOK..." : "COMPILING_PDF_TABLES...")
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Interactive Worksheet Grid Preview */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <span className="font-mono font-bold text-xs uppercase text-zinc-300 flex items-center gap-1.5">
                  <Grid className="w-4 h-4 text-emerald-400" /> WORKSHEET_GRID_PREVIEW
                </span>
                <span className="text-[11px] font-mono text-emerald-400 font-bold tabular-nums">
                  {stats.sheetsCount} SHEET(S) · {stats.totalRows} ROWS · {stats.maxCols} COLS
                </span>
              </div>

              {/* Sheet Tabs */}
              {sheets.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {sheets.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveSheetIdx(idx)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase border cursor-pointer transition-all ${
                        activeSheetIdx === idx
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white"
                      }`}
                    >
                      {s.name} ({s.rows.length})
                    </button>
                  ))}
                </div>
              )}

              {/* Spreadsheet Table Preview */}
              {activeSheet && (
                <div className="bg-black border border-zinc-800 rounded-lg overflow-auto max-h-[400px]">
                  <table className="w-full text-[11px] font-mono text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-900 text-white border-b border-zinc-700">
                      <tr>
                        <th className="p-2 border-r border-zinc-800 text-zinc-500 w-10 text-center">#</th>
                        {(activeSheet.rows[0] || []).map((cell, cIdx) => (
                          <th key={cIdx} className="p-2 border-r border-zinc-800 font-bold whitespace-nowrap">
                            {cell || `COL_${cIdx + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeSheet.rows.slice(1, 60).map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="border-b border-zinc-900 hover:bg-zinc-900/50 text-zinc-300"
                        >
                          <td className="p-1.5 border-r border-zinc-800 text-zinc-500 text-center">
                            {rIdx + 2}
                          </td>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="p-1.5 border-r border-zinc-900 truncate max-w-[180px]"
                              title={cell}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {activeSheet.rows.length > 60 && (
                    <div className="p-2 text-center text-[11px] font-mono text-zinc-500 border-t border-zinc-800">
                      + {activeSheet.rows.length - 60} more rows in "{activeSheet.name}" ready for PDF export
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono tabular-nums">
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">WORKSHEETS</span>
                <strong className="text-emerald-400 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> {stats.sheetsCount}
                </strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">TOTAL_ROWS</span>
                <strong className="text-sky-400">{stats.totalRows}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">MAX_COLUMNS</span>
                <strong className="text-amber-400">{stats.maxCols}</strong>
              </div>
              <div className="bg-black border border-zinc-800 p-2.5 rounded">
                <span className="text-zinc-500 block text-[10px]">POPULATED_CELLS</span>
                <strong className="text-violet-400">{stats.nonEmptyCells}</strong>
              </div>
            </div>
          </div>

          {/* Right: PDF Table Layout Controls */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <FolderOpen className="w-4 h-4 text-emerald-400" /> TABLE_LAYOUT.CFG
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

              {/* Orientation & Page Size */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                    ORIENTATION:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["LANDSCAPE", "PORTRAIT"] as OrientationPreset[]).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setOrientation(o)}
                        className={`py-2 px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                          orientation === o
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {o === "LANDSCAPE" ? "LAND" : "PORT"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                    PAGE SIZE:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["A4", "LETTER"] as PageSizePreset[]).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setPageSize(sz)}
                        className={`py-2 px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                          pageSize === sz
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sheet Scope */}
              {sheets.length > 1 && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                    WORKSHEET EXPORT SCOPE:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: "ALL_SHEETS", label: `ALL SHEETS (${sheets.length})` },
                        { key: "ACTIVE_SHEET", label: "CURRENT SHEET ONLY" },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setSheetScope(item.key)}
                        className={`py-2 px-2.5 rounded-lg font-mono text-[11px] font-bold uppercase border-2 transition-all cursor-pointer ${
                          sheetScope === item.key
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Font Scale */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-zinc-300">
                  CELL FONT SCALE:
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

              {/* Table Formatting Checkboxes */}
              <div className="bg-black border border-zinc-800 rounded-lg p-3 space-y-2 text-xs font-mono">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-zinc-300">REPEAT HEADER ROW ON EACH PAGE</span>
                  <input
                    type="checkbox"
                    checked={repeatHeader}
                    onChange={(e) => setRepeatHeader(e.target.checked)}
                    className="accent-white w-4 h-4 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-zinc-300">SHOW CELL GRIDLINES</span>
                  <input
                    type="checkbox"
                    checked={showGridlines}
                    onChange={(e) => setShowGridlines(e.target.checked)}
                    className="accent-white w-4 h-4 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-zinc-300">ALTERNATING ZEBRA ROW STRIPES</span>
                  <input
                    type="checkbox"
                    checked={zebraStripes}
                    onChange={(e) => setZebraStripes(e.target.checked)}
                    className="accent-white w-4 h-4 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConvertToPdf}
              disabled={isProcessing}
              aria-label="Convert Excel to PDF Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>CONVERT EXCEL TO PDF NOW</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
