/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RetroView =
  | "home"
  | "compress_img"
  | "compress_pdf"
  | "convert_img"
  | "image_to_pdf"
  | "merge_pdf"
  | "pdf_to_images"
  | "remove_pdf_pages"
  | "organize_pdf"
  | "word_to_pdf"
  | "word_to_jpg"
  | "pdf_to_word"
  | "excel_to_pdf"
  | "ppt_to_pdf"
  | "pdf_to_ppt"
  | "pdf_to_excel"
  | "watermark_pdf"
  | "lock_pdf"
  | "unlock_pdf"
  | "sign_pdf"
  | "passport_photo"
  | "coffee"
  | "privacy"
  | "terms"
  | "not_found"
  | "compress_img_download"
  | "compress_pdf_download"
  | "convert_img_download"
  | "image_to_pdf_download"
  | "merge_pdf_download"
  | "pdf_to_images_download"
  | "remove_pdf_pages_download"
  | "organize_pdf_download"
  | "word_to_pdf_download"
  | "word_to_jpg_download"
  | "pdf_to_word_download"
  | "excel_to_pdf_download"
  | "ppt_to_pdf_download"
  | "pdf_to_ppt_download"
  | "pdf_to_excel_download"
  | "watermark_pdf_download"
  | "lock_pdf_download"
  | "unlock_pdf_download"
  | "sign_pdf_download"
  | "passport_photo_download";

export type ImageFormat = "image/png" | "image/jpeg" | "image/webp" | "image/avif";

export interface ImageProcessResult {
  url?: string;
  size: number;
  width: number;
  height: number;
  format: ImageFormat;
  blob: Blob;
}
