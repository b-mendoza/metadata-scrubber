import { Link } from "@tanstack/react-router";
import { CpuIcon, ScanLineIcon, ZapIcon } from "lucide-react";

export function GeminiHero() {
  return (
    <section className="relative container mx-auto px-6 py-20 lg:py-32">
      <div className="absolute top-0 left-6 h-full w-px bg-linear-to-b from-[#333] via-[#333] to-transparent" />
      <div className="absolute top-0 right-6 h-full w-px bg-linear-to-b from-[#333] via-[#333] to-transparent" />

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        <div className="flex flex-col justify-center">
          <div className="mb-6 inline-flex items-center gap-2 border-l-2 border-[#39ff14] bg-[#39ff14]/5 px-4 py-2 text-sm text-[#39ff14]">
            <CpuIcon className="h-4 w-4" />
            <span>AI_CORE ACTIVATED // READY FOR INPUT</span>
          </div>

          <h1 className="mb-6 text-5xl leading-none font-black tracking-tighter text-white uppercase lg:text-7xl">
            FINANCIAL
            <br />
            <span className="bg-[linear-gradient(45deg,#fff,#666)] bg-clip-text text-transparent">
              OPERATIONS
            </span>
            <br />
            <span className="text-[#39ff14]">AUTOMATED</span>
          </h1>

          <p className="mb-10 max-w-lg border-l border-[#333] pl-6 text-lg leading-relaxed text-neutral-400">
            Execute financial workflows with military precision.
            <br />
            <span className="text-white">Zero error tolerance.</span>
            <br />
            Instant optical character recognition.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              to="/"
              className="group relative flex items-center gap-3 bg-[#39ff14] px-8 py-4 font-bold tracking-wider text-black uppercase transition-all hover:bg-[#32e612] hover:shadow-[0_0_20px_rgba(57,255,20,0.4)]"
            >
              <ZapIcon className="h-5 w-5 fill-black" />
              Deploy System
            </Link>
            <button
              type="button"
              className="group flex items-center gap-3 border border-[#333] bg-transparent px-8 py-4 font-bold tracking-wider text-white uppercase transition-all hover:border-white hover:bg-white/5"
            >
              <ScanLineIcon className="h-5 w-5" />
              View Telemetry
            </button>
          </div>
        </div>

        <div className="relative mt-12 lg:mt-0">
          <div className="relative border border-[#333] bg-black p-2 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#333] bg-[#111] px-4 py-2">
              <div className="text-xs text-neutral-500">
                TERMINAL_01 // spend_guard.exe
              </div>
              <div className="flex gap-2">
                <div className="h-3 w-3 bg-[#333]"></div>
                <div className="h-3 w-3 bg-[#333]"></div>
                <div className="h-3 w-3 bg-[#39ff14]"></div>
              </div>
            </div>

            <div className="h-[400px] overflow-hidden p-6 font-mono text-sm leading-relaxed text-neutral-400">
              <div className="mb-4 text-[#39ff14]">
                &gt; INITIATING SEQUENCE...
              </div>
              <div className="mb-2">
                &gt; LOADING MODULE:{" "}
                <span className="text-white">OCR_ENGINE</span>
              </div>
              <div className="mb-2 pl-4 text-xs text-neutral-600">
                [OK] Tesseract loaded (12ms)
                <br />
                [OK] Neural net weights initialized
              </div>
              <div className="mb-2">
                &gt; CONNECTING TO:{" "}
                <span className="text-white">DTE_NETWORK</span>
              </div>
              <div className="mb-2 pl-4 text-xs text-neutral-600">
                [OK] Secure handshake established
                <br />
                [OK] Token verified
              </div>
              <div className="mb-4">&gt; SCANNING INVOICE #INV-2026-001...</div>

              <div className="mt-8 border border-[#333] bg-[#0a0a0a] p-4">
                <div className="mb-2 flex justify-between border-b border-[#333] pb-2 text-xs font-bold text-white">
                  <span>DETECTED ENTITIES</span>
                  <span className="text-[#39ff14]">CONFIDENCE: 99.9%</span>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <span className="text-neutral-500">VENDOR:</span>
                  <span className="text-[#39ff14]">TECH_CORP_INC</span>
                  <span className="text-neutral-500">DATE:</span>
                  <span className="text-white">2026-02-18</span>
                  <span className="text-neutral-500">TOTAL:</span>
                  <span className="text-white">$4,250.00</span>
                  <span className="text-neutral-500">TAX_ID:</span>
                  <span className="text-white">99-1234567</span>
                </div>
              </div>

              <div className="mt-4 animate-pulse text-[#39ff14]">
                &gt; MATCH CONFIRMED. PROCESSING PAYMENT...
                <span className="animate-blink">_</span>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%] mix-blend-overlay" />
          </div>

          <div className="absolute -right-4 -bottom-4 -z-10 h-full w-full border border-[#333] bg-[#39ff14]/5" />
        </div>
      </div>
    </section>
  );
}
