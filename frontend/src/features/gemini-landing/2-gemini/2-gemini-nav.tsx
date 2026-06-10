import { Link } from "@tanstack/react-router";
import { MenuIcon, ShieldCheckIcon, XIcon } from "lucide-react";

import { GEMINI_TWO_NAV_ITEMS } from "./2-gemini-data";

interface GeminiTwoNavProps {
  readonly isScrolled: boolean;
  readonly isMenuOpen: boolean;
  readonly onToggleMenu: () => void;
  readonly onCloseMenu: () => void;
}

export function GeminiTwoNav({
  isScrolled,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
}: GeminiTwoNavProps) {
  return (
    <>
      <nav
        className={`fixed top-0 right-0 left-0 z-50 border-b border-black transition-all duration-300 ${isScrolled ? "bg-[#E5E5E5]/90 py-4 backdrop-blur-md" : "bg-[#E5E5E5] py-6"}`}
      >
        <div className="container mx-auto flex items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center bg-black text-[#CCFF00]">
              <ShieldCheckIcon size={24} strokeWidth={3} />
            </div>
            <span className="text-3xl font-black tracking-tighter uppercase">
              SpendGuard
            </span>
          </div>

          <div className="hidden items-center gap-8 font-mono text-sm font-bold tracking-wide uppercase md:flex">
            {GEMINI_TWO_NAV_ITEMS.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className="group relative overflow-hidden px-1 py-1"
              >
                <span className="relative z-10 transition-colors group-hover:text-[#CCFF00]">
                  {item}
                </span>
                <span className="absolute inset-0 -translate-y-full bg-black transition-transform duration-300 group-hover:translate-y-0"></span>
              </a>
            ))}
            <Link
              to="/"
              className="relative overflow-hidden border border-black bg-black px-6 py-2 text-[#CCFF00] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
            >
              Start Now
            </Link>
          </div>

          <button type="button" className="md:hidden" onClick={onToggleMenu}>
            {isMenuOpen ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {isMenuOpen ? (
        <div className="fixed inset-0 z-40 bg-[#E5E5E5] px-6 pt-24 md:hidden">
          <div className="flex flex-col gap-8 text-4xl font-black tracking-tighter uppercase">
            {GEMINI_TWO_NAV_ITEMS.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                onClick={onCloseMenu}
                className="border-b border-black pb-2"
              >
                {item}
              </a>
            ))}
            <Link to="/" className="bg-black p-4 text-center text-[#CCFF00]">
              Start Now
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
