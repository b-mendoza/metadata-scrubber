import { PieChartIcon, ZapIcon } from "lucide-react";

import { GeminiOneDashboardMockup } from "./1-gemini-dashboard";

export function GeminiOneHero() {
  return (
    <section className="relative overflow-hidden px-6 pt-40 pb-20">
      <div className="container mx-auto max-w-7xl">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div className="relative z-10">
            <div className="mb-8 inline-flex items-center gap-2 border border-[#ccff00]/20 bg-[#ccff00]/5 px-3 py-1 font-mono text-xs tracking-wider text-[#ccff00] uppercase">
              <span className="h-2 w-2 animate-pulse bg-[#ccff00]" />
              <span>El Salvador First</span>
            </div>
            <h1 className="font-display mb-8 bg-linear-to-br from-white via-white to-gray-500 bg-clip-text text-6xl leading-[0.9] font-extrabold tracking-tighter text-transparent md:text-8xl">
              TOTAL <br />
              SPEND <br />
              <span className="bg-linear-to-r from-[#ccff00] to-green-400 bg-clip-text text-transparent">
                CONTROL
              </span>
            </h1>
            <p className="font-body mb-10 max-w-lg border-l-2 border-[#ccff00]/30 pl-6 text-lg leading-relaxed text-gray-400">
              The definitive financial intelligence platform for modern
              enterprises. Automate DTE, 3-way matching, and photo OCR with
              military-grade precision.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <button
                type="button"
                className="font-display group flex items-center justify-center gap-2 bg-[#ccff00] px-8 py-4 text-lg font-bold tracking-tight text-black transition-colors hover:bg-white"
              >
                Deploy Now
                <ZapIcon className="h-5 w-5 transition-all group-hover:fill-black" />
              </button>
              <button
                type="button"
                className="font-display flex items-center justify-center gap-2 border border-white/20 bg-transparent px-8 py-4 text-lg font-bold tracking-tight text-white transition-colors hover:bg-white/5"
              >
                View Demo
                <PieChartIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          <GeminiOneDashboardMockup />
        </div>
      </div>
    </section>
  );
}
