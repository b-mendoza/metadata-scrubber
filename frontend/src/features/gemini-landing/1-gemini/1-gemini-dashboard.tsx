import { BotIcon, CheckCircle2Icon, TrendingUpIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CHART_DATA } from "./1-gemini-data";

export function GeminiOneDashboardMockup() {
  return (
    <div className="relative hidden h-[600px] perspective-[2000px] lg:block">
      <div className="absolute inset-0 rounded-full bg-linear-to-br from-[#ccff00]/5 to-transparent blur-[100px]" />
      <div className="relative h-full w-full rotate-x-10 -rotate-y-12 transform transition-transform duration-700 hover:rotate-x-5 hover:-rotate-y-5">
        <div className="glass-panel absolute top-10 right-10 bottom-10 left-10 flex flex-col border border-white/10 p-8 shadow-2xl">
          <div className="mb-8 flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500/50" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
              <div className="h-3 w-3 rounded-full bg-green-500/50" />
            </div>
            <div className="font-mono text-xs text-gray-500">
              DASHBOARD_V2.0.SYS
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-6">
            <SpendCard />
            <MetricCard
              label="PENDING APPROVALS"
              value="14"
              note="4 High Priority"
              noteClassName="mt-2 text-xs text-[#ccff00]"
            />
            <MetricCard
              label="MATCH RATE"
              value="99.2%"
              note="+2.4% vs last mo"
              noteClassName="mt-2 text-xs text-green-400"
            />
          </div>
        </div>
        <FloatingAlert
          className="glass-panel animate-float absolute top-20 -right-12 w-64 border-l-4 border-l-[#ccff00] p-4"
          iconClassName="flex h-10 w-10 items-center justify-center bg-[#ccff00]/20 text-[#ccff00]"
          icon={<BotIcon className="h-5 w-5" />}
          eyebrow="AI Alert"
          title="Duplicate Invoice Detected"
        />
        <FloatingAlert
          className="glass-panel animate-float-delayed absolute bottom-32 -left-12 w-64 border-r-4 border-r-blue-400 p-4"
          iconClassName="flex h-10 w-10 items-center justify-center bg-blue-500/20 text-blue-400"
          icon={<CheckCircle2Icon className="h-5 w-5" />}
          eyebrow="Status"
          title="3-Way Match Complete"
        />
      </div>
    </div>
  );
}

function SpendCard() {
  return (
    <div className="group relative col-span-2 overflow-hidden rounded-none border border-white/5 bg-white/5 p-6">
      <div className="absolute top-0 right-0 p-4 text-[#ccff00]">
        <TrendingUpIcon className="h-6 w-6" />
      </div>
      <div className="mb-2 font-mono text-sm text-gray-400">TOTAL SPEND</div>
      <div className="font-display text-4xl font-bold">$124,592.00</div>
      <div className="mt-4 flex gap-1">
        {CHART_DATA.map((data) => (
          <div key={data.id} className="flex h-12 flex-1 items-end bg-white/10">
            <div
              className="w-full bg-[#ccff00] transition-all duration-1000"
              style={{ height: `${data.height}%`, opacity: data.opacity }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  noteClassName,
}: {
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly noteClassName: string;
}) {
  return (
    <div className="border border-white/5 bg-white/5 p-6 transition-colors hover:bg-white/10">
      <div className="mb-4 font-mono text-xs text-gray-500">{label}</div>
      <div className="font-display text-3xl">{value}</div>
      <div className={noteClassName}>{note}</div>
    </div>
  );
}

function FloatingAlert({
  className,
  iconClassName,
  icon,
  eyebrow,
  title,
}: {
  readonly className: string;
  readonly iconClassName: string;
  readonly icon: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <div className={iconClassName}>{icon}</div>
        <div>
          <div className="text-xs text-gray-400">{eyebrow}</div>
          <div className="text-sm font-bold">{title}</div>
        </div>
      </div>
    </div>
  );
}
