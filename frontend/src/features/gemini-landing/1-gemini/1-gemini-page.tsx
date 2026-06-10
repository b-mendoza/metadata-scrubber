import { useEffect, useState } from "react";

import { GeminiOneBackground } from "./1-gemini-background";
import { GeminiOneCta } from "./1-gemini-cta";
import { SCROLL_THRESHOLD } from "./1-gemini-data";
import { GeminiOneFeatures } from "./1-gemini-features";
import { GeminiOneFooter } from "./1-gemini-footer";
import { GeminiOneHero } from "./1-gemini-hero";
import { GeminiOneNav } from "./1-gemini-nav";
import { GEMINI_LANDING_STYLES } from "./1-gemini-styles";
import { GeminiOneTicker } from "./1-gemini-ticker";

export function GeminiOnePage() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > SCROLL_THRESHOLD);
    };
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030305] font-sans text-white selection:bg-[#ccff00] selection:text-black">
      <style>{GEMINI_LANDING_STYLES}</style>
      <GeminiOneBackground />
      <GeminiOneNav isScrolled={isScrolled} />
      <GeminiOneHero />
      <GeminiOneTicker />
      <GeminiOneFeatures />
      <GeminiOneCta />
      <GeminiOneFooter />
    </div>
  );
}
