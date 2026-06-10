import { ArrowRightIcon, MenuIcon, ShieldCheckIcon } from "lucide-react";

import { NAV_LINKS } from "./1-gemini-data";

export function GeminiOneNav({ isScrolled }: { readonly isScrolled: boolean }) {
  return (
    <nav
      className={`fixed top-0 right-0 left-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "border-b border-white/5 bg-[#030305]/80 py-4 backdrop-blur-md"
          : "bg-transparent py-6"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-6">
        <div className="group flex cursor-pointer items-center gap-3">
          <div className="flex h-10 w-10 transform items-center justify-center rounded-none bg-[#ccff00] transition-transform duration-500 group-hover:rotate-180">
            <ShieldCheckIcon className="h-6 w-6 text-black" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">
            SpendGuard
          </span>
        </div>
        <div className="font-body hidden items-center gap-8 text-sm font-medium md:flex">
          {NAV_LINKS.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="group relative text-gray-400 transition-colors hover:text-[#ccff00]"
            >
              {item}
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-[#ccff00] transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </div>
        <button
          type="button"
          className="font-body hidden items-center gap-2 rounded-none border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-bold backdrop-blur-sm transition-all duration-300 hover:bg-[#ccff00] hover:text-black md:flex"
        >
          Start Trial <ArrowRightIcon className="h-4 w-4" />
        </button>
        <button type="button" className="text-white md:hidden">
          <MenuIcon className="h-6 w-6" />
        </button>
      </div>
    </nav>
  );
}
