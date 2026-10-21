/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const isDev = Boolean(
  typeof process !== "undefined" && process.env?.NODE_ENV === "development"
    ? true
    : (import.meta as any).env?.DEV ?? false
);

/**
 * Safe logger that ensures zero console pollution, telemetry, or leaked secrets in production.
 */
export const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    if (isDev) {
      console.error(...args);
    }
  },
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args);
    }
  },
};
