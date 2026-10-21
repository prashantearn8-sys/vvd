/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { logger } from "../utils/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("Uncaught application error in ErrorBoundary:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-zinc-100 flex flex-col items-center justify-center p-6 font-mono selection:bg-white selection:text-black">
          <div className="w-full max-w-2xl border-2 border-zinc-700 bg-zinc-950 p-6 md:p-8 rounded-xl shadow-[6px_6px_0px_0px_#ffffff] space-y-6">
            <div className="flex items-center gap-3 border-b-2 border-zinc-800 pb-4">
              <div className="w-10 h-10 border-2 border-red-500 bg-red-950/40 text-red-400 flex items-center justify-center rounded">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 className="text-base md:text-lg font-bold uppercase tracking-tight text-white">
                  ERROR 404 / SYSTEM_EXCEPTION // RUNTIME ERROR
                </h1>
                <p className="text-xs text-zinc-400">
                  An unexpected execution fault occurred within the local runtime thread.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] uppercase font-bold text-zinc-400">
                DIAGNOSTIC_TRACE:
              </span>
              <div className="p-3 bg-zinc-900 border border-zinc-700 rounded text-xs text-red-400 overflow-x-auto font-mono whitespace-pre-wrap max-h-48">
                {this.state.error?.toString() || "Unknown execution exception."}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3 bg-white text-black hover:bg-zinc-200 border-2 border-white font-bold text-xs uppercase flex items-center justify-center gap-2 cursor-pointer transition-all shadow-[2px_2px_0px_0px_#ffffff] active:translate-y-0.5"
                aria-label="Reload System"
              >
                <RefreshCw className="w-4 h-4" />
                <span>RELOAD SYSTEM</span>
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="py-3 px-6 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 border-2 border-zinc-700 font-bold text-xs uppercase cursor-pointer transition-all active:translate-y-0.5"
                aria-label="Try Recovering State"
              >
                DISMISS ERROR
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
