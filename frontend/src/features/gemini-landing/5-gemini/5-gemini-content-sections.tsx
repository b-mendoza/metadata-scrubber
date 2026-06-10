import {
  CpuIcon,
  ScanLineIcon,
  ShieldCheckIcon,
  TerminalIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { GeminiFinalSections } from "./5-gemini-final-sections";

export function GeminiContentSections() {
  return (
    <>
      <MetricsStrip />
      <IntelligenceSection />
      <ProtocolSection />
      <GeminiFinalSections />
    </>
  );
}

function MetricsStrip() {
  return (
    <div className="border-y border-zinc-800 bg-zinc-900/30">
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {[
            { label: "Processing Time", value: "< 150ms" },
            { label: "Accuracy Rate", value: "99.9%" },
            { label: "Uptime", value: "99.99%" },
            { label: "Security Level", value: "Tier 1" },
          ].map((metric) => (
            <div
              key={metric.label}
              className="flex flex-col border-l border-zinc-800 pl-6"
            >
              <span className="mb-1 text-xs tracking-wider text-zinc-500 uppercase">
                {metric.label}
              </span>
              <span className="font-sans text-lg font-bold text-white md:text-xl">
                {metric.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntelligenceSection() {
  return (
    <section
      id="intelligence"
      className="relative z-10 container mx-auto px-6 py-24 md:py-32"
    >
      <div className="mb-16 flex flex-col items-end justify-between gap-6 md:flex-row">
        <div className="max-w-xl">
          <h2 className="mb-6 text-3xl font-bold tracking-tight text-white uppercase md:text-5xl">
            Core Capabilities
          </h2>
          <p className="leading-relaxed text-zinc-400">
            Our proprietary neural networks decompose invoices into structured
            data with human-level understanding and machine-level speed.
          </p>
        </div>
        <div className="mb-2 ml-12 hidden h-px flex-1 bg-zinc-800 md:block" />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <TechCard
          icon={<ScanLineIcon className="h-6 w-6" />}
          title="Optical Recognition"
          code="OCR_ENGINE_V4"
          desc="Proprietary engine tuned for complex layouts. Extracts line items, tax tables, and handwritten notes."
        />
        <TechCard
          icon={<ShieldCheckIcon className="h-6 w-6" />}
          title="Policy Enforcement"
          code="RULE_SET_01"
          desc="Automated compliance checks against POs and receiving logs. Zero-tolerance for variance."
        />
        <TechCard
          icon={<CpuIcon className="h-6 w-6" />}
          title="ERP Integration"
          code="SYNC_PROTOCOL"
          desc="Bi-directional sync with SAP, Oracle, and NetSuite. Real-time ledger updates."
        />
      </div>
    </section>
  );
}

function ProtocolSection() {
  return (
    <section
      id="protocol"
      className="border-t border-zinc-800 bg-zinc-900/20 py-24"
    >
      <div className="container mx-auto grid items-center gap-16 px-6 lg:grid-cols-2">
        <TerminalPanel />
        <DeveloperApiCopy />
      </div>
    </section>
  );
}

function TerminalPanel() {
  return (
    <div className="relative order-2 rounded border border-zinc-800 bg-[#0a0a0a] p-2 shadow-2xl lg:order-1">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
        <div className="flex gap-2">
          <div className="h-2 w-2 rounded-full bg-zinc-700" />
          <div className="h-2 w-2 rounded-full bg-zinc-700" />
          <div className="h-2 w-2 rounded-full bg-zinc-700" />
        </div>
        <div className="font-mono text-[10px] text-zinc-500">
          user@spend-guard:~/protocols
        </div>
      </div>
      <div className="overflow-x-auto p-6 font-mono text-sm">
        <div className="space-y-2">
          <div className="flex">
            <span className="mr-2 text-lime-400">➜</span>
            <span className="text-cyan-400">sg-cli</span>
            <span className="ml-2 text-white">
              verify --file invoice_001.pdf
            </span>
          </div>
          <div className="animate-pulse text-zinc-500">
            Initializing neural engine...
          </div>
          <div className="text-zinc-400">
            [SUCCESS] Document parsed (142ms)
            <br />
            [INFO] Vendor: ACME Corp
            <br />
            [INFO] Total: $1,240.50
            <br />
            [INFO] PO Match:{" "}
            <span className="text-lime-400">VERIFIED (PO-9921)</span>
          </div>
          <div className="mt-4 flex">
            <span className="mr-2 text-lime-400">➜</span>
            <span className="text-cyan-400">sg-cli</span>
            <span className="cursor-blink ml-2 text-white">_</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeveloperApiCopy() {
  return (
    <div className="order-1 space-y-8 lg:order-2">
      <div className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-cyan-500 uppercase">
        <TerminalIcon className="h-4 w-4" />
        Developer API
      </div>
      <h2 className="text-3xl font-bold text-white uppercase md:text-4xl">
        Programmatic <br />
        Control
      </h2>
      <p className="leading-relaxed text-zinc-400">
        Full access to the Spend Guard engine via our GraphQL API. Build custom
        verification workflows, trigger payments programmatically, and pull
        real-time spend analytics into your own dashboards.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {["Webhooks", "Audit Logs", "RBAC", "Sandboxing"].map((item) => (
          <div
            key={item}
            className="flex items-center gap-3 text-sm text-zinc-300"
          >
            <div className="h-1 w-1 bg-cyan-500" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function TechCard({
  icon,
  title,
  code,
  desc,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly code: string;
  readonly desc: string;
}) {
  return (
    <div className="group relative overflow-hidden border border-zinc-800 bg-zinc-900/20 p-8 transition-colors hover:bg-zinc-900/40">
      <div className="absolute top-0 left-0 h-px w-full -translate-x-full bg-linear-to-r from-transparent via-cyan-500/50 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />

      <div className="mb-6 flex items-start justify-between">
        <div className="border border-zinc-800 bg-zinc-900 p-3 text-cyan-500 transition-colors group-hover:border-lime-500/30 group-hover:text-lime-400">
          {icon}
        </div>
        <span className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase">
          {code}
        </span>
      </div>

      <h3 className="mb-3 text-xl font-bold text-white uppercase transition-colors group-hover:text-cyan-400">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-zinc-400">{desc}</p>

      <div className="absolute top-0 right-0 h-4 w-4 border-t border-r border-zinc-800 transition-colors group-hover:border-cyan-500/50" />
      <div className="absolute bottom-0 left-0 h-4 w-4 border-b border-l border-zinc-800 transition-colors group-hover:border-cyan-500/50" />
    </div>
  );
}
