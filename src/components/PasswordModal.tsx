/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from "react";
import { Lock, X } from "lucide-react";

interface PasswordModalProps {
  reason: "required" | "wrong";
  onSubmit: (pwd: string) => void;
  onCancel: () => void;
}

export default function PasswordModal({ reason, onSubmit, onCancel }: PasswordModalProps) {
  // Use useRef instead of persistent component state for maximum password security
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const enteredPassword = passwordInputRef.current?.value || "";
    if (passwordInputRef.current) {
      passwordInputRef.current.value = ""; // Immediate in-memory sanitization
    }
    if (enteredPassword) {
      onSubmit(enteredPassword);
    }
  };

  const handleCancel = () => {
    if (passwordInputRef.current) {
      passwordInputRef.current.value = ""; // Clear immediately on abort
    }
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 font-mono animate-fade-in">
      <div className="bg-zinc-950 border-2 border-white rounded-xl max-w-md w-full p-6 shadow-[6px_6px_0px_0px_#ffffff] space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm uppercase">
            <Lock className="w-4 h-4 text-white" />
            <span>ENCRYPTED DOCUMENT DETECTED</span>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="text-zinc-400 hover:text-white cursor-pointer"
            aria-label="Cancel password entry"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-300">
          {reason === "wrong"
            ? "⚠️ Incorrect password provided. Please re-enter the decryption password for this PDF."
            : "This PDF document is encrypted. Please enter the decryption key to open and process pages."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">
              DOCUMENT_PASSWORD:
            </label>
            <input
              ref={passwordInputRef}
              type="password"
              autoComplete="off"
              spellCheck="false"
              placeholder="Enter password..."
              className="w-full p-2.5 bg-black border-2 border-zinc-700 text-white rounded text-xs font-mono focus:border-white focus:outline-none"
              aria-label="Document Password"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2.5 bg-white text-black font-bold text-xs uppercase hover:bg-zinc-200 border-2 border-white rounded cursor-pointer"
              aria-label="Submit Password"
            >
              UNLOCK DOCUMENT
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="py-2.5 px-4 bg-zinc-900 text-zinc-300 font-bold text-xs uppercase hover:bg-zinc-800 border border-zinc-700 rounded cursor-pointer"
              aria-label="Cancel"
            >
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
