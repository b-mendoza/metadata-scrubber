import { Link } from "@tanstack/react-router";

export function GeminiTwoPricing() {
  return (
    <section
      id="pricing"
      className="relative container mx-auto flex flex-col items-center px-6 py-40 text-center"
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03]">
        <span className="text-[20vw] font-black uppercase">Start</span>
      </div>
      <h2 className="mb-12 max-w-5xl text-6xl leading-[0.85] font-black tracking-tighter uppercase md:text-8xl">
        Ready to take <br />
        <span className="bg-[#CCFF00] px-4 text-black">control?</span>
      </h2>
      <p className="mb-16 max-w-2xl text-2xl font-bold md:text-3xl">
        Join the platform processing over{" "}
        <span className="underline decoration-[#CCFF00] decoration-4 underline-offset-4">
          $50M
        </span>{" "}
        in secure transactions annually.
      </p>
      <Link
        to="/"
        className="group relative overflow-hidden border-2 border-black bg-black px-16 py-8 text-3xl font-black text-white shadow-[12px_12px_0px_0px_#CCFF00] transition-all hover:translate-x-[6px] hover:translate-y-[6px] hover:shadow-none"
      >
        <span className="relative z-10 transition-colors group-hover:text-[#CCFF00]">
          START FREE TRIAL
        </span>
        <div className="absolute inset-0 z-0 -translate-x-full bg-neutral-900 transition-transform duration-300 group-hover:translate-x-0"></div>
      </Link>
    </section>
  );
}
