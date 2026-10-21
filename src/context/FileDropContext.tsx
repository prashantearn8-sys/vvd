/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { RetroView } from "../types";
import { useToast } from "./ToastContext";

export type DropTargetType = "active_view" | "compress_img" | "compress_pdf" | "convert_img" | "image_to_pdf" | "merge_pdf" | "pdf_to_images";

interface FileDropContextType {
  isGlobalDragging: boolean;
  draggedFileCount: number;
  draggedFileTypes: string[];
  registerDropHandler: (handler: (files: File[]) => boolean | void) => () => void;
  handleGlobalDroppedFiles: (files: File[], targetView?: RetroView) => void;
  pasteFromClipboard: () => Promise<void>;
}

const FileDropContext = createContext<FileDropContextType | undefined>(undefined);

interface FileDropProviderProps {
  children: React.ReactNode;
  currentView: RetroView;
  onRouteWithFiles: (view: RetroView, files: File[]) => void;
}

/**
 * Normalizes a pasted File object so generic clipboard screenshots ("image.png")
 * receive a unique, descriptive filename.
 */
function normalizeClipboardFile(file: File, index: number): File {
  const isGenericName = !file.name || file.name === "image.png" || file.name === "blob";
  if (!isGenericName) return file;

  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
  const suffix = index > 0 ? `_${index + 1}` : "";
  return new File([file], `clipboard_${stamp}${suffix}.${ext}`, {
    type: file.type || "image/png",
    lastModified: Date.now(),
  });
}

export function FileDropProvider({ children, currentView, onRouteWithFiles }: FileDropProviderProps) {
  const { showToast } = useToast();
  const [isGlobalDragging, setIsGlobalDragging] = useState<boolean>(false);
  const [draggedFileCount, setDraggedFileCount] = useState<number>(0);
  const [draggedFileTypes, setDraggedFileTypes] = useState<string[]>([]);
  const dragCounterRef = useRef<number>(0);
  const dropHandlerRef = useRef<((files: File[]) => boolean | void) | null>(null);

  const registerDropHandler = useCallback((handler: (files: File[]) => boolean | void) => {
    dropHandlerRef.current = handler;
    return () => {
      if (dropHandlerRef.current === handler) {
        dropHandlerRef.current = null;
      }
    };
  }, []);

  const handleGlobalDroppedFiles = useCallback((files: File[], explicitTarget?: RetroView) => {
    if (!files || files.length === 0) return;

    // 1. If an explicit target was chosen (e.g. from an overlay drop card)
    if (explicitTarget) {
      onRouteWithFiles(explicitTarget, files);
      return;
    }

    // 2. If the active view has registered a direct handler, let it try to handle the files
    if (dropHandlerRef.current) {
      const handled = dropHandlerRef.current(files);
      if (handled !== false) {
        return;
      }
    }

    // 3. Otherwise, smart-route according to file MIME type & count
    const firstFile = files[0];
    const isFirstPdf = firstFile.type === "application/pdf" || firstFile.name.toLowerCase().endsWith(".pdf");
    const isAllPdf = files.every((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const isFirstImg = firstFile.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|bmp|gif|avif|svg)$/i.test(firstFile.name);
    const isAllImg = files.every((f) => f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|bmp|gif|avif|svg)$/i.test(f.name));

    if (isAllPdf) {
      if (files.length > 1) {
        onRouteWithFiles("merge_pdf", files);
      } else {
        if (currentView === "compress_pdf" || currentView === "pdf_to_images" || currentView === "merge_pdf") {
          onRouteWithFiles(currentView, files);
        } else {
          onRouteWithFiles("compress_pdf", files);
        }
      }
    } else if (isAllImg) {
      if (files.length > 1) {
        onRouteWithFiles("image_to_pdf", files);
      } else {
        if (currentView === "compress_img" || currentView === "convert_img" || currentView === "image_to_pdf") {
          onRouteWithFiles(currentView, files);
        } else {
          onRouteWithFiles("compress_img", files);
        }
      }
    } else if (isFirstPdf) {
      onRouteWithFiles("compress_pdf", files);
    } else if (isFirstImg) {
      onRouteWithFiles("compress_img", files);
    }
  }, [currentView, onRouteWithFiles]);

  // Programmatic clipboard read (triggered by PASTE_IMAGE button click)
  const pasteFromClipboard = useCallback(async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
      showToast("Use Ctrl+V (or Cmd+V) on your keyboard to paste an image.", "info");
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      const extractedFiles: File[] = [];

      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = (imageType.split("/")[1] || "png").replace("jpeg", "jpg");
          const rawFile = new File([blob], `image.${ext}`, { type: imageType });
          extractedFiles.push(normalizeClipboardFile(rawFile, extractedFiles.length));
        }
      }

      if (extractedFiles.length > 0) {
        handleGlobalDroppedFiles(extractedFiles);
      } else {
        showToast("No image found in clipboard. Copy an image or screenshot first.", "error");
      }
    } catch {
      showToast("Press Ctrl+V (or Cmd+V) directly to paste your clipboard image.", "info");
    }
  }, [handleGlobalDroppedFiles, showToast]);

  // Global keyboard paste listener (Ctrl+V / Cmd+V anywhere in the app)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const pastedFiles: File[] = [];

      if (clipboardData.items && clipboardData.items.length > 0) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i];
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
              pastedFiles.push(normalizeClipboardFile(file, pastedFiles.length));
            }
          }
        }
      } else if (clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          pastedFiles.push(normalizeClipboardFile(clipboardData.files[i], i));
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        handleGlobalDroppedFiles(pastedFiles);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleGlobalDroppedFiles]);

  // Global drag-and-drop listeners on active tool views
  useEffect(() => {
    const isProcessingView = [
      "compress_img",
      "compress_pdf",
      "convert_img",
      "image_to_pdf",
      "merge_pdf",
      "pdf_to_images",
      "remove_pdf_pages",
      "organize_pdf",
      "word_to_pdf",
      "word_to_jpg",
      "pdf_to_word",
      "excel_to_pdf",
      "ppt_to_pdf",
      "pdf_to_ppt",
      "pdf_to_excel",
      "watermark_pdf",
      "lock_pdf",
      "unlock_pdf",
      "sign_pdf",
      "passport_photo",
    ].includes(currentView);

    if (!isProcessingView) {
      setIsGlobalDragging(false);
      dragCounterRef.current = 0;
      return;
    }

    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
        dragCounterRef.current += 1;
        setIsGlobalDragging(true);

        const types: string[] = [];
        if (e.dataTransfer.items) {
          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            types.push(e.dataTransfer.items[i].type);
          }
        }
        setDraggedFileCount(e.dataTransfer.items?.length || 1);
        setDraggedFileTypes(types);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
        dragCounterRef.current -= 1;
        if (dragCounterRef.current <= 0) {
          dragCounterRef.current = 0;
          setIsGlobalDragging(false);
          setDraggedFileCount(0);
          setDraggedFileTypes([]);
        }
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsGlobalDragging(false);
      setDraggedFileCount(0);
      setDraggedFileTypes([]);

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const fileList = Array.from(e.dataTransfer.files);
        handleGlobalDroppedFiles(fileList);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragCounterRef.current = 0;
        setIsGlobalDragging(false);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentView, handleGlobalDroppedFiles]);

  return (
    <FileDropContext.Provider
      value={{
        isGlobalDragging,
        draggedFileCount,
        draggedFileTypes,
        registerDropHandler,
        handleGlobalDroppedFiles,
        pasteFromClipboard,
      }}
    >
      {children}
    </FileDropContext.Provider>
  );
}

export function useFileDrop() {
  const context = useContext(FileDropContext);
  if (!context) {
    throw new Error("useFileDrop must be used within a FileDropProvider");
  }
  return context;
}
