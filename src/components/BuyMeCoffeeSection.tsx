/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Coffee,
  Copy,
  Check,
  QrCode,
  Sliders,
  ShieldCheck,
  Smartphone,
  Lock,
  Zap,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { sanitizeTextInput } from "../utils/sanitizer";

function GooglePayIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

function PhonePeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5.5" fill="#5F259F" />
      <path
        d="M14.5 7.2C13.8 5.6 12.8 4.2 11.6 3.2c-.4-.3-.9-.2-1.1.2-.2.4-.1.9.3 1.2 1 0.8 1.8 1.9 2.3 3.1l1.4-.5z"
        fill="#FFFFFF"
      />
      <rect x="5.5" y="7" width="13" height="2" rx="0.5" fill="#FFFFFF" />
      <rect x="14" y="7" width="2.2" height="11.5" rx="0.5" fill="#FFFFFF" />
      <path
        d="M8.5 7v6.2c0 1.5 1.2 2.7 2.7 2.7h2.8v-2H11.2c-.4 0-.7-.3-.7-.7V7H8.5z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function PaytmIcon({ className = "w-6 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 36 20" fill="none" aria-hidden="true">
      <rect width="36" height="20" rx="4.5" fill="#FFFFFF" />
      <path d="M4 4.5h4c1.8 0 2.8.9 2.8 2.4s-1 2.4-2.8 2.4H6v4.7H4V4.5zm2 3.3h1.8c.6 0 1-.3 1-.8s-.4-.8-1-.8H6v1.6z" fill="#002970" />
      <path d="M14.5 7.5v6.5h-1.8v-1c-.5.7-1.3 1.2-2.2 1.2-1.5 0-2.5-1-2.5-2.4 0-1.5 1.1-2.3 2.7-2.3h1.8V9c0-.6-.4-1-1.1-1-.6 0-1 .3-1.2.6l-1.2-1c.6-.9 1.5-1.3 2.6-1.3 1.8 0 2.7.9 2.7 2.2zm-1.8 3.3h-1.4c-.7 0-1.1.4-1.1.9 0 .6.4.9 1 .9.8 0 1.5-.6 1.5-1.4v-.4z" fill="#002970" />
      <path d="M16 7.5l1.8 4.6 1.8-4.6h2l-2.9 6.8c-.6 1.4-1.4 2-2.6 2h-.8v-1.6h.6c.5 0 .9-.3 1.2-.9l.4-.9-2.5-5.4H16z" fill="#002970" />
      <path d="M23.5 5.5h1.8v2h1.6v1.6h-1.6v3.2c0 .5.3.7.8.7h.8v1.6h-1.2c-1.4 0-2.2-.8-2.2-2.1V9.1h-1.2V7.5h1.2V5.5z" fill="#00BAF2" />
      <path d="M27.5 7.5h1.8v1c.5-.7 1.2-1.1 2-1.1.8 0 1.5.4 1.8 1.1.5-.7 1.3-1.1 2.2-1.1 1.5 0 2.4 1 2.4 2.6v4h-1.8v-3.6c0-.6-.4-1-.9-1s-.9.4-.9 1v3.6h-1.8v-3.6c0-.6-.4-1-.9-1s-.9.4-.9 1v3.6h-1.8V7.5z" fill="#00BAF2" />
    </svg>
  );
}

function UpiBadgeIcon({ className = "w-7 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 42 20" fill="none" aria-hidden="true">
      <rect width="42" height="20" rx="4" fill="#FFFFFF" />
      <path d="M11 4.5L17.5 10L11 15.5H7.5L14 10L7.5 4.5H11Z" fill="#097939" />
      <path d="M18.5 4.5L25 10L18.5 15.5H15L21.5 10L15 4.5H18.5Z" fill="#ED7824" />
      <text x="27" y="14" fill="#18181B" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="9" letterSpacing="0.5">UPI</text>
    </svg>
  );
}

interface BuyMeCoffeeSectionProps {
  onContactClick?: () => void;
  isContactOpen?: boolean;
}

interface PresetOption {
  amount: number;
  label: string;
  displayPrice: string;
  subtitle: string;
  popular?: boolean;
}

const PRESETS: PresetOption[] = [
  { amount: 100, label: "100 RS", displayPrice: "₹100", subtitle: "QUICK_COFFEE" },
  { amount: 200, label: "200 RS", displayPrice: "₹200", subtitle: "STANDARD_FUEL", popular: true },
  { amount: 500, label: "500 RS", displayPrice: "₹500", subtitle: "PRO_SUPPORTER" },
];

export const UPI_CONFIG = {
  vpa: "prashant5494@slc",
  name: "Prashant",
  defaultCurrency: "INR",
};

export default function BuyMeCoffeeSection({ onContactClick, isContactOpen }: BuyMeCoffeeSectionProps) {
  const { showToast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState<number>(200);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [supporterName, setSupporterName] = useState<string>("");
  const [supporterMessage, setSupporterMessage] = useState<string>("");
  const [copiedVpa, setCopiedVpa] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(false);

  const currentAmount = isCustom
    ? Math.max(1, parseInt(customAmount, 10) || 1000)
    : PRESETS.find((p) => p.amount === selectedPreset)?.amount || 200;

  // Generate UPI URI with sanitized note text (prevents CRLF and protocol parameter injection)
  const noteText =
    sanitizeTextInput(supporterMessage.trim(), 100) || "Support MONO-TRANSCODER";
  const upiUri = `upi://pay?pa=${encodeURIComponent(UPI_CONFIG.vpa)}&pn=${encodeURIComponent(UPI_CONFIG.name)}&am=${currentAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(noteText)}`;

  // Generate real-time vector QR code client-side (lazy-loaded)
  useEffect(() => {
    let isCurrent = true;
    setIsGeneratingQr(true);

    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(upiUri, {
          width: 340,
          margin: 1,
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
          errorCorrectionLevel: "M",
        })
      )
      .then((url) => {
        if (isCurrent) {
          setQrDataUrl(url);
          setIsGeneratingQr(false);
        }
      })
      .catch((err) => {
        console.error("Failed to generate QR code:", err);
        if (isCurrent) {
          setIsGeneratingQr(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [upiUri]);

  const handleCopyVpa = async () => {
    try {
      await navigator.clipboard.writeText(UPI_CONFIG.vpa);
      setCopiedVpa(true);
      showToast("Receiver UPI ID copied!", "success");
      setTimeout(() => setCopiedVpa(false), 2200);
    } catch {
      showToast("Unable to copy UPI ID", "error");
    }
  };

  const handleLaunchApp = (
    appKey: "gpay" | "phonepe" | "paytm" | "universal",
    appName: string
  ) => {
    const isAndroid =
      typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
    const isIOS =
      typeof navigator !== "undefined" &&
      /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isMobile = isAndroid || isIOS;

    if (!isMobile) {
      showToast(
        `Launching ${appName}... On desktop, please scan the QR code to the right with your phone.`,
        "info"
      );
    } else {
      showToast(`Redirecting to ${appName}...`, "success");
    }

    const queryParams = `pa=${encodeURIComponent(UPI_CONFIG.vpa)}&pn=${encodeURIComponent(UPI_CONFIG.name)}&am=${currentAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(noteText)}`;
    const standardUpi = `upi://pay?${queryParams}`;

    let targetUri = standardUpi;

    if (appKey === "gpay") {
      if (isAndroid) {
        targetUri = `intent://pay?${queryParams}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;S.browser_fallback_url=${encodeURIComponent(standardUpi)};end`;
      } else {
        targetUri = `tez://upi/pay?${queryParams}`;
      }
    } else if (appKey === "phonepe") {
      if (isAndroid) {
        targetUri = `intent://pay?${queryParams}#Intent;scheme=upi;package=com.phonepe.app;S.browser_fallback_url=${encodeURIComponent(standardUpi)};end`;
      } else {
        targetUri = `phonepe://pay?${queryParams}`;
      }
    } else if (appKey === "paytm") {
      if (isAndroid) {
        targetUri = `intent://pay?${queryParams}#Intent;scheme=upi;package=net.one97.paytm;S.browser_fallback_url=${encodeURIComponent(standardUpi)};end`;
      } else {
        targetUri = `paytmmp://pay?${queryParams}`;
      }
    } else {
      targetUri = standardUpi;
    }

    try {
      window.location.href = targetUri;
    } catch {
      window.location.href = standardUpi;
    }

    if (appKey !== "universal") {
      setTimeout(() => {
        if (typeof document !== "undefined" && document.hasFocus()) {
          try {
            window.location.href = standardUpi;
          } catch (e) {
            console.warn("UPI intent fallback error:", e);
          }
        }
      }, 1500);
    }
  };

  return (
    <section
      id="buy-me-a-coffee"
      aria-label="Direct UPI Contribution"
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
    >
      {/* Left 7 Cols: Contribution Studio & Parameters */}
      <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 text-white">
            <Coffee className="w-4 h-4 text-orange-400" /> CONTRIBUTION_PARAMETERS.CFG
          </h3>
          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
            CURRENCY: INR (₹)
          </span>
        </div>

        {/* Preset Options */}
        <div className="space-y-2.5">
          <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400">
            SELECT CONTRIBUTION AMOUNT:
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {PRESETS.map((preset) => {
              const isSelected = !isCustom && selectedPreset === preset.amount;
              return (
                <button
                  key={preset.amount}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(preset.amount);
                    setIsCustom(false);
                  }}
                  className={`relative p-3 rounded-lg border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]"
                      : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  {preset.popular && (
                    <span
                      className={`text-[9px] font-mono font-bold uppercase mb-1 ${
                        isSelected ? "text-zinc-900 font-extrabold" : "text-zinc-300 font-bold"
                      }`}
                    >
                      [RECOMMENDED]
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Coffee
                      className={`w-4 h-4 ${
                        isSelected ? "text-amber-600" : "text-amber-400"
                      }`}
                    />
                    <span className={`font-sans font-bold text-base ${isSelected ? "text-amber-600 font-extrabold" : "text-amber-400"}`}>
                      {preset.displayPrice}
                    </span>
                  </div>
                  <div>
                    <div className={`text-[11px] font-mono font-bold uppercase ${isSelected ? "text-black" : "text-white"}`}>
                      {preset.label}
                    </div>
                    <div
                      className={`text-[9px] font-mono uppercase ${
                        isSelected ? "text-zinc-700" : "text-zinc-500"
                      }`}
                    >
                      {preset.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Custom Amount Button */}
            <button
              type="button"
              onClick={() => setIsCustom(true)}
              className={`relative p-3 rounded-lg border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                isCustom
                  ? "bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]"
                  : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sliders
                  className={`w-4 h-4 ${
                    isCustom ? "text-amber-600" : "text-amber-400"
                  }`}
                />
                <span className={`font-sans font-bold text-base ${isCustom ? "text-amber-600 font-extrabold" : "text-amber-400"}`}>
                  {isCustom && customAmount
                    ? `₹${customAmount}`
                    : isCustom
                    ? "₹1000"
                    : "CUSTOM"}
                </span>
              </div>
              <div>
                <div className={`text-[11px] font-mono font-bold uppercase ${isCustom ? "text-black" : "text-white"}`}>
                  CUSTOM_AMT
                </div>
                <div
                  className={`text-[9px] font-mono uppercase ${
                    isCustom ? "text-zinc-700" : "text-zinc-500"
                  }`}
                >
                  ANY_AMOUNT
                </div>
              </div>
            </button>
          </div>

          {/* Custom Amount Input Box */}
          {isCustom && (
            <div className="mt-3 p-3.5 rounded-lg bg-black border-2 border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-300 font-bold">
                  AMOUNT (₹):
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={customAmount}
                  onChange={(e) => {
                    const numericOnly = e.target.value.replace(/[^0-9]/g, "");
                    setCustomAmount(numericOnly);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                    }
                  }}
                  placeholder="e.g. 1000"
                  className="w-32 px-2.5 py-1.5 bg-zinc-950 border-2 border-zinc-700 text-white rounded text-xs font-mono font-bold focus:outline-none focus:border-white"
                  aria-label="Custom contribution in rupees"
                  autoFocus
                />
                <span className="text-xs font-mono text-zinc-400">INR</span>
              </div>
              <div className="text-xs font-mono text-zinc-400">
                TOTAL:{" "}
                <strong className="text-white font-bold">
                  ₹{currentAmount} INR
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* Supporter details input */}
        <div className="space-y-3 pt-2 border-t border-zinc-800">
          <div>
            <label
              htmlFor="supporter-name-input"
              className="block text-[11px] font-mono font-bold uppercase text-zinc-400 mb-1"
            >
              YOUR NAME OR HANDLE (OPTIONAL):
            </label>
            <input
              id="supporter-name-input"
              type="text"
              maxLength={50}
              value={supporterName}
              onChange={(e) =>
                setSupporterName(sanitizeTextInput(e.target.value, 50))
              }
              placeholder="e.g. ridhi / anonymous / arya"
              className="w-full p-2.5 bg-black border-2 border-zinc-700 text-white rounded-lg text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:border-white"
            />
          </div>

          <div>
            <label
              htmlFor="supporter-message-input"
              className="block text-[11px] font-mono font-bold uppercase text-zinc-400 mb-1"
            >
              MESSAGE OR FEATURE NOTE (OPTIONAL):
            </label>
            <input
              id="supporter-message-input"
              type="text"
              maxLength={140}
              value={supporterMessage}
              onChange={(e) =>
                setSupporterMessage(sanitizeTextInput(e.target.value, 140))
              }
              placeholder="e.g. Love the fast image & PDF conversion!"
              className="w-full p-2.5 bg-black border-2 border-zinc-700 text-white rounded-lg text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:border-white"
            />
          </div>
        </div>

        {/* Action buttons: Direct UPI App Redirect */}
        <div className="pt-3 border-t border-zinc-800 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleLaunchApp("gpay", "Google Pay")}
              aria-label="Pay using Google Pay"
              className="py-2.5 px-2 bg-black border-2 border-zinc-800 hover:border-emerald-400 hover:bg-zinc-900 rounded-lg flex items-center justify-center gap-1.5 text-white font-mono text-xs font-bold transition-all cursor-pointer group shadow-[1px_1px_0px_0px_#27272a] hover:shadow-[2px_2px_0px_0px_#34A853]"
            >
              <GooglePayIcon className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
              <span className="truncate group-hover:text-emerald-300 transition-colors">GPay</span>
            </button>

            <button
              type="button"
              onClick={() => handleLaunchApp("phonepe", "PhonePe")}
              aria-label="Pay using PhonePe"
              className="py-2.5 px-2 bg-black border-2 border-zinc-800 hover:border-purple-500 hover:bg-zinc-900 rounded-lg flex items-center justify-center gap-1.5 text-white font-mono text-xs font-bold transition-all cursor-pointer group shadow-[1px_1px_0px_0px_#27272a] hover:shadow-[2px_2px_0px_0px_#5F259F]"
            >
              <PhonePeIcon className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
              <span className="truncate group-hover:text-purple-300 transition-colors">PhonePe</span>
            </button>

            <button
              type="button"
              onClick={() => handleLaunchApp("paytm", "Paytm")}
              aria-label="Pay using Paytm"
              className="py-2.5 px-2 bg-black border-2 border-zinc-800 hover:border-[#00BAF2] hover:bg-zinc-900 rounded-lg flex items-center justify-center gap-1.5 text-white font-mono text-xs font-bold transition-all cursor-pointer group shadow-[1px_1px_0px_0px_#27272a] hover:shadow-[2px_2px_0px_0px_#00BAF2]"
            >
              <PaytmIcon className="w-6 h-4 shrink-0 transition-transform group-hover:scale-110" />
              <span className="truncate group-hover:text-cyan-300 transition-colors">Paytm</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleLaunchApp("universal", "UPI App")}
            className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 text-black border-2 border-black font-sans font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded-lg transition-all"
          >
            <Zap className="w-4 h-4 text-black fill-black shrink-0" />
            <span className="font-extrabold text-black">PAY WITH ANY UPI APP</span>
          </button>
        </div>

        {/* Footer contact */}
        <div className="text-[11px] font-mono text-zinc-400 pt-3 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>Need custom features, enterprise format tools, or help?</span>
          <a
            href="mailto:burnster1826@gmail.com"
            onClick={(e) => {
              if (onContactClick) {
                onContactClick();
              }
              try {
                navigator.clipboard.writeText("burnster1826@gmail.com");
                showToast("Developer email (burnster1826@gmail.com) copied to clipboard!", "success");
              } catch {
                // fallback
              }
            }}
            className={`cursor-pointer font-bold uppercase text-left sm:text-right underline underline-offset-3 transition-all duration-300 ${
              isContactOpen
                ? "text-emerald-400 font-extrabold decoration-emerald-400"
                : "text-white hover:text-emerald-300 decoration-zinc-500/30 hover:decoration-emerald-300"
            }`}
          >
            [CONTACT_DEVELOPER]
          </a>
        </div>
      </div>

      {/* Right 5 Cols: Vector QR Code Card */}
      <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-6 flex flex-col items-center text-center space-y-4">
        <div className="flex items-center justify-between w-full border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-1.5">
            <QrCode className="w-4 h-4 text-pink-400" />
            <span className="text-xs font-mono font-bold uppercase text-white tracking-wider">
              UPI_QR_TERMINAL.DAT
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-black bg-orange-500 px-2.5 py-0.5 rounded shadow-[1px_1px_0_0_#ffffff]">
            ₹{currentAmount} INR
          </span>
        </div>

        <div className="bg-black border border-zinc-800 rounded-lg p-5 w-full flex flex-col items-center justify-center">
          <div className="bg-white p-3 rounded border-2 border-zinc-700 shadow">
            {isGeneratingQr || !qrDataUrl ? (
              <div className="w-52 h-52 flex flex-col items-center justify-center font-mono text-xs text-zinc-500 gap-2">
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>ENCODING_QR...</span>
              </div>
            ) : (
              <img
                src={qrDataUrl}
                alt={`UPI QR Code for ₹${currentAmount} payment`}
                className="w-52 h-52 object-contain block"
              />
            )}
          </div>
          <p className="text-[10px] font-mono text-zinc-400 uppercase mt-3">
            SCAN WITH ANY UPI APP (<span className="text-zinc-300 font-bold">GPAY</span> / <span className="text-zinc-300 font-bold">PHONEPE</span> / <span className="text-zinc-300 font-bold">PAYTM</span> / <span className="text-zinc-300 font-bold">BHIM</span>)
          </p>
        </div>

        <div className="w-full bg-black border-2 border-zinc-800 rounded-lg p-3 flex items-center justify-between text-xs font-mono">
          <div className="text-left truncate">
            <span className="text-zinc-500 block text-[10px]">RECEIVER_VPA:</span>
            <strong className="text-white font-bold truncate">{UPI_CONFIG.vpa}</strong>
          </div>
          <button
            type="button"
            onClick={handleCopyVpa}
            className="px-3 py-1.5 bg-white text-black hover:bg-zinc-200 font-mono text-[10px] font-bold uppercase rounded cursor-pointer flex items-center gap-1 shrink-0"
          >
            {copiedVpa ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span className="text-emerald-600 font-bold">COPIED</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>COPY_ID</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
