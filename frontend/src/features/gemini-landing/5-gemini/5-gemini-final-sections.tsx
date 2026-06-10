import { GlobeIcon } from "lucide-react";

export function GeminiFinalSections() {
  return (
    <>
      <CtaSection />
      <GeminiFooter />
    </>
  );
}

function CtaSection() {
  return (
    <section className="relative container mx-auto overflow-hidden px-6 py-32 text-center">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-cyan-900/10 via-transparent to-transparent" />

      <div className="relative z-10 mx-auto max-w-3xl space-y-8">
        <h2 className="text-4xl font-bold tracking-tighter text-white uppercase md:text-6xl">
          Initiate <span className="text-cyan-500">Control</span>
        </h2>
        <p className="text-lg text-zinc-400">
          Deploy Spend Guard across your organization today.
          <br />
          Recover 20% of AP processing time immediately.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            type="button"
            className="w-full bg-white px-8 py-4 font-bold tracking-wide text-black uppercase transition-colors hover:bg-zinc-200 sm:w-auto"
          >
            Schedule Demo
          </button>
          <button
            type="button"
            className="w-full border border-zinc-800 px-8 py-4 font-bold tracking-wide text-white uppercase transition-colors hover:bg-zinc-900 sm:w-auto"
          >
            Read Documentation
          </button>
        </div>
      </div>
    </section>
  );
}

function GeminiFooter() {
  return (
    <footer className="border-t border-zinc-800 bg-[#020202] py-12">
      <div className="container mx-auto flex flex-col items-center justify-between gap-8 px-6 font-mono text-xs text-zinc-600 md:flex-row">
        <div className="flex items-center gap-2">
          <GlobeIcon className="h-4 w-4" />
          <span>SAN SALVADOR, SV // EST. 2024</span>
        </div>
        <div className="flex gap-8 tracking-widest uppercase">
          <a href="/" className="transition-colors hover:text-cyan-500">
            Legal
          </a>
          <a href="/" className="transition-colors hover:text-cyan-500">
            Privacy
          </a>
          <a href="/" className="transition-colors hover:text-cyan-500">
            Status
          </a>
        </div>
      </div>
    </footer>
  );
}
