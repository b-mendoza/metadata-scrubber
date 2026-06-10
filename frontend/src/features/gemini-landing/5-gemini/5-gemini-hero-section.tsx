import { ArrowRightIcon } from "lucide-react";

export function GeminiHeroSection() {
  return (
    <header className="relative z-10 container mx-auto px-6 pt-32 pb-24 md:pt-48 md:pb-32">
      <div className="grid items-center gap-16 lg:grid-cols-2">
        <div className="space-y-10">
          <div className="gemini-reveal-up">
            <div className="mb-6 inline-flex items-center gap-2 border border-lime-500/20 bg-lime-500/5 px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-lime-400 uppercase">
              <span className="h-1.5 w-1.5 animate-pulse bg-lime-400" />
              System Online v2.0
            </div>
            <h1 className="text-5xl leading-[0.9] font-black tracking-tighter text-white uppercase md:text-7xl lg:text-8xl">
              Fiscal <br />
              <span className="bg-linear-to-r from-cyan-400 via-cyan-200 to-white bg-clip-text text-transparent">
                Dominance
              </span>
            </h1>
          </div>

          <p className="gemini-reveal-left max-w-xl border-l-2 border-zinc-800 pl-6 text-sm leading-relaxed text-zinc-400 md:text-base">
            Precision-engineered spend intelligence for the modern enterprise.
            Eliminate variance with automated 3-way matching and DTE
            synchronization.
            <span className="mt-2 block text-cyan-500">
              99.9% accuracy verified.
            </span>
          </p>

          <div className="gemini-reveal-actions flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              className="group clip-path-slant relative flex items-center justify-center gap-3 bg-cyan-500 px-8 py-4 font-bold tracking-wide text-black uppercase transition-colors hover:bg-cyan-400"
            >
              Deploy System
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              type="button"
              className="group flex items-center justify-center gap-3 border border-zinc-800 bg-zinc-900/50 px-8 py-4 font-bold tracking-wide text-white uppercase transition-colors hover:border-zinc-600"
            >
              View Diagnostics
            </button>
          </div>
        </div>

        <HeroScanner />
      </div>
    </header>
  );
}

function HeroScanner() {
  return (
    <div className="gemini-reveal-scale relative aspect-square overflow-hidden border border-zinc-800 bg-black/50 backdrop-blur-sm md:aspect-4/3">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-size-[20px_20px]" />
      <div className="absolute top-4 left-4 h-4 w-4 border-t border-l border-cyan-500/50" />
      <div className="absolute top-4 right-4 h-4 w-4 border-t border-r border-cyan-500/50" />
      <div className="absolute bottom-4 left-4 h-4 w-4 border-b border-l border-cyan-500/50" />
      <div className="absolute right-4 bottom-4 h-4 w-4 border-r border-b border-cyan-500/50" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-64 w-64 animate-[spin_10s_linear_infinite] rounded-full border border-cyan-900/50 md:h-80 md:w-80">
          <div className="absolute top-0 left-1/2 h-2 w-2 -translate-x-1/2 bg-cyan-500 shadow-[0_0_10px_#06b6d4]" />
        </div>
        <div className="absolute h-48 w-48 animate-[spin_15s_linear_infinite_reverse] rounded-full border border-cyan-500/20" />
        <div className="absolute h-32 w-32 rounded-full border border-cyan-500/10" />
        <div className="animate-scan-vertical absolute inset-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-linear-to-b from-transparent via-cyan-500/10 to-transparent" />
      </div>

      <div className="absolute bottom-8 left-8 space-y-2 font-mono text-[10px] text-cyan-400/80">
        <div className="flex gap-4">
          <span className="opacity-50">TARGET</span>
          <span>INV-2024-X99</span>
        </div>
        <div className="flex gap-4">
          <span className="opacity-50">STATUS</span>
          <span className="animate-pulse text-lime-400">MATCHED</span>
        </div>
        <div className="flex gap-4">
          <span className="opacity-50">CONFIDENCE</span>
          <span>99.98%</span>
        </div>
      </div>
    </div>
  );
}
