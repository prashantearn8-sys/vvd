/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// List of dangerous executable file extensions to disallow in downloaded/transcoded output
const DANGEROUS_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "sh", "vbs", "js", "scr", "jar",
  "msi", "reg", "ps1", "com", "pif", "hta", "cpl", "dll"
]);

// Reserved system device names (Windows file namespace crashes if accessed)
const WINDOWS_RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"
]);

/**
 * Maximum safe file size for 100% in-browser processing (500 MB)
 * Prevents browser process memory exhaustion (OOM crashes)
 */
export const MAX_SAFE_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

/**
 * Validates whether a file size is within safe client-side processing boundaries
 */
export function isSafeFileSize(size: number): boolean {
  return typeof size === "number" && size > 0 && size <= MAX_SAFE_FILE_SIZE;
}

/**
 * Sanitizes a filename to prevent path traversal, command injection, or filesystem corruption.
 * - Strips directory traversal sequences (../, ..\, /)
 * - Removes null bytes and non-printable control characters
 * - Neutralizes Windows reserved device names
 * - Disallows dangerous executable extensions
 * - Enforces safe character set capped at 180 chars
 */
export function sanitizeFilename(name: string): string {
  if (!name || typeof name !== "string") {
    return "transcoded_file";
  }

  // 1. Strip null bytes and non-printable ASCII control characters (\x00-\x1F, \x7F)
  let clean = name.replace(/[\x00-\x1f\x7f]/g, "").trim();

  // 2. Remove directory traversal sequences and path delimiters
  clean = clean.replace(/\\|\//g, "_").replace(/\.{2,}/g, ".");

  // 3. Remove leading/trailing dots and spaces
  clean = clean.replace(/^\.+|\.+$/g, "").trim();

  // 4. Separate name and extension
  const lastDot = clean.lastIndexOf(".");
  let baseName = lastDot > 0 ? clean.substring(0, lastDot) : clean;
  let ext = lastDot > 0 ? clean.substring(lastDot + 1).toLowerCase() : "";

  // 5. Check for Windows reserved names (e.g. CON, NUL, PRN)
  if (WINDOWS_RESERVED_NAMES.has(baseName.toLowerCase())) {
    baseName = `file_${baseName}`;
  }

  // 6. Neutralize dangerous executable extensions
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    ext = "bin";
  }

  // 7. Enforce safe character whitelist: alphanumeric, dash, underscore, space, dot
  baseName = baseName.replace(/[^\w\s.-]/g, "_").replace(/\s+/g, "_");

  // 8. Enforce reasonable length constraint
  baseName = baseName.substring(0, 150) || "transcoded_file";

  return ext ? `${baseName}.${ext}` : baseName;
}

/**
 * Sanitizes user input text (e.g. supporter names, notes, custom inputs)
 * to prevent CRLF injection, control character abuse, and HTML injection.
 */
export function sanitizeTextInput(input: string, maxLength = 200): string {
  if (!input || typeof input !== "string") {
    return "";
  }
  return input
    .replace(/[\x00-\x1f\x7f\r\n]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .substring(0, maxLength);
}
