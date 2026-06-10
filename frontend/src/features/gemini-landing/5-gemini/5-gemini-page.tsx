import { GeminiContentSections } from "./5-gemini-content-sections";
import { GeminiHeroSection } from "./5-gemini-hero-section";
import { GeminiPageStyles } from "./5-gemini-page-styles";

export function GeminiLandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050505] font-mono text-zinc-300 selection:bg-cyan-500/30 selection:text-cyan-200">
      <GeminiPageStyles />
      <GeminiBackground />
      <GeminiNavigation />
      <GeminiHeroSection />
      <GeminiContentSections />
    </div>
  );
}

function GeminiBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] bg-size-[4rem_4rem] opacity-20" />
      <div className="absolute top-0 right-0 left-0 h-px bg-linear-to-r from-transparent via-cyan-900/50 to-transparent" />
    </div>
  );
}

function GeminiNavigation() {
  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-zinc-800/50 bg-[#050505]/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-8 items-center justify-center border border-cyan-500/30 bg-cyan-950/10">
            <div className="absolute inset-0 animate-pulse bg-cyan-500/10" />
            <div className="h-2 w-2 bg-cyan-400" />
            <div className="absolute top-0 left-0 h-1 w-1 bg-cyan-500" />
            <div className="absolute top-0 right-0 h-1 w-1 bg-cyan-500" />
            <div className="absolute bottom-0 left-0 h-1 w-1 bg-cyan-500" />
            <div className="absolute right-0 bottom-0 h-1 w-1 bg-cyan-500" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white uppercase">
            Spend<span className="text-cyan-500">Guard</span>
          </span>
        </div>

        <div className="hidden gap-8 text-xs font-medium tracking-widest text-zinc-500 uppercase md:flex">
          {["Intelligence", "Protocol", "Network"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="transition-colors hover:text-cyan-400"
            >
              {item}
            </a>
          ))}
        </div>

        <button
          type="button"
          className="group relative overflow-hidden border border-cyan-900 bg-cyan-950/10 px-6 py-2 text-xs font-bold tracking-widest text-cyan-400 uppercase transition-all hover:border-cyan-500/50 hover:bg-cyan-950/30"
        >
          <span className="relative z-10">Initialize</span>
          <div className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-cyan-500/10 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
        </button>
      </div>
    </nav>
  );
}
