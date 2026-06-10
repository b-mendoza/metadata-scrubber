import type { ReactNode } from "react";

import { FEATURE_ITEMS } from "./1-gemini-data";

export function GeminiOneFeatures() {
  return (
    <section id="features" className="relative container mx-auto px-6 py-32">
      <div className="mb-20 max-w-xl">
        <h2 className="font-display mb-6 text-4xl font-bold md:text-5xl">
          SYSTEM <span className="text-[#ccff00]">CAPABILITIES</span>
        </h2>
        <p className="text-lg leading-relaxed text-gray-400">
          Deploying next-generation financial tools to optimize your workflow.
          Engineered for speed, accuracy, and compliance.
        </p>
      </div>
      <div className="grid gap-1 md:grid-cols-2 lg:grid-cols-3">
        {FEATURE_ITEMS.map((item) => (
          <BentoItem key={item.number} {...item} />
        ))}
      </div>
    </section>
  );
}

function BentoItem({
  icon,
  title,
  desc,
  number,
  active = false,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly desc: string;
  readonly number: string;
  readonly active?: boolean;
}) {
  return (
    <div
      className={`group relative border border-white/5 bg-white/2 p-10 transition-all duration-300 hover:bg-white/4 ${active ? "bg-white/4" : ""} `}
    >
      <div className="font-display absolute top-0 right-0 bg-linear-to-b from-white to-transparent bg-clip-text p-4 text-4xl font-bold text-transparent opacity-20 transition-opacity group-hover:opacity-40">
        {number}
      </div>
      <div
        className={`mb-6 w-fit border p-4 ${active ? "border-[#ccff00] text-[#ccff00]" : "border-white/10 text-gray-400"} transition-colors group-hover:border-[#ccff00] group-hover:text-[#ccff00]`}
      >
        {icon}
      </div>
      <h3 className="font-display mb-4 text-2xl font-bold transition-transform duration-300 group-hover:translate-x-2">
        {title}
      </h3>
      <p className="font-body max-w-xs leading-relaxed text-gray-400 group-hover:text-gray-300">
        {desc}
      </p>
      <div className="absolute bottom-0 left-0 h-px w-0 bg-[#ccff00] transition-all duration-300 group-hover:w-full" />
    </div>
  );
}
