import { TICKER_MARKERS } from "./1-gemini-data";

export function GeminiOneTicker() {
  return (
    <div className="w-full overflow-hidden border-y border-white/10 bg-black/50 py-4">
      <div className="animate-marquee flex whitespace-nowrap">
        {TICKER_MARKERS.map((marker) => (
          <div key={marker} className="mx-8 flex items-center gap-8">
            <span className="font-display text-2xl font-bold text-white/20 uppercase">
              Intelligent Spend Protocol
            </span>
            <span className="h-2 w-2 rounded-full bg-[#ccff00]" />
          </div>
        ))}
      </div>
    </div>
  );
}
