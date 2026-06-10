import {
  ArrowRightIcon,
  FileCheckIcon,
  ScanLineIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export function GeminiCapabilitiesSpecs() {
  return (
    <>
      {/* Feature Schematics */}
      <section className="border-y border-white/5 bg-[#050507] py-24">
        <div className="container mx-auto px-4">
          <div className="mb-16 flex items-center gap-4">
            <div className="h-px w-12 bg-cyan-500" />
            <h2 className="text-sm font-bold tracking-[0.2em] text-cyan-500 uppercase">
              Core_Capabilities
            </h2>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <SchematicCard
              icon={<ScanLineIcon className="h-6 w-6" />}
              title="Photo OCR Engine"
              code="OCR_CONFIDENCE > 99.8%"
              description="High-precision receipt extraction. Identifies merchant data, totals, and line items with sub-pixel accuracy."
              delay={0}
            />
            <SchematicCard
              icon={<ShieldCheckIcon className="h-6 w-6" />}
              title="3-Way Matching"
              code="RECONCILIATION_MODE: AUTO"
              description="Automated cross-referencing of POs, Receipts, and Invoices. Discrepancy detection system active."
              delay={150}
            />
            <SchematicCard
              icon={<FileCheckIcon className="h-6 w-6" />}
              title="DTE Automation"
              code="STATUS: COMPLIANT"
              description="Direct integration with Ministerio de Hacienda. Real-time validation protocol engaged."
              delay={300}
            />
          </div>
        </div>
      </section>

      {/* Terminal Quote */}
      <section className="py-24">
        <div className="container mx-auto max-w-4xl px-4">
          <div className="relative overflow-hidden rounded-sm border border-zinc-800 bg-black p-8 font-mono">
            <div className="absolute top-0 left-0 h-1 w-full bg-linear-to-r from-transparent via-cyan-500 to-transparent opacity-20" />
            <div className="mb-6 flex gap-2 border-b border-zinc-900 pb-4 text-xs text-zinc-600">
              <div className="h-3 w-3 rounded-full bg-zinc-800" />
              <div className="h-3 w-3 rounded-full bg-zinc-800" />
              <div className="h-3 w-3 rounded-full bg-zinc-800" />
              <span className="ml-auto">user_feedback.log</span>
            </div>
            <div className="space-y-4 text-lg text-zinc-300">
              <p>
                <span className="text-cyan-500">root@techsal:~$</span> cat
                feedback.txt
              </p>
              <p className="border-l-2 border-zinc-800 pl-4 italic">
                &ldquo;Finally, a tool that understands how business is done in
                El Salvador. No more manual data entry. It&apos;s fully
                automated.&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-4 text-sm">
                <div className="h-10 w-10 overflow-hidden bg-zinc-800 grayscale">
                  <div className="h-full w-full bg-linear-to-br from-zinc-700 to-zinc-900" />
                </div>
                <div>
                  <div className="font-bold text-white">Carlos M.</div>
                  <div className="text-zinc-500">CFO @ TechSal</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Specs / Comparison */}
      <section className="border-t border-white/5 bg-[#050507] py-24">
        <div className="container mx-auto px-4">
          <div className="grid gap-16 lg:grid-cols-2">
            <div>
              <h2 className="mb-8 font-sans text-4xl font-bold tracking-tighter text-white uppercase">
                System <span className="text-cyan-500">Specifications</span>
              </h2>
              <div className="space-y-px bg-zinc-800">
                <SpecRow label="Compliance" value="Tax Compliant (Local)" />
                <SpecRow label="Budget Tracking" value="Real-time / Live" />
                <SpecRow label="Workflows" value="Automated Approval" />
                <SpecRow label="Encryption" value="AES-256 (Bank Grade)" />
                <SpecRow label="Interface" value="Responsive / Mobile-First" />
              </div>
              <button
                type="button"
                className="mt-8 flex items-center gap-2 text-sm font-bold text-cyan-500 hover:text-cyan-400"
              >
                [ EXPAND_FULL_SPECS ] <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 bg-cyan-500/5 blur-2xl" />
              <div className="relative border border-zinc-800 bg-black p-8">
                <h3 className="mb-6 text-xs font-bold tracking-widest text-zinc-500 uppercase">
                  Performance_Benchmark
                </h3>

                <div className="mb-8 space-y-6">
                  <div>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="text-zinc-400">Manual Process</span>
                      <span className="font-mono text-red-500">24h 00m</span>
                    </div>
                    <div className="h-1 w-full bg-zinc-900">
                      <div className="h-full w-full bg-red-900/50" />
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-bold text-white">Spend Guard</span>
                      <span className="font-mono text-cyan-400">
                        &lt; 0s 050ms
                      </span>
                    </div>
                    <div className="h-1 w-full bg-zinc-900">
                      <div className="h-full w-[2%] bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-zinc-900 pt-6">
                  <div>
                    <div className="text-xs text-zinc-500">Error Rate</div>
                    <div className="text-xl font-bold text-red-500/50 line-through">
                      15%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Optimization</div>
                    <div className="text-xl font-bold text-cyan-400">99.9%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function SchematicCard({
  icon,
  title,
  code,
  description,
  delay,
}: Readonly<{
  icon: ReactNode;
  title: string;
  code: string;
  description: string;
  delay: number;
}>) {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        setIsVisible(entry.isIntersecting);
      });
    });
    if (domRef.current != null) {
      observer.observe(domRef.current);
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={domRef}
      className={`group relative border border-zinc-800 bg-zinc-900/20 p-8 transition-all duration-700 hover:border-cyan-500/50 hover:bg-zinc-900/40 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="absolute top-0 right-0 p-2 opacity-50 transition-opacity group-hover:opacity-100">
        <div className="h-1 w-1 bg-cyan-500" />
      </div>
      <div className="mb-6 inline-flex border border-zinc-700 bg-black p-3 text-cyan-500 transition-shadow group-hover:text-cyan-400 group-hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]">
        {icon}
      </div>
      <div className="mb-2 font-mono text-[10px] text-cyan-600 uppercase">
        {code}
      </div>
      <h3 className="mb-4 text-xl font-bold tracking-wide text-white uppercase">
        {title}
      </h3>
      <p className="leading-relaxed text-zinc-400">{description}</p>
    </div>
  );
}

function SpecRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between bg-[#0A0A0C] p-4 transition-colors hover:bg-zinc-900">
      <span className="text-xs tracking-wider text-zinc-500 uppercase">
        {label}
      </span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}
