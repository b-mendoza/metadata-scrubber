import { GEMINI_TWO_PROCESS_STEPS } from "./2-gemini-data";

export function GeminiTwoProcess() {
  return (
    <section
      id="process"
      className="relative overflow-hidden bg-black py-32 text-white"
    >
      <div
        className="pointer-events-none absolute top-0 left-0 h-full w-full opacity-10"
        style={{
          backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      ></div>
      <div className="relative z-10 container mx-auto px-6">
        <div className="mb-24 flex flex-col items-baseline gap-12 border-b border-white/20 pb-8 md:flex-row">
          <h2 className="text-5xl font-black tracking-tighter uppercase md:text-7xl">
            The Workflow
          </h2>
          <div className="animate-pulse font-mono text-[#CCFF00]">
            {`// SYSTEM_PROCESS_INIT`}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {GEMINI_TWO_PROCESS_STEPS.map((step) => (
            <div
              key={step.title}
              className="group relative border-2 border-white/20 bg-neutral-900/50 p-10 transition-all duration-300 hover:border-[#CCFF00] hover:bg-neutral-900"
            >
              <div className="mb-8 flex items-center justify-between">
                <div className="text-8xl font-black text-neutral-800 transition-colors select-none group-hover:text-[#CCFF00]">
                  {step.step}
                </div>
                <div className="ml-8 h-px flex-1 bg-white/20 transition-colors group-hover:bg-[#CCFF00]"></div>
              </div>
              <h3 className="mb-4 text-4xl font-bold tracking-tight uppercase">
                {step.title}
              </h3>
              <p className="font-mono text-sm leading-relaxed text-neutral-400 transition-colors group-hover:text-white">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
