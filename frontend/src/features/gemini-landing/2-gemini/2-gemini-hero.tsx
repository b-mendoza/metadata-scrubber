import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, ScanIcon } from "lucide-react";

export function GeminiTwoHero() {
  return (
    <header className="relative z-10 container mx-auto grid min-h-[90vh] grid-cols-1 items-center gap-12 px-6 pt-32 pb-20 lg:grid-cols-12">
      <div className="flex flex-col gap-8 lg:col-span-7">
        <div className="inline-flex w-fit items-center gap-3 border border-black bg-white px-4 py-2 font-mono text-xs font-bold tracking-widest uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#CCFF00] opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full border border-black bg-[#CCFF00]"></span>
          </span>
          <span>System Operational // v2.4.0</span>
        </div>
        <h1 className="text-7xl leading-[0.85] font-black tracking-tighter uppercase md:text-9xl">
          Financial <br />
          <span className="bg-linear-to-r from-black via-neutral-700 to-neutral-500 bg-clip-text text-transparent">
            Control
          </span>
          <br />
          Reimagined
        </h1>
        <p className="max-w-xl border-l-8 border-[#CCFF00] py-1 pl-8 text-2xl font-bold text-neutral-800 md:text-3xl">
          Stop leaking revenue. Automate your invoices with military-grade OCR
          and 3-way matching.
        </p>
        <div className="mt-8 flex flex-col gap-6 sm:flex-row">
          <Link
            to="/"
            className="group flex items-center justify-center gap-4 border-2 border-black bg-[#CCFF00] px-10 py-5 text-xl font-black text-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none"
          >
            DEPLOY SYSTEM
            <ArrowRightIcon
              className="h-6 w-6 transition-transform group-hover:translate-x-2"
              strokeWidth={3}
            />
          </Link>
          <button
            type="button"
            className="group flex items-center justify-center gap-4 border-2 border-black bg-white px-10 py-5 text-xl font-black text-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none"
          >
            VIEW DOCS
          </button>
        </div>
      </div>
      <HeroScanCard />
    </header>
  );
}

function HeroScanCard() {
  return (
    <div className="relative flex justify-center lg:col-span-5">
      <div className="relative aspect-3/4 w-full max-w-md border-2 border-black bg-black shadow-[16px_16px_0px_0px_#CCFF00]">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1614028674026-a65e31bfd27c?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-50 mix-blend-luminosity grayscale"></div>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(204, 255, 0, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(204, 255, 0, 0.1) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        ></div>
        <div className="absolute inset-0 flex flex-col justify-between p-8 font-mono text-[#CCFF00]">
          <div className="flex items-start justify-between border-b border-[#CCFF00]/30 pb-4">
            <ScanIcon className="h-16 w-16" strokeWidth={1.5} />
            <div className="text-right text-xs leading-relaxed opacity-80">
              ID: SG-2026-X
              <br />
              SECURE LINK: ACTIVE
              <br />
              LAT: 13.6929 N<br />
              LON: 89.2182 W
            </div>
          </div>
          <div className="space-y-4">
            {[
              [
                "Detected Vendor",
                "OFFICE DEPOT INC.",
                "text-xl font-bold tracking-tighter",
              ],
              [
                "Total Amount",
                "$1,245.00",
                "text-3xl font-bold tracking-tighter text-white",
              ],
            ].map(([label, value, className]) => (
              <div
                key={label}
                className="border-l-2 border-[#CCFF00] bg-black/80 p-4 backdrop-blur-sm"
              >
                <div className="mb-1 text-[10px] tracking-widest text-white/60 uppercase">
                  {label}
                </div>
                <div className={className}>{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="animate-scan pointer-events-none absolute inset-0 z-20 h-[4px] w-full bg-[#CCFF00] shadow-[0_0_40px_#CCFF00]"></div>
        <div className="absolute top-0 left-0 h-8 w-8 border-t-4 border-l-4 border-[#CCFF00]"></div>
        <div className="absolute top-0 right-0 h-8 w-8 border-t-4 border-r-4 border-[#CCFF00]"></div>
        <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-[#CCFF00]"></div>
        <div className="absolute right-0 bottom-0 h-8 w-8 border-r-4 border-b-4 border-[#CCFF00]"></div>
      </div>
    </div>
  );
}
