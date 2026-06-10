import {
  CheckCircle2Icon,
  FileTextIcon,
  ScanIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  ZapIcon,
} from "lucide-react";

import { GEMINI_TWO_CAPABILITIES } from "./2-gemini-data";

const CAPABILITY_ICONS = {
  smartphone: <SmartphoneIcon className="h-12 w-12" />,
  shield: <ShieldCheckIcon className="h-12 w-12" />,
  fileText: <FileTextIcon className="h-12 w-12" />,
  zap: <ZapIcon className="h-12 w-12" />,
  scan: <ScanIcon className="h-12 w-12" />,
  checkCircle: <CheckCircle2Icon className="h-12 w-12" />,
};

export function GeminiTwoCapabilities() {
  return (
    <section id="capabilities" className="container mx-auto px-6 py-32">
      <div className="mb-24 flex flex-col justify-between gap-12 md:flex-row md:items-end">
        <h2 className="text-6xl leading-[0.8] font-black tracking-tighter uppercase md:text-8xl">
          Core <br />
          Modules
        </h2>
        <p className="max-w-xs border-t-4 border-black pt-6 font-mono text-sm leading-relaxed font-bold uppercase">
          {`// STATUS: DEPLOYED`}
          <br />
          Streamline operations and reduce manual intervention across all
          financial departments.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-px border-2 border-black bg-black md:grid-cols-2 lg:grid-cols-3">
        {GEMINI_TWO_CAPABILITIES.map((item) => (
          <div
            key={item.title}
            className="group relative h-full bg-[#E5E5E5] p-12 transition-all hover:bg-black hover:text-[#CCFF00]"
          >
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div>
                <div className="mb-8 text-black transition-colors group-hover:text-[#CCFF00]">
                  {CAPABILITY_ICONS[item.icon]}
                </div>
                <h3 className="mb-4 text-3xl leading-none font-black tracking-tighter uppercase">
                  {item.title}
                </h3>
              </div>
              <p className="mt-8 font-mono text-sm leading-relaxed text-neutral-600 group-hover:text-[#CCFF00]/80">
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
