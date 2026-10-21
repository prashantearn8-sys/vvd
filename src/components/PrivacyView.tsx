/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { ShieldCheck, Search, ArrowLeft } from "lucide-react";

interface PrivacyViewProps {
  onBack: () => void;
}

const PRIVACY_SECTIONS = [
  {
    title: "1. 100% LOCAL CLIENT-SIDE COMPUTATION",
    content:
      "All file operations, including image compression, PDF rasterization, format conversion, and PDF merging, occur strictly inside your local browser sandbox using WebAssembly, HTML5 Canvas APIs, and client-side libraries. Your files are never uploaded to any external server.",
  },
  {
    title: "2. NO ANALYTICS OR TRACKING SCRIPTS",
    content:
      "Your files never leave your device, and MONO-TRANSCODER does not run analytics, advertising pixels, fingerprinting scripts, or third-party telemetry.",
  },
  {
    title: "3. EPHEMERAL IN-MEMORY BUFFER",
    content:
      "Processed outputs are held temporarily in a local JavaScript in-memory Map solely so you can review and download them. Nothing is written to disk or IndexedDB, and closing or reloading your browser tab purges all active memory buffers immediately.",
  },
  {
    title: "4. SAME-ORIGIN BUNDLED ASSETS & CSP",
    content:
      "All processing scripts and workers (including PDF.js) are served from same-origin local assets. A strict Content Security Policy (connect-src 'self' blob:) enforces that the browser blocks outbound data requests.",
  },
  {
    title: "5. CONTACT & INQUIRIES",
    content:
      "If you have inquiries, bug reports, or feature requests regarding MONO-TRANSCODER, contact us at burnster1826@gmail.com.",
  },
];

export default function PrivacyView({ onBack }: PrivacyViewProps) {
  const [search, setSearch] = useState("");

  const filteredSections = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return PRIVACY_SECTIONS;
    return PRIVACY_SECTIONS.filter(
      (s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <section className="max-w-4xl mx-auto space-y-6 animate-fade-in" id="privacy-view" aria-labelledby="privacy-heading">
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white mb-2 cursor-pointer"
            aria-label="Back to Tools"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>RETURN_TO_DECK</span>
          </button>
          <h1 id="privacy-heading" className="text-xl font-bold uppercase tracking-tight text-white font-sans flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-white" />
            <span>PRIVACY POLICY // ZERO-TELEMETRY MANDATE</span>
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Absolute 100% offline data privacy declaration and runtime guarantees.
          </p>
        </div>
      </div>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH PRIVACY DIRECTIVES..."
          className="w-full p-3 pl-10 bg-black border-2 border-zinc-700 text-white rounded-xl text-xs font-mono placeholder:text-zinc-500 focus:outline-none focus:border-white"
          aria-label="Search Privacy Directives"
        />
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
      </div>

      <div className="space-y-4">
        {filteredSections.map((sec, idx) => (
          <div key={idx} className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-2">
            <h2 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
              {sec.title}
            </h2>
            <p className="text-xs text-zinc-300 font-mono leading-relaxed">{sec.content}</p>
          </div>
        ))}

        {filteredSections.length === 0 && (
          <div className="p-8 text-center border-2 border-dashed border-zinc-700 rounded-xl font-mono text-xs text-zinc-400">
            NO PRIVACY DIRECTIVES MATCH: "{search.toUpperCase()}"
          </div>
        )}
      </div>
    </section>
  );
}
