import { Link } from "@tanstack/react-router";
import { ActivityIcon } from "lucide-react";

export function GeminiCta() {
  return (
    <section className="container mx-auto px-6 py-32 text-center">
      <div className="relative mx-auto max-w-4xl border border-[#333] bg-[#080808] p-16">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#050505] px-4 text-sm font-bold tracking-widest text-[#39ff14] uppercase">
          System Ready
        </div>

        <h2 className="mb-6 text-4xl font-black text-white uppercase md:text-6xl">
          Initialize Your
          <br />
          Operation
        </h2>

        <p className="mb-10 text-lg text-neutral-400">
          Join the elite organizations automating their financial intelligence.
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-[#39ff14] px-12 py-5 text-lg font-bold tracking-widest text-black uppercase hover:bg-[#32e612]"
        >
          <ActivityIcon className="h-5 w-5" />
          Start Sequence
        </Link>
      </div>
    </section>
  );
}
