/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const trackedUrls = new Set<string>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    cleanupAllTrackedURLs();
  });
  window.addEventListener("pagehide", () => {
    cleanupAllTrackedURLs();
  });
}

/**
 * Creates an Object URL and tracks it for future cleanup
 */
export function createTrackedObjectURL(blobOrFile: Blob | File): string {
  const url = URL.createObjectURL(blobOrFile);
  trackedUrls.add(url);
  return url;
}

/**
 * Revokes a specific Object URL and untracks it
 */
export function revokeTrackedObjectURL(url: string | null | undefined): void {
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("Failed to revoke URL:", e);
    }
    trackedUrls.delete(url);
  }
}

/**
 * Revokes all currently active tracked Object URLs
 */
export function cleanupAllTrackedURLs(): void {
  trackedUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("Failed to revoke URL:", e);
    }
  });
  trackedUrls.clear();
}
