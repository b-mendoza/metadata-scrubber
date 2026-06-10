import { GEMINI_TWO_MARQUEE_MARKERS } from "./2-gemini-data";

export function GeminiTwoMarquee() {
  return (
    <div className="relative z-20 scale-105 rotate-1 overflow-hidden border-y-2 border-black bg-[#CCFF00] py-6 shadow-xl">
      <div className="animate-marquee flex gap-16 text-4xl font-black tracking-tight whitespace-nowrap text-black uppercase">
        {GEMINI_TWO_MARQUEE_MARKERS.map((marker) => (
          <span key={marker} className="flex items-center gap-8">
            Automated Spend Intelligence <span className="text-xl">●</span>{" "}
            99.9% Accuracy <span className="text-xl">●</span> DTE Integration{" "}
            <span className="text-xl">●</span>
          </span>
        ))}
      </div>
    </div>
  );
}
