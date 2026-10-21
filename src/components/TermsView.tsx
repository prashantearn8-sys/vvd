/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { FileText, Search, ArrowLeft } from "lucide-react";

interface TermsViewProps {
  onBack: () => void;
}

const TERMS_SECTIONS = [
  {
    title: "1. ACCEPTANCE OF LOCAL RUNTIME TERMS",
    content:
      "By utilizing MONO-TRANSCODER, you acknowledge that all transcribing and optimization routines execute strictly on your device's browser thread. You are granted permission to process, transcode, and compress files locally for personal or commercial purposes.",
  },
  {
    title: "2. NO SERVER INTERMEDIATION & WARRANTIES",
    content:
      "This application is provided 'as is' without warranty of any kind, either express or implied. Because processing happens purely on your device hardware, system performance depends on your local device CPU and available RAM.",
  },
  {
    title: "3. COMPLIANCE & CONTENT OWNERSHIP",
    content:
      "You retain full, exclusive ownership of all uploaded and processed files. Because no files are uploaded to our servers, we have no access to, nor custody of, your intellectual property or document contents.",
  },
  {
    title: "4. CONTACT & SUPPORT",
    content:
      "For support queries, feedback, or custom integration assistance, reach out directly to burnster1826@gmail.com.",
  },
];

export default function TermsView({ onBack }: TermsViewProps) {
  const [search, setSearch] = useState("");

  const filteredSections = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return TERMS_SECTIONS;
    return TERMS_SECTIONS.filter(
      (s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <section className="max-w-4xl mx-auto space-y-6 animate-fade-in" id="terms-view" aria-labelledby="terms-heading">
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
          <h1 id="terms-heading" className="text-xl font-bold uppercase tracking-tight text-white font-sans flex items-center gap-2">
            <FileText className="w-5 h-5 text-white" />
            <span>TERMS OF SERVICE // USAGE GUIDELINES</span>
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Operating conditions and software license agreements for MONO-TRANSCODER.
          </p>
        </div>
      </div>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH TERMS DIRECTIVES..."
          className="w-full p-3 pl-10 bg-black border-2 border-zinc-700 text-white rounded-xl text-xs font-mono placeholder:text-zinc-500 focus:outline-none focus:border-white"
          aria-label="Search Terms Directives"
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
            NO TERMS DIRECTIVES MATCH: "{search.toUpperCase()}"
          </div>
        )}
      </div>
    </section>
  );
}
