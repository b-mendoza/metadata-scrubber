import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, TerminalIcon } from "lucide-react";

const NAV_LINKS = [
  { name: "MODULES", href: "#features" },
  { name: "PROTOCOL", href: "#workflow" },
  { name: "ACCESS", href: "#pricing" },
];

export function GeminiNav() {
  return (
    <>
      <div className="fixed top-0 z-50 w-full border-b border-[#333] bg-[#050505]/90 backdrop-blur-md">
        <div className="container mx-auto flex h-10 items-center justify-between px-4 text-xs font-bold tracking-widest uppercase">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-[#39ff14]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#39ff14] opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#39ff14]"></span>
              </span>
              SYSTEM ONLINE
            </span>
            <span className="hidden text-neutral-600 md:inline">
              {"// LATENCY: 12ms"}
            </span>
            <span className="hidden text-neutral-600 md:inline">
              {"// ENCRYPTION: AES-256"}
            </span>
          </div>
          <div className="flex gap-4">
            <span className="text-neutral-500">
              BUILD: <span className="text-white">2026.02.18</span>
            </span>
            <span className="text-neutral-500">
              REGION: <span className="text-white">US-EAST</span>
            </span>
          </div>
        </div>
      </div>

      <nav className="fixed top-10 z-40 w-full border-b border-[#333] bg-[#050505]/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-20 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center border border-[#39ff14] bg-[#39ff14]/10">
              <TerminalIcon className="h-6 w-6 text-[#39ff14]" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tighter text-white uppercase">
                SpendGuard
              </span>
              <span className="text-[10px] tracking-[0.2em] text-[#39ff14]">
                INTELLIGENCE_UNIT
              </span>
            </div>
          </div>

          <div className="hidden gap-8 md:flex">
            {NAV_LINKS.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="group relative px-2 py-1 text-sm font-bold tracking-widest text-neutral-400 uppercase transition-colors hover:text-[#39ff14]"
              >
                {item.name}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-[#39ff14] transition-all group-hover:w-full" />
              </a>
            ))}
          </div>

          <Link
            to="/"
            className="group relative overflow-hidden border border-[#333] bg-neutral-900 px-6 py-2 text-sm font-bold tracking-wider text-white uppercase transition-all hover:border-[#39ff14] hover:text-[#39ff14]"
          >
            <span className="relative z-10 flex items-center gap-2">
              Initialize
              <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
            <div className="absolute inset-0 -translate-x-full bg-[#39ff14]/10 transition-transform group-hover:translate-x-0" />
          </Link>
        </div>
      </nav>
    </>
  );
}
