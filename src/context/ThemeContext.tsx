/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: (e?: React.MouseEvent<HTMLElement>) => void;
  isSystemTheme: boolean;
  isTransitioning: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
  isSystemTheme: true,
  isTransitioning: false,
});

// Pre-computed starfield coordinates for Light -> Dark nightfall transition
const NIGHTFALL_STARS = [
  { cx: 180, cy: 140, r: 2.2, delay: "0ms" },
  { cx: 340, cy: 95, r: 1.8, delay: "12ms" },
  { cx: 560, cy: 175, r: 2.6, delay: "24ms" },
  { cx: 780, cy: 110, r: 2.0, delay: "8ms" },
  { cx: 1020, cy: 205, r: 2.4, delay: "28ms" },
  { cx: 1240, cy: 130, r: 2.0, delay: "5ms" },
  { cx: 260, cy: 360, r: 2.0, delay: "32ms" },
  { cx: 490, cy: 420, r: 2.4, delay: "20ms" },
  { cx: 740, cy: 310, r: 1.8, delay: "36ms" },
  { cx: 960, cy: 450, r: 2.6, delay: "16ms" },
  { cx: 1180, cy: 340, r: 2.1, delay: "14ms" },
  { cx: 1360, cy: 390, r: 2.3, delay: "10ms" },
  { cx: 230, cy: 620, r: 2.3, delay: "40ms" },
  { cx: 640, cy: 590, r: 2.0, delay: "28ms" },
  { cx: 890, cy: 650, r: 2.4, delay: "34ms" },
  { cx: 1150, cy: 580, r: 1.9, delay: "22ms" },
];

// Pre-computed golden sun motes for Dark -> Light sunrise transition
const SUNRISE_MOTES = [
  { angle: -165, dist: 220, size: 4.5, delay: "0ms" },
  { angle: -152, dist: 340, size: 3.5, delay: "10ms" },
  { angle: -140, dist: 460, size: 5.0, delay: "18ms" },
  { angle: -128, dist: 280, size: 4.0, delay: "6ms" },
  { angle: -115, dist: 410, size: 4.5, delay: "14ms" },
  { angle: -102, dist: 250, size: 3.5, delay: "12ms" },
  { angle: -175, dist: 380, size: 4.5, delay: "22ms" },
  { angle: -146, dist: 580, size: 5.0, delay: "26ms" },
];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [hasManualOverride, setHasManualOverride] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mono_theme") !== null;
    }
    return false;
  });

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mono_theme") as Theme;
      if (saved === "light" || saved === "dark") {
        return saved;
      }
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
        return "light";
      }
    }
    return "dark";
  });

  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [celestialFX, setCelestialFX] = useState<{
    key: number;
    targetTheme: Theme;
    x: number;
    y: number;
  } | null>(null);
  const fxTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);

  // Listen for desktop OS theme preference changes when no manual override is set
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      if (!hasManualOverride) {
        setTheme(e.matches ? "dark" : "light");
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
    } else {
      mediaQuery.addListener(handleSystemThemeChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      } else {
        mediaQuery.removeListener(handleSystemThemeChange);
      }
    };
  }, [hasManualOverride]);

  // Sync class on documentElement
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      if (fxTimerRef.current) window.clearTimeout(fxTimerRef.current);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const toggleTheme = (e?: React.MouseEvent<HTMLElement>) => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;

    // Exact coordinates of the theme toggle button
    let x = typeof window !== "undefined" ? window.innerWidth - 76 : 1200;
    let y = 28;
    if (e && e.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      x = Math.round(rect.left + rect.width / 2);
      y = Math.round(rect.top + rect.height / 2);
    }

    const maxRadius =
      typeof window !== "undefined"
        ? Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)))
        : 1800;

    if (fxTimerRef.current) window.clearTimeout(fxTimerRef.current);
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);

    setCelestialFX({
      key: Date.now(),
      targetTheme: nextTheme,
      x,
      y,
    });

    const applyThemeChange = () => {
      localStorage.setItem("mono_theme", nextTheme);
      setHasManualOverride(true);
      if (nextTheme === "light") {
        root.classList.remove("dark");
        root.classList.add("light");
      } else {
        root.classList.remove("light");
        root.classList.add("dark");
      }
      setTheme(nextTheme);
    };

    const docWithVT = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
    };

    if (typeof docWithVT.startViewTransition === "function") {
      setIsTransitioning(true);
      root.classList.add("vt-no-color-transitions");
      try {
        const transition = docWithVT.startViewTransition(() => {
          applyThemeChange();
        });
        transition.ready
          .then(() => {
            root.classList.remove("vt-no-color-transitions");
            document.documentElement.animate(
              {
                clipPath: [
                  `circle(0px at ${x}px ${y}px)`,
                  `circle(${maxRadius}px at ${x}px ${y}px)`,
                ],
              },
              {
                duration: 320,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                pseudoElement: "::view-transition-new(root)",
              }
            );
          })
          .catch(() => {
            root.classList.remove("vt-no-color-transitions");
          });
        transition.finished.finally(() => {
          root.classList.remove("vt-no-color-transitions");
          setIsTransitioning(false);
        });
      } catch {
        root.classList.remove("vt-no-color-transitions");
        setIsTransitioning(false);
        applyThemeChange();
      }
    } else {
      root.classList.add("theme-smooth-fade");
      applyThemeChange();
      fadeTimerRef.current = window.setTimeout(() => {
        root.classList.remove("theme-smooth-fade");
      }, 240);
    }

    fxTimerRef.current = window.setTimeout(() => {
      setCelestialFX(null);
    }, 420);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isSystemTheme: !hasManualOverride, isTransitioning }}>
      {children}

      {/* GPU-Composited Celestial Horizon Stage (Sunrise Rays vs. Cosmic Nightfall & Shooting Stars) */}
      {celestialFX && (
        <div
          key={celestialFX.key}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[10000] overflow-hidden gpu-layer"
        >
          {celestialFX.targetTheme === "light" ? (
            /* DARK -> LIGHT: Golden Solar Burst, Rotating God-Rays & Floating Sunbeams */
            <div className="absolute inset-0 gpu-layer">
              {/* Warm Horizon Ambient Wash */}
              <div
                style={{
                  background: `radial-gradient(circle at ${celestialFX.x}px ${celestialFX.y}px, rgba(251, 191, 36, 0.36) 0%, rgba(245, 158, 11, 0.14) 34%, transparent 68%)`,
                }}
                className="absolute inset-0 animate-celestial-wash gpu-layer"
              />

              {/* Rotating Solar Corona & Sunbeams anchored at the Toggle Button */}
              <div
                style={{
                  left: `${celestialFX.x}px`,
                  top: `${celestialFX.y}px`,
                }}
                className="absolute w-[960px] h-[960px] animate-solar-corona gpu-layer"
              >
                <svg viewBox="0 0 400 400" className="w-full h-full">
                  <defs>
                    <radialGradient id="solar-beam-grad" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                      <stop offset="45%" stopColor="#fbbf24" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="#fef3c7" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  {Array.from({ length: 12 }).map((_, idx) => (
                    <polygon
                      key={idx}
                      points="200,200 188,0 212,0"
                      fill="url(#solar-beam-grad)"
                      transform={`rotate(${idx * 30} 200 200)`}
                    />
                  ))}
                  <circle cx="200" cy="200" r="24" fill="#fbbf24" fillOpacity="0.45" />
                </svg>
              </div>

              {/* Floating Golden Light Motes */}
              {SUNRISE_MOTES.map((mote, i) => {
                const rad = (mote.angle * Math.PI) / 180;
                const tx = Math.round(Math.cos(rad) * mote.dist);
                const ty = Math.round(Math.sin(rad) * mote.dist);
                return (
                  <span
                    key={i}
                    style={
                      {
                        left: `${celestialFX.x}px`,
                        top: `${celestialFX.y}px`,
                        width: `${mote.size}px`,
                        height: `${mote.size}px`,
                        animationDelay: mote.delay,
                        "--mote-tx": `${tx}px`,
                        "--mote-ty": `${ty}px`,
                      } as React.CSSProperties
                    }
                    className="absolute rounded-full bg-amber-400 animate-solar-mote gpu-layer"
                  />
                );
              })}
            </div>
          ) : (
            /* LIGHT -> DARK: Lunar Eclipse Aura, Twinkling Starfield & 2 Shooting Stars */
            <div className="absolute inset-0 gpu-layer">
              {/* Deep Indigo-Night Nebula Wash */}
              <div
                style={{
                  background: `radial-gradient(circle at ${celestialFX.x}px ${celestialFX.y}px, rgba(99, 102, 241, 0.3) 0%, rgba(30, 27, 75, 0.18) 38%, transparent 70%)`,
                }}
                className="absolute inset-0 animate-celestial-wash gpu-layer"
              />

              {/* Expanding Lunar Eclipse Halo at Toggle Button */}
              <div
                style={{
                  left: `${celestialFX.x}px`,
                  top: `${celestialFX.y}px`,
                }}
                className="absolute w-24 h-24 rounded-full border border-indigo-400/65 animate-lunar-halo gpu-layer"
              />

              {/* Single Vector SVG Starfield Constellation (Zero DOM Overdraw) */}
              <svg
                viewBox="0 0 1440 900"
                preserveAspectRatio="xMidYMid slice"
                className="absolute inset-0 w-full h-full gpu-layer"
              >
                {NIGHTFALL_STARS.map((star, idx) => (
                  <circle
                    key={idx}
                    cx={star.cx}
                    cy={star.cy}
                    r={star.r}
                    fill="#e0e7ff"
                    style={{
                      transformOrigin: `${star.cx}px ${star.cy}px`,
                      animationDelay: star.delay,
                    }}
                    className="animate-nightfall-star"
                  />
                ))}
              </svg>

              {/* Shooting Star #1 */}
              <span
                style={{ top: "14%", right: "18%", animationDelay: "30ms" }}
                className="absolute w-36 h-[2px] bg-gradient-to-l from-transparent via-indigo-300 to-white rounded-full animate-shooting-star gpu-layer"
              />
              {/* Shooting Star #2 */}
              <span
                style={{ top: "30%", right: "8%", animationDelay: "120ms" }}
                className="absolute w-28 h-[1.5px] bg-gradient-to-l from-transparent via-sky-300 to-white rounded-full animate-shooting-star gpu-layer"
              />
            </div>
          )}
        </div>
      )}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
