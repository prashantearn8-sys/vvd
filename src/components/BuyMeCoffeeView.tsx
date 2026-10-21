/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ShieldCheck } from "lucide-react";
import BuyMeCoffeeSection from "./BuyMeCoffeeSection";

interface BuyMeCoffeeViewProps {
  onBack: () => void;
  onOpenContact?: () => void;
  isContactOpen?: boolean;
}

export default function BuyMeCoffeeView({ onBack, onOpenContact, isContactOpen }: BuyMeCoffeeViewProps) {
  return (
    <section
      id="buy-me-coffee-page"
      aria-labelledby="coffee-page-heading"
      className="space-y-6 animate-fade-in"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="coffee-page-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            BUY ME A COFFEE // <span>SUPPORT_DEV.PRG</span>
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Fuel continuous development of <span className="font-semibold">100% client-side</span>, <span className="font-semibold">zero-upload</span> image and PDF utilities.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] font-mono font-bold uppercase px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-400 text-zinc-200 hover:text-amber-400 rounded transition-colors cursor-pointer self-start sm:self-auto"
        >
          ← BACK_TO_TOOLS
        </button>
      </div>

      {/* Main Buy Me A Coffee Interactive Section */}
      <BuyMeCoffeeSection onContactClick={onOpenContact} isContactOpen={isContactOpen} />

      {/* Trust & Guarantee Banner */}
      <div className="border-2 border-zinc-800 rounded-xl p-5 bg-zinc-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-white shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h4 className="text-xs font-mono font-bold uppercase text-white">
              ZERO_TELEMETRY // ZERO_TRACKERS // ZERO_PAYWALLS
            </h4>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Every contribution directly supports the maintenance and engineering of <span className="text-zinc-200 font-semibold">private, in-browser file tools</span> for everyone.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded shrink-0 text-center"
        >
          EXPLORE_TOOLS →
        </button>
      </div>
    </section>
  );
}
