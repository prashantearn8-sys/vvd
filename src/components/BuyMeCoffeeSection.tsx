/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
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
  X,
  ExternalLink,
  ArrowRight,
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
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>("SCAN WITH ANY UPI APP");
  const [showFallbackHelper, setShowFallbackHelper] = useState<boolean>(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentAmount = isCustom
    ? Math.max(0, parseInt(customAmount, 10) || 0)
    : PRESETS.find((p) => p.amount === selectedPreset)?.amount || 200;
  const isPayDisabled = currentAmount <= 0;

  // Clean noteText to be strictly alphanumeric and spaces only (max 50 chars), safe for ALL Indian UPI apps & banks
  const rawNote = supporterMessage.trim() ? sanitizeTextInput(supporterMessage.trim(), 50) : "";
  const cleanNote = rawNote.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  const noteText = cleanNote || "Support MonoTranscoder";

  const formattedAmount = currentAmount.toFixed(2);
  const queryParams = `pa=${encodeURIComponent(UPI_CONFIG.vpa)}&pn=${encodeURIComponent(UPI_CONFIG.name)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent(noteText)}`;
  const standardUpi = `upi://pay?${queryParams}`;

  // Generate real-time vector QR code client-side (lazy-loaded)
  useEffect(() => {
    let isCurrent = true;
    setIsGeneratingQr(true);

    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(standardUpi, {
          width: 380,
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
  }, [standardUpi]);

  // Clean up any pending timer
  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const handleCopyVpa = async () => {
    try {
      await navigator.clipboard.writeText(UPI_CONFIG.vpa);
      setCopiedVpa(true);
      showToast("Receiver UPI ID (prashant5494@slc) copied!", "success");
      setTimeout(() => setCopiedVpa(false), 2200);
    } catch {
      showToast("Unable to copy UPI ID", "error");
    }
  };

  const isMobilePlatform = () => {
    if (typeof navigator === "undefined") return false;
    return (
      /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) ||
      (typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(max-width: 768px)").matches &&
        navigator.maxTouchPoints > 0)
    );
  };

  const isAndroid = () => {
    if (typeof navigator === "undefined") return false;
    return /Android/i.test(navigator.userAgent);
  };

  const triggerDeepLink = (url: string) => {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_self";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      }, 150);
    } catch {
      window.location.href = url;
    }
  };

  const handleLaunchApp = (
    appKey: "gpay" | "phonepe" | "paytm" | "universal",
    appName: string
  ) => {
    if (isPayDisabled) return;
    const mobile = isMobilePlatform();

    if (!mobile) {
      // Desktop: Seamless QR Modal with auto-copied UPI ID
      handleCopyVpa();
      setModalTitle(`PAY WITH ${appName.toUpperCase()}`);
      setShowQrModal(true);

      const qrElement = document.getElementById("upi-qr-card");
      if (qrElement) {
        qrElement.scrollIntoView({ behavior: "smooth", block: "center" });
        qrElement.classList.add("ring-2", "ring-amber-400");
        setTimeout(() => {
          qrElement.classList.remove("ring-2", "ring-amber-400");
        }, 2200);
      }
      return;
    }

    // Mobile platform handling
    showToast(`Opening ${appName}...`, "info");
    setShowFallbackHelper(false);

    let targetUri = standardUpi;

    if (appKey === "phonepe") {
      // PhonePe Android intent or direct URI scheme
      if (isAndroid()) {
        targetUri = `intent://pay?${queryParams}#Intent;scheme=phonepe;package=com.phonepe.app;end`;
      } else {
        targetUri = `phonepe://pay?${queryParams}`;
      }
    } else if (appKey === "gpay") {
      // Google Pay Android intent or iOS tez scheme
      if (isAndroid()) {
        targetUri = `intent://pay?${queryParams}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;
      } else {
        targetUri = `tez://upi/pay?${queryParams}`;
      }
    } else if (appKey === "paytm") {
      // Paytm Android intent or iOS paytmmp scheme
      if (isAndroid()) {
        targetUri = `intent://pay?${queryParams}#Intent;scheme=paytmmp;package=net.one97.paytm;end`;
      } else {
        targetUri = `paytmmp://pay?${queryParams}`;
      }
    } else {
      // Universal: Android intent invokes Android native UPI Chooser dialog for all apps
      if (isAndroid()) {
        targetUri = `intent://pay?${queryParams}#Intent;scheme=upi;end`;
      } else {
        targetUri = standardUpi;
      }
    }

    triggerDeepLink(targetUri);

    // Fallback attempt: if intent fails or app doesn't open within 1500ms
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
    }

    fallbackTimerRef.current = setTimeout(() => {
      if (typeof document !== "undefined" && document.hasFocus()) {
        // App didn't take focus; try standard UPI scheme as backup
        if (targetUri !== standardUpi) {
          triggerDeepLink(standardUpi);
        }
        setShowFallbackHelper(true);
      }
    }, 1600);
  };

  return (
    <>
      <section
        id="buy-me-a-coffee"
        aria-label="Direct UPI Contribution"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* Left 7 Cols: Contribution Studio & Parameters */}
        <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <h3 className="font-mono font-bold text-[11px] sm:text-xs uppercase tracking-tight sm:tracking-wider flex items-center gap-1.5 text-white min-w-0">
              <Coffee className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="truncate">CONTRIBUTION_PARAMETERS.CFG</span>
            </h3>
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
                    className={`relative h-[86px] sm:h-[92px] p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]"
                        : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    {preset.popular && (
                      <span
                        className={`absolute top-2 right-2 text-[8px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded leading-none ${
                          isSelected
                            ? "bg-amber-400 text-black"
                            : "bg-zinc-900 text-amber-400 border border-zinc-700"
                        }`}
                      >
                        POPULAR
                      </span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Coffee
                        className={`w-4 h-4 shrink-0 ${
                          isSelected ? "text-amber-600" : "text-amber-400"
                        }`}
                      />
                      <span
                        className={`font-sans font-extrabold text-base sm:text-lg leading-none ${
                          isSelected ? "text-amber-600" : "text-amber-400"
                        }`}
                      >
                        {preset.displayPrice}
                      </span>
                    </div>
                    <div>
                      <div
                        className={`text-[11px] font-mono font-bold uppercase leading-tight ${
                          isSelected ? "text-black" : "text-white"
                        }`}
                      >
                        {preset.label}
                      </div>
                      <div
                        className={`text-[9px] font-mono uppercase leading-tight mt-0.5 ${
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
                className={`relative h-[86px] sm:h-[92px] p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isCustom
                    ? "bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]"
                    : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Sliders
                    className={`w-4 h-4 shrink-0 ${
                      isCustom ? "text-amber-600" : "text-amber-400"
                    }`}
                  />
                  <span
                    className={`font-sans font-extrabold text-base sm:text-lg leading-none truncate ${
                      isCustom ? "text-amber-600" : "text-amber-400"
                    }`}
                  >
                    {isCustom && customAmount
                      ? `₹${customAmount}`
                      : isCustom
                      ? "₹0"
                      : "CUSTOM"}
                  </span>
                </div>
                <div>
                  <div
                    className={`text-[11px] font-mono font-bold uppercase leading-tight ${
                      isCustom ? "text-black" : "text-white"
                    }`}
                  >
                    CUSTOM_AMT
                  </div>
                  <div
                    className={`text-[9px] font-mono uppercase leading-tight mt-0.5 ${
                      isCustom ? "text-zinc-700" : "text-zinc-500"
                    }`}
                  >
                    ANY_AMOUNT
                  </div>
                </div>
              </button>
            </div>

            {/* Redesigned Custom Amount Input Box (Mobile-Optimized) */}
            {isCustom && (
              <div className="mt-3 p-3.5 sm:p-4 rounded-xl bg-black border-2 border-zinc-700 space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="custom-amount-field"
                    className="text-[10px] sm:text-[11px] font-mono font-bold uppercase text-zinc-400"
                  >
                    ENTER CUSTOM AMOUNT
                  </label>
                  <span
                    className={`text-[10px] font-mono font-bold uppercase ${
                      isPayDisabled ? "text-zinc-500" : "text-amber-400"
                    }`}
                  >
                    ACTIVE: ₹{currentAmount} INR
                  </span>
                </div>

                {/* Integrated Full-Width Currency Input Bar */}
                <div className="relative flex items-center bg-zinc-950 border-2 border-zinc-700 focus-within:border-white rounded-xl overflow-hidden transition-colors">
                  <div className="pl-3.5 pr-2.5 py-2.5 flex items-center justify-center text-amber-400 font-sans font-extrabold text-lg sm:text-xl select-none border-r border-zinc-800 bg-zinc-900/60">
                    ₹
                  </div>
                  <input
                    id="custom-amount-field"
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
                    placeholder="0"
                    className="w-full px-3 py-2.5 bg-transparent text-white font-mono font-extrabold text-base sm:text-lg focus:outline-none placeholder:text-zinc-600"
                    aria-label="Custom contribution in rupees"
                    autoFocus
                  />
                  {customAmount && (
                    <button
                      type="button"
                      onClick={() => setCustomAmount("")}
                      aria-label="Clear custom amount"
                      className="p-1.5 mr-1 text-zinc-500 hover:text-white rounded-md cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <div className="px-3 py-2.5 flex items-center justify-center border-l border-zinc-800 bg-zinc-900/60 text-xs font-mono font-bold text-emerald-400 shrink-0 whitespace-nowrap select-none">
                    INR (₹)
                  </div>
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
                maxLength={100}
                value={supporterMessage}
                onChange={(e) =>
                  setSupporterMessage(sanitizeTextInput(e.target.value, 100))
                }
                placeholder="e.g. Love the fast image & PDF conversion!"
                className="w-full p-2.5 bg-black border-2 border-zinc-700 text-white rounded-lg text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:border-white"
              />
            </div>
          </div>

          {/* Action buttons: App Redirects & QR Launcher */}
          <div className="pt-3 border-t border-zinc-800 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Google Pay Button */}
              <button
                type="button"
                disabled={isPayDisabled}
                onClick={() => handleLaunchApp("gpay", "Google Pay")}
                aria-label="Pay using Google Pay"
                className={`py-2.5 px-2 bg-black border-2 border-zinc-800 rounded-lg flex items-center justify-center gap-1.5 text-white font-mono text-xs font-bold transition-all group ${
                  isPayDisabled
                    ? "opacity-40 cursor-not-allowed pointer-events-none"
                    : "hover:border-emerald-400 hover:bg-zinc-900 cursor-pointer shadow-[1px_1px_0px_0px_#27272a] hover:shadow-[2px_2px_0px_0px_#34A853] active:translate-y-0.5"
                }`}
              >
                <GooglePayIcon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
                <span className="truncate group-hover:text-emerald-300 transition-colors">
                  GPay
                </span>
              </button>

              {/* PhonePe Button (Enhanced Intent & Scheme Launch) */}
              <button
                type="button"
                id="phonepe-pay-button"
                disabled={isPayDisabled}
                onClick={() => handleLaunchApp("phonepe", "PhonePe")}
                aria-label="Pay using PhonePe"
                className={`py-2.5 px-2 bg-black border-2 border-zinc-800 rounded-lg flex items-center justify-center gap-1.5 text-white font-mono text-xs font-bold transition-all group ${
                  isPayDisabled
                    ? "opacity-40 cursor-not-allowed pointer-events-none"
                    : "hover:border-purple-500 hover:bg-zinc-900 cursor-pointer shadow-[1px_1px_0px_0px_#27272a] hover:shadow-[2px_2px_0px_0px_#5F259F] active:translate-y-0.5"
                }`}
              >
                <PhonePeIcon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
                <span className="truncate group-hover:text-purple-300 transition-colors">
                  PhonePe
                </span>
              </button>

              {/* Paytm Button */}
              <button
                type="button"
                disabled={isPayDisabled}
                onClick={() => handleLaunchApp("paytm", "Paytm")}
                aria-label="Pay using Paytm"
                className={`py-2.5 px-2 bg-black border-2 border-zinc-800 rounded-lg flex items-center justify-center gap-1.5 text-white font-mono text-xs font-bold transition-all group ${
                  isPayDisabled
                    ? "opacity-40 cursor-not-allowed pointer-events-none"
                    : "hover:border-[#00BAF2] hover:bg-zinc-900 cursor-pointer shadow-[1px_1px_0px_0px_#27272a] hover:shadow-[2px_2px_0px_0px_#00BAF2] active:translate-y-0.5"
                }`}
              >
                <PaytmIcon className="w-5 h-3.5 shrink-0 transition-transform group-hover:scale-110" />
                <span className="truncate group-hover:text-cyan-300 transition-colors">
                  Paytm
                </span>
              </button>

              {/* Mobile QR Button: Dedicated trigger to instantly reveal the QR code */}
              <button
                type="button"
                id="mobile-show-qr-button"
                disabled={isPayDisabled}
                onClick={() => {
                  if (isPayDisabled) return;
                  setModalTitle("UPI QR CODE");
                  setShowQrModal(true);
                  handleCopyVpa();
                }}
                aria-label="Show UPI QR Code"
                title="Show UPI QR Code"
                className={`py-2.5 px-2 bg-black border-2 border-zinc-800 rounded-lg flex items-center justify-center gap-1.5 text-white font-mono text-xs font-bold transition-all group ${
                  isPayDisabled
                    ? "opacity-40 cursor-not-allowed pointer-events-none"
                    : "hover:border-pink-400 hover:bg-zinc-900 cursor-pointer shadow-[1px_1px_0px_0px_#27272a] hover:shadow-[2px_2px_0px_0px_#ec4899] active:translate-y-0.5"
                }`}
              >
                <QrCode className="w-4 h-4 text-pink-400 shrink-0 transition-transform group-hover:scale-110" />
                <span className="truncate text-white transition-colors">
                  QR CODE
                </span>
              </button>
            </div>

            {/* Primary Action: Universal PAY WITH ANY UPI Button */}
            <button
              type="button"
              id="pay-with-any-upi-btn"
              disabled={isPayDisabled}
              onClick={() => handleLaunchApp("universal", "UPI App")}
              className={`w-full py-3.5 px-3 font-sans font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 rounded-lg transition-all min-h-[46px] border-2 ${
                isPayDisabled
                  ? "bg-zinc-900 text-zinc-500 border-zinc-800 opacity-50 cursor-not-allowed shadow-none"
                  : "bg-amber-400 hover:bg-amber-300 text-black border-black cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5"
              }`}
            >
              <Zap
                className={`w-4 h-4 shrink-0 ${
                  isPayDisabled ? "text-zinc-500" : "text-black fill-black"
                }`}
              />
              <span
                className={`font-extrabold truncate ${
                  isPayDisabled ? "text-zinc-500" : "text-black"
                }`}
              >
                PAY WITH ANY UPI APP
              </span>
            </button>

            {/* Mobile Fallback Helper Notice if app doesn't open */}
            {showFallbackHelper && (
              <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono space-y-2 animate-fade-in">
                <div className="flex items-center justify-between text-zinc-300">
                  <span>UPI app didn't open automatically?</span>
                  <button
                    type="button"
                    onClick={() => setShowFallbackHelper(false)}
                    className="text-zinc-500 hover:text-white p-1"
                    aria-label="Close message"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyVpa}
                    className="px-2.5 py-1 bg-white text-black font-bold text-[10px] rounded flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>
                      COPY UPI ID (<span className="lowercase">{UPI_CONFIG.vpa}</span>)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalTitle("SCAN TO PAY");
                      setShowQrModal(true);
                    }}
                    className="px-2.5 py-1 bg-zinc-800 text-zinc-200 hover:text-white font-bold text-[10px] uppercase rounded flex items-center gap-1 cursor-pointer"
                  >
                    <QrCode className="w-3 h-3 text-pink-400" />
                    <span>View QR Code</span>
                  </button>
                </div>
              </div>
            )}
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
                  showToast(
                    "Developer email (burnster1826@gmail.com) copied to clipboard!",
                    "success"
                  );
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

        {/* Right 5 Cols: Desktop QR Terminal (visible on lg screens) */}
        <div
          id="upi-qr-card"
          className="hidden lg:flex lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-6 flex-col items-center text-center space-y-4 transition-all duration-300"
        >
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
              SCAN WITH ANY UPI APP (
              <span className="text-zinc-300 font-bold">GPAY</span> /{" "}
              <span className="text-zinc-300 font-bold">PHONEPE</span> /{" "}
              <span className="text-zinc-300 font-bold">PAYTM</span> /{" "}
              <span className="text-zinc-300 font-bold">BHIM</span>)
            </p>
          </div>

          <div className="w-full bg-black border-2 border-zinc-800 rounded-lg p-3 flex items-center justify-between text-xs font-mono">
            <div className="text-left truncate mr-2">
              <span className="text-zinc-500 block text-[10px]">RECEIVER_VPA:</span>
              <strong className="text-white font-bold truncate block lowercase">
                {UPI_CONFIG.vpa}
              </strong>
            </div>
            <button
              type="button"
              onClick={handleCopyVpa}
              className="px-3 py-1.5 bg-white text-black hover:bg-zinc-200 font-mono text-[10px] font-bold uppercase rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
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

      {/* Interactive QR Code Modal (Revealed on mobile via QR button & desktop click) */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in select-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
        >
          <div className="w-full max-w-sm bg-zinc-950 border-2 border-white rounded-2xl p-5 sm:p-6 shadow-[4px_4px_0px_0px_#ffffff] text-center space-y-4 animate-slide-up relative">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-1.5 text-left">
                <QrCode className="w-4 h-4 text-pink-400 shrink-0" />
                <h3
                  id="qr-modal-title"
                  className="font-mono font-bold text-xs uppercase tracking-wider text-white"
                >
                  {modalTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Close QR Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Amount Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400 text-black font-mono font-bold text-xs rounded-full shadow-[1px_1px_0_0_#ffffff]">
              <span>AMOUNT TO PAY:</span>
              <strong className="text-sm font-extrabold">₹{currentAmount} INR</strong>
            </div>

            {/* QR Code Container */}
            <div className="bg-black border-2 border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center">
              <div className="bg-white p-3 rounded-lg border-2 border-zinc-800 shadow-md">
                {isGeneratingQr || !qrDataUrl ? (
                  <div className="w-48 h-48 flex flex-col items-center justify-center font-mono text-xs text-zinc-500 gap-2">
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>ENCODING_QR...</span>
                  </div>
                ) : (
                  <img
                    src={qrDataUrl}
                    alt={`UPI QR Code for ₹${currentAmount}`}
                    className="w-48 h-48 object-contain block mx-auto"
                  />
                )}
              </div>
              <p className="text-[10px] font-mono text-zinc-400 uppercase mt-2.5">
                Scan with GPay, PhonePe, Paytm, or BHIM
              </p>
            </div>

            {/* UPI ID Copy Bar */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono">
              <div className="text-left truncate mr-2">
                <span className="text-zinc-500 block text-[9px] uppercase">UPI ID:</span>
                <span className="text-white font-bold truncate block lowercase">
                  {UPI_CONFIG.vpa}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyVpa}
                className="px-2.5 py-1 bg-white text-black hover:bg-zinc-200 font-mono text-[10px] font-bold uppercase rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
              >
                {copiedVpa ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-600 font-bold">COPIED</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>COPY</span>
                  </>
                )}
              </button>
            </div>

            {/* Close / Action Button */}
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600 rounded-lg font-mono text-xs font-bold uppercase transition-colors cursor-pointer"
            >
              DONE / CLOSE
            </button>
          </div>
        </div>
      )}
    </>
  );
}
