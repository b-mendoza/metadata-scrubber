import { ShieldCheckIcon } from "lucide-react";

import { GEMINI_TWO_FOOTER_COLUMNS } from "./2-gemini-data";

export function GeminiTwoFooter() {
  return (
    <footer className="border-t-2 border-black bg-black pt-24 pb-12 text-white">
      <div className="container mx-auto px-6">
        <div className="mb-24 grid grid-cols-1 gap-16 md:grid-cols-12">
          <div className="col-span-1 md:col-span-5">
            <div className="mb-8 flex items-center gap-3 text-[#CCFF00]">
              <ShieldCheckIcon size={48} strokeWidth={2} />
              <span className="text-5xl font-black tracking-tighter text-white uppercase">
                SpendGuard
              </span>
            </div>
            <p className="max-w-md font-mono text-lg text-neutral-400">
              Building automated financial infrastructure for the modern
              enterprise. San Salvador, El Salvador.
            </p>
          </div>

          {GEMINI_TWO_FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className={column.className}>
              <h4 className="mb-6 text-sm font-black tracking-widest text-[#CCFF00] uppercase">
                {column.title}
              </h4>
              <ul className="space-y-4 font-bold tracking-tight uppercase">
                {column.links.map((link) => (
                  <li key={link}>
                    <a
                      href="/"
                      className="block transition-all hover:pl-2 hover:text-[#CCFF00]"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between border-t border-neutral-800 pt-12 font-mono text-sm text-neutral-500 uppercase md:flex-row">
          <div>© 2026 SpendGuard Systems</div>
          <div className="mt-4 flex gap-8 md:mt-0">
            <a href="/privacy" className="hover:text-white">
              Privacy Policy
            </a>
            <a href="/terms" className="hover:text-white">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
