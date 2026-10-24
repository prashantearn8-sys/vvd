/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "./logger";

export interface StoredFileData {
  blob: Blob;
  filename: string;
  size: number;
  format: string;
  originalName?: string;
  originalSize?: number;
  targetKB?: number;
  minKB?: number;
  hitTarget?: boolean;
  statusNote?: string;
}

/**
 * 100% In-Memory Ephemeral Storage Manager.
 * Zero files are ever written to disk or IndexedDB.
 * Ephemeral session buffers exist purely in browser RAM and are purged upon unmount or download.
 */
const inMemoryStore = new Map<string, StoredFileData>();

export async function saveFile(key: string, data: StoredFileData): Promise<void> {
  try {
    inMemoryStore.set(key, data);
  } catch (err) {
    logger.error("Failed to store in-memory file:", err);
    throw err;
  }
}

export function getFileSync(key: string): StoredFileData | null {
  return inMemoryStore.get(key) || null;
}

export async function getFile(key: string): Promise<StoredFileData | null> {
  return inMemoryStore.get(key) || null;
}

export async function clearFile(key: string): Promise<void> {
  inMemoryStore.delete(key);
}

export function purgeAllSecureStorage(): void {
  inMemoryStore.clear();
}

// Ensure in-memory store is purged on tab close or page navigation
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    purgeAllSecureStorage();
  });
  window.addEventListener("pagehide", () => {
    purgeAllSecureStorage();
  });
}
