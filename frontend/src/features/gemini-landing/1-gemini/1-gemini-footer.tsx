import { ShieldCheckIcon } from "lucide-react";

export function GeminiOneFooter() {
  return (
    <footer className="border-t border-white/10 bg-black py-12">
      <div className="container mx-auto flex flex-col items-center justify-between gap-8 px-6 md:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center bg-[#ccff00]">
            <ShieldCheckIcon className="h-4 w-4 text-black" />
          </div>
          <span className="font-display text-lg font-bold">SpendGuard</span>
        </div>
        <div className="flex gap-8 font-mono text-sm text-gray-500">
          {["Documentation", "API Status", "Legal"].map((item) => (
            <button
              key={item}
              type="button"
              className="cursor-pointer transition-colors hover:text-[#ccff00]"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="font-mono text-xs text-gray-600">
          © 2026 SPEND GUARD INC.
        </div>
      </div>
    </footer>
  );
}
