import { CheckCircle2Icon, GlobeIcon, ScanLineIcon } from "lucide-react";

const CARD_NUMBER_OFFSET = 1;

const FEATURES = [
  {
    title: "OPTICAL RECOGNITION",
    desc: "High-speed extraction of unstructured data from physical and digital documents.",
    icon: <ScanLineIcon className="h-8 w-8" />,
    stat: "0.4s",
    label: "PARSE TIME",
  },
  {
    title: "3-WAY MATCHING",
    desc: "Automated reconciliation of POs, receipts, and invoices. Discrepancy detection.",
    icon: <CheckCircle2Icon className="h-8 w-8" />,
    stat: "100%",
    label: "ACCURACY",
  },
  {
    title: "DTE INTEGRATION",
    desc: "Direct uplinking to tax authorities. Real-time compliance verification.",
    icon: <GlobeIcon className="h-8 w-8" />,
    stat: "AES-256",
    label: "SECURITY",
  },
];

export function GeminiFeatures() {
  return (
    <section id="features" className="container mx-auto px-6 py-24">
      <div className="mb-16 flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-4xl font-black tracking-tighter text-white uppercase">
            Core Modules
          </h2>
          <p className="mt-2 text-neutral-500">
            Select a subsystem to view capabilities.
          </p>
        </div>
        <div className="text-right text-xs font-bold text-[#39ff14]">
          ALL SYSTEMS NOMINAL
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {FEATURES.map((feature, i) => (
          <div
            key={feature.title}
            className="group relative border border-[#333] bg-[#080808] p-8 transition-all hover:-translate-y-1 hover:border-[#39ff14]"
          >
            <div className="mb-6 flex items-start justify-between">
              <div className="text-[#39ff14]">{feature.icon}</div>
              <div className="text-4xl font-black text-[#1a1a1a] transition-colors group-hover:text-[#39ff14]/20">
                0{i + CARD_NUMBER_OFFSET}
              </div>
            </div>
            <h3 className="mb-4 text-xl font-bold tracking-wider text-white uppercase">
              {feature.title}
            </h3>
            <p className="mb-8 text-sm leading-relaxed text-neutral-400">
              {feature.desc}
            </p>
            <div className="border-t border-[#222] pt-4">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-neutral-500">{feature.label}</span>
                <span className="text-white">{feature.stat}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
