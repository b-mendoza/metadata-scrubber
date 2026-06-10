import {
  ActivityIcon,
  CheckCircle2Icon,
  TerminalIcon,
  ZapIcon,
} from "lucide-react";

const EXPENDITURE_CHART_BARS = [
  "40",
  "65",
  "45",
  "90",
  "60",
  "75",
  "50",
  "80",
  "95",
  "70",
  "85",
  "60",
  "50",
  "40",
  "55",
  "75",
  "90",
  "85",
  "100",
  "95",
].map((height, index) => ({
  height,
  id: `expenditure-bar-${index}`,
}));

export function GeminiHeroDashboard() {
  return (
    <section className="container mx-auto px-4 py-20">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="mb-6 inline-flex items-center gap-2 border border-cyan-500/30 bg-cyan-950/20 px-3 py-1 text-xs font-bold tracking-wider text-cyan-400 uppercase backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500"></span>
            </span>
            <span>Net_Status: Live // El Salvador Region</span>
          </div>

          <h1 className="mb-8 font-sans text-6xl leading-none font-black tracking-tighter text-white uppercase md:text-8xl">
            Stop
            <br />
            <span className="relative inline-block text-transparent">
              <span className="absolute top-0 left-0 -ml-[2px] text-red-500 opacity-70 mix-blend-screen">
                Bleeding
              </span>
              <span className="absolute top-0 left-0 ml-[2px] text-cyan-500 opacity-70 mix-blend-screen">
                Bleeding
              </span>
              <span className="bg-linear-to-r from-cyan-400 via-white to-cyan-400 bg-clip-text">
                Bleeding
              </span>
            </span>
            <br />
            Cash.
          </h1>

          <div className="mb-10 flex max-w-2xl flex-col gap-2 border-l-2 border-zinc-700 pl-6 text-lg text-zinc-400">
            <p>
              <span className="text-cyan-500">&gt;&gt;</span> Initializing
              automated spend intelligence protocol...
            </p>
            <p>
              <span className="text-cyan-500">&gt;&gt;</span> Loading modules:{" "}
              <span className="text-white">Photo OCR</span>,{" "}
              <span className="text-white">3-Way Matching</span>,{" "}
              <span className="text-white">DTE Integration</span>.
            </p>
            <p className="mt-2 text-zinc-500">
              {"// Optimized for modern CFO workflows."}
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              className="clip-corner-tl group relative bg-cyan-600 px-8 py-4 font-bold tracking-wider text-black uppercase transition-all hover:bg-cyan-500 hover:pr-10"
            >
              <span className="relative z-10 flex items-center gap-2">
                Initialize Trial <ZapIcon className="h-4 w-4 fill-current" />
              </span>
              <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
            <button
              type="button"
              className="group flex items-center gap-2 border border-zinc-700 bg-black px-8 py-4 font-bold tracking-wider text-white uppercase transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
            >
              <TerminalIcon className="h-4 w-4" />
              View_Demo_Log
            </button>
          </div>
        </div>

        {/* Industrial Dashboard Preview */}
        <div className="lg:col-span-5 lg:pt-10">
          <div className="relative border border-zinc-800 bg-[#0A0A0C] p-1 shadow-2xl">
            {/* Decorative Connectors */}
            <div className="absolute -top-1 -left-1 h-2 w-2 border-t border-l border-cyan-500" />
            <div className="absolute -top-1 -right-1 h-2 w-2 border-t border-r border-cyan-500" />
            <div className="absolute -bottom-1 -left-1 h-2 w-2 border-b border-l border-cyan-500" />
            <div className="absolute -right-1 -bottom-1 h-2 w-2 border-r border-b border-cyan-500" />

            <div className="relative overflow-hidden bg-black p-4">
              <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="text-xs font-bold text-zinc-500">
                  SYS_MONITOR // 01
                </div>
                <div className="flex gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-zinc-800" />
                  <div className="h-1.5 w-1.5 rounded-full bg-zinc-800" />
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="mb-1 text-[10px] tracking-wider text-zinc-500 uppercase">
                      Pending Invoices
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="text-2xl font-bold text-white">12</div>
                      <ActivityIcon className="h-4 w-4 text-orange-500" />
                    </div>
                    <div className="mt-2 h-1 w-full bg-zinc-800">
                      <div className="h-full w-[40%] bg-orange-500" />
                    </div>
                  </div>
                  <div className="border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="mb-1 text-[10px] tracking-wider text-zinc-500 uppercase">
                      Match Rate
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="text-2xl font-bold text-cyan-400">
                        84%
                      </div>
                      <CheckCircle2Icon className="h-4 w-4 text-cyan-500" />
                    </div>
                    <div className="mt-2 h-1 w-full bg-zinc-800">
                      <div className="h-full w-[84%] bg-cyan-500" />
                    </div>
                  </div>
                </div>

                <div className="border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-[10px] tracking-wider text-zinc-500 uppercase">
                      Expenditure_Analysis
                    </div>
                    <div className="font-mono text-xs text-cyan-500">
                      $4.2k SAVED
                    </div>
                  </div>
                  <div className="flex h-32 items-end gap-1">
                    {EXPENDITURE_CHART_BARS.map((bar) => (
                      <div
                        key={bar.id}
                        className="flex-1 bg-zinc-800 transition-all hover:bg-cyan-500"
                        style={{ height: `${bar.height}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
