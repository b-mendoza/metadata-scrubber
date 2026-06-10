const MUTED_TICKER_INTERVAL = 2;
const FIRST_TICKER_INDEX = 0;

const TICKER_ITEMS = Array.from("ABCDEFGHIJ", (id, index) => ({
  id,
  isMuted: index % MUTED_TICKER_INTERVAL === FIRST_TICKER_INDEX,
}));

export function GeminiTicker() {
  return (
    <section className="overflow-hidden border-y border-[#333] bg-[#0a0a0a] py-6">
      <div className="flex w-full whitespace-nowrap">
        <div className="animate-marquee flex items-center gap-16 text-2xl font-black tracking-tighter text-[#222] italic">
          {TICKER_ITEMS.map((item) => (
            <span
              key={item.id}
              className={item.isMuted ? "text-[#333]" : "text-neutral-800"}
            >
              AUTOMATION // PRECISION // SPEED
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
