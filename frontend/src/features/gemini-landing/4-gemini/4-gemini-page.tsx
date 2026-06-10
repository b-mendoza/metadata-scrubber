import { ArrowRightIcon } from "lucide-react";

import { GeminiCapabilitiesSpecs } from "./4-gemini-capabilities-specs";
import { GeminiCta } from "./4-gemini-cta";
import { GeminiHeroDashboard } from "./4-gemini-hero-dashboard";
import { GeminiPageStyles } from "./4-gemini-styles";

export function GeminiLandingPage() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#030305] font-mono text-zinc-300 selection:bg-cyan-500/30 selection:text-cyan-100">
      <GeminiPageStyles />

      {/* Global Tech Overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 flex flex-col justify-between p-4 opacity-40 mix-blend-overlay">
        <div className="flex justify-between">
          <div className="h-4 w-4 border-t-2 border-l-2 border-cyan-500/50" />
          <div className="h-4 w-4 border-t-2 border-r-2 border-cyan-500/50" />
        </div>
        <div className="flex justify-between">
          <div className="h-4 w-4 border-b-2 border-l-2 border-cyan-500/50" />
          <div className="h-4 w-4 border-r-2 border-b-2 border-cyan-500/50" />
        </div>
      </div>
      <div className="scanline-overlay pointer-events-none fixed inset-0 z-40 opacity-20" />
      <div className="technical-grid pointer-events-none fixed inset-0 z-0" />

      {/* Navigation / HUD Header */}
      <header className="fixed top-0 z-40 w-full border-b border-white/5 bg-[#030305]/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-8 w-8 items-center justify-center bg-cyan-950 font-bold text-cyan-400">
              <span className="absolute -inset-0.5 border border-cyan-500/30 opacity-50" />
              <span>SG</span>
            </div>
            <div className="text-sm font-bold tracking-widest text-white uppercase">
              Spend<span className="text-cyan-500">Guard</span>
              <span className="ml-2 text-[10px] text-zinc-500">v2.0.4-ESA</span>
            </div>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <div className="flex gap-1">
              <div className="h-1 w-1 bg-cyan-500" />
              <div className="h-1 w-1 bg-cyan-500/50" />
              <div className="h-1 w-1 bg-cyan-500/20" />
            </div>
            <div className="text-xs tracking-widest text-zinc-500 uppercase">
              System Operational
            </div>
          </div>
          <button
            type="button"
            className="group relative overflow-hidden bg-zinc-900 px-6 py-2 text-xs font-bold tracking-widest text-white uppercase transition-colors hover:bg-zinc-800 hover:text-cyan-400"
          >
            <span className="relative z-10 flex items-center gap-2">
              Access Terminal <ArrowRightIcon className="h-3 w-3" />
            </span>
            <div className="absolute inset-0 -translate-x-full bg-cyan-500/10 transition-transform group-hover:translate-x-0" />
            <div className="absolute bottom-0 left-0 h-px w-full bg-cyan-500/50" />
          </button>
        </div>
      </header>

      <main className="relative z-10 pt-24 pb-20">
        <GeminiHeroDashboard />
        <GeminiCapabilitiesSpecs />
        <GeminiCta />
      </main>

      {/* Technical Footer */}
      <footer className="border-t border-zinc-900 bg-[#020203] py-12 text-xs text-zinc-600">
        <div className="container mx-auto flex flex-col items-center justify-between gap-6 px-4 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 bg-cyan-900" />
            <span className="font-bold tracking-widest text-zinc-400 uppercase">
              Spend Guard // SYS.ROOT
            </span>
          </div>
          <div>© 2026 SPEND GUARD INC. ALL RIGHTS RESERVED.</div>
          <div className="flex gap-6">
            <button type="button" className="hover:text-cyan-500">
              STATUS
            </button>
            <button type="button" className="hover:text-cyan-500">
              DOCS
            </button>
            <button type="button" className="hover:text-cyan-500">
              API
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
