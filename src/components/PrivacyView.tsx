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
    title: "1. 100% LOCAL CLIENT-SIDE DOCUMENT & IMAGE PROCESSING",
    content:
      "All file operations across our 18 tools—including Sign PDF, Compress Image, Compress PDF, Convert Image Format, Image to PDF, Merge PDF, PDF to Images, Remove PDF Pages, Organize PDF Pages, Watermark PDF, Word to PDF, Word to JPG, PDF to Word, Excel to PDF, PDF to Excel, PowerPoint to PDF, PDF to PowerPoint, Lock PDF, Unlock PDF, and Passport Photo Maker—execute strictly inside your local browser sandbox using WebAssembly, HTML5 Canvas APIs, PDF.js, and client-side OpenXML engines. Your documents, spreadsheets, presentations, and photos are never uploaded to any external server.",
  },
  {
    title: "2. OPTIONAL GOOGLE SIGN-IN & CLOUD SIGNATURE SYNC",
    content:
      "Signing in with Google (powered by Firebase Authentication) is completely optional; all file tools work without an account. When you sign in, MONO-TRANSCODER stores your Google display name, profile photo URL, and verified email address (kept in an owner-only private record) and synchronizes the reusable signature templates you create in Sign PDF across your computers and mobile devices via Google Cloud Firestore. Your actual PDF files are never uploaded—only your saved signature templates are synced so you can reuse them anywhere.",
  },
  {
    title: "3. EPHEMERAL IN-MEMORY FILE BUFFERS",
    content:
      "Processed output files (defaulting to filename_monotranscoder) are held temporarily in a local JavaScript in-memory Map solely so you can review and download them. Source and output files are never written to remote servers, and closing or reloading your browser tab immediately purges all active file memory buffers.",
  },
  {
    title: "4. ZERO ADVERTISING PIXELS OR THIRD-PARTY TRACKERS",
    content:
      "MONO-TRANSCODER does not run third-party advertising networks, behavioral tracking pixels, cross-site fingerprinting, or data brokerage scripts. Interface preferences such as Light and Dark theme selection are stored exclusively in your browser's local storage.",
  },
  {
    title: "5. STRICT OWNER-ONLY CLOUD SECURITY RULES",
    content:
      "For users who opt into Google Sign-In, all Cloud Firestore records (profile metadata and saved signatures) are enforced by strict Security Rules requiring authenticated, email-verified ownership. Only your authenticated account can read, create, or delete your saved signatures.",
  },
  {
    title: "6. DATA DELETION, USER CONTROL & CONTACT",
    content:
      "You can permanently delete any saved signature at any time using the delete button in the Sign PDF workspace, which immediately removes it from Cloud Firestore across all your devices. For privacy inquiries, bug reports, or account data deletion requests, contact us at burnster1826@gmail.com.",
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
