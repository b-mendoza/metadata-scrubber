import { BarChart3Icon, CpuIcon, FileTextIcon, LockIcon } from "lucide-react";

const ARCHITECTURE_ITEMS = [
  {
    label: "Data Ingestion",
    val: "Multi-Format Support",
    icon: <FileTextIcon className="h-4 w-4" />,
  },
  {
    label: "Processing Unit",
    val: "Neural OCR Engine",
    icon: <CpuIcon className="h-4 w-4" />,
  },
  {
    label: "Security Layer",
    val: "Enterprise Grade",
    icon: <LockIcon className="h-4 w-4" />,
  },
  {
    label: "Analytics",
    val: "Real-time Telemetry",
    icon: <BarChart3Icon className="h-4 w-4" />,
  },
];

export function GeminiArchitecture() {
  return (
    <section className="bg-[#080808] py-24">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div className="relative">
            <div className="absolute top-0 left-0 -z-10 h-64 w-64 bg-[#39ff14]/5 blur-[100px]" />
            <h2 className="mb-8 text-3xl font-black tracking-tight text-white uppercase">
              System Architecture
            </h2>
            <div className="space-y-6">
              {ARCHITECTURE_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-4 border-b border-[#222] pb-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center bg-[#111] text-[#39ff14]">
                    {item.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-neutral-500 uppercase">
                      {item.label}
                    </div>
                    <div className="font-bold text-white uppercase">
                      {item.val}
                    </div>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-[#39ff14]" />
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center justify-center border border-[#333] bg-black p-8">
            <div className="absolute top-0 left-0 h-4 w-4 border-t border-l border-[#39ff14]" />
            <div className="absolute top-0 right-0 h-4 w-4 border-t border-r border-[#39ff14]" />
            <div className="absolute bottom-0 left-0 h-4 w-4 border-b border-l border-[#39ff14]" />
            <div className="absolute right-0 bottom-0 h-4 w-4 border-r border-b border-[#39ff14]" />

            <div className="w-full space-y-2 font-mono text-xs text-neutral-500">
              <div className="flex gap-4">
                <span className="w-8 text-[#333]">01</span>
                <span>
                  <span className="text-purple-400">class</span>{" "}
                  <span className="text-yellow-300">SpendGuard</span>{" "}
                  <span className="text-white">implements</span>{" "}
                  <span className="text-yellow-300">ISecureProcessor</span>{" "}
                  {"{"}
                </span>
              </div>
              <div className="flex gap-4">
                <span className="w-8 text-[#333]">02</span>
                <span className="pl-4">
                  <span className="text-purple-400">private</span>{" "}
                  <span className="text-blue-400">readonly</span>{" "}
                  <span className="text-white">config</span>:{" "}
                  <span className="text-yellow-300">Config</span>
                  {";"}
                </span>
              </div>
              <div className="flex gap-4">
                <span className="w-8 text-[#333]">03</span>
                <span className="pl-4">
                  <span className="text-purple-400">constructor</span>() {"{"}
                </span>
              </div>
              <div className="flex gap-4">
                <span className="w-8 text-[#333]">04</span>
                <span className="pl-8">
                  <span className="text-blue-400">this</span>.
                  <span className="text-white">config</span> ={" "}
                  <span className="text-white">Security.init({"{"}</span>
                </span>
              </div>
              <div className="flex gap-4">
                <span className="w-8 text-[#333]">05</span>
                <span className="pl-12">
                  <span className="text-white">level:</span>{" "}
                  <span className="text-orange-400">
                    &quot;MAXIMUM_PROTECTION&quot;
                  </span>
                  ,
                </span>
              </div>
              <div className="flex gap-4">
                <span className="w-8 text-[#333]">06</span>
                <span className="pl-12">
                  <span className="text-white">encryption:</span>{" "}
                  <span className="text-blue-400">true</span>,
                </span>
              </div>
              <div className="flex gap-4">
                <span className="w-8 text-[#333]">07</span>
                <span className="pl-8">{"}"});</span>
              </div>
              <div className="flex gap-4">
                <span className="w-8 text-[#333]">08</span>
                <span className="pl-4">{"}"}</span>
              </div>
              <div className="flex gap-4">
                <span className="w-8 text-[#333]">09</span>
                <span>{"}"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
