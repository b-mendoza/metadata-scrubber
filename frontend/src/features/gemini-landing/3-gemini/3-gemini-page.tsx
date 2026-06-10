import { GeminiArchitecture } from "./3-gemini-architecture";
import { GeminiCta } from "./3-gemini-cta";
import { GeminiFeatures } from "./3-gemini-features";
import { GeminiFooter } from "./3-gemini-footer";
import { GeminiHero } from "./3-gemini-hero";
import { GeminiNav } from "./3-gemini-nav";
import { GEMINI_STYLES } from "./3-gemini-styles";
import { GeminiTicker } from "./3-gemini-ticker";

export function GeminiLandingPage() {
  return (
    <div className="min-h-screen bg-[#050505] font-mono text-neutral-300 selection:bg-[#39ff14] selection:text-black">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#222_1px,transparent_1px),linear-gradient(to_bottom,#222_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] bg-[size:4rem_4rem]" />
      </div>

      <GeminiNav />

      <main className="relative pt-32">
        <GeminiHero />
        <GeminiTicker />
        <GeminiFeatures />
        <GeminiArchitecture />
        <GeminiCta />
        <GeminiFooter />
      </main>

      <style>{GEMINI_STYLES}</style>
    </div>
  );
}
