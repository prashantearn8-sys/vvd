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
    title: "1. ACCEPTANCE OF TERMS & SCOPE OF SERVICE",
    content:
      "By accessing or using MONO-TRANSCODER, you agree to be bound by these Terms of Service. MONO-TRANSCODER provides 20 browser-based utilities for PDF manipulation, visual signature placement, Office document conversion (Word, Excel, PowerPoint), image compression/transcoding, and biometric passport photo preparation for personal or commercial use.",
  },
  {
    title: "2. LOCAL EXECUTION & HARDWARE RESPONSIBILITY",
    content:
      "All document transcoding, compression, rasterization, and encryption routines execute directly on your device's browser thread and local RAM. Because no server-side file processing occurs, processing speed and maximum file size depend on your local device CPU and available memory.",
  },
  {
    title: "3. OPTIONAL GOOGLE ACCOUNT & CROSS-DEVICE SIGNATURE SYNC",
    content:
      "You may use all tools without signing in, or optionally sign in with your Google Account to save and synchronize your digital signature templates across computers and mobile devices. You are responsible for maintaining the security of your Google Account and for all signatures saved or applied under your account.",
  },
  {
    title: "4. ELECTRONIC SIGNATURES & PASSWORD-PROTECTED PDFS",
    content:
      "The Sign PDF, Lock PDF, and Unlock PDF modules are provided as technical utilities. You are solely responsible for verifying the legal validity of electronic signatures for your specific jurisdiction or contract, ensuring you have lawful authorization to unlock or modify protected documents, and safeguarding any passwords applied with Lock PDF (as locally encrypted files cannot be recovered by us if you forget your password).",
  },
  {
    title: "5. INTELLECTUAL PROPERTY & CONTENT OWNERSHIP",
    content:
      "You retain full, exclusive ownership and copyright over all files, documents, images, and signatures you process or create using MONO-TRANSCODER. Because your source and output files remain in your local browser memory, we never access, claim, or retain custody of your documents.",
  },
  {
    title: "6. DISCLAIMER OF WARRANTIES & LIMITATION OF LIABILITY",
    content:
      "MONO-TRANSCODER is provided 'AS IS' and 'AS AVAILABLE' without warranty of any kind, express or implied, including but not limited to fitness for a particular purpose or non-infringement. Always inspect and verify your exported files (filename_monotranscoder) prior to official submission, distribution, or archival.",
  },
  {
    title: "7. CONTACT & SUPPORT",
    content:
      "For support queries, bug reports, feedback, or legal inquiries regarding MONO-TRANSCODER, reach out directly to burnster1826@gmail.com.",
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
