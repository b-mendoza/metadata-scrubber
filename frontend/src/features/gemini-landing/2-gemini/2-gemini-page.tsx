import { useEffect, useState } from "react";

import { GeminiTwoCapabilities } from "./2-gemini-capabilities";
import { GeminiTwoFooter } from "./2-gemini-footer";
import { GeminiTwoHero } from "./2-gemini-hero";
import { GeminiTwoMarquee } from "./2-gemini-marquee";
import { GeminiTwoNav } from "./2-gemini-nav";
import { GeminiTwoPricing } from "./2-gemini-pricing";
import { GeminiTwoProcess } from "./2-gemini-process";
import { GeminiTwoAnimationStyles } from "./2-gemini-styles";

const SCROLL_THRESHOLD_PX = 50;

export function GeminiTwoPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > SCROLL_THRESHOLD_PX);
    };
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#E5E5E5] font-sans text-black selection:bg-black selection:text-[#CCFF00]">
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      <GeminiTwoNav
        isMenuOpen={isMenuOpen}
        isScrolled={scrolled}
        onCloseMenu={() => {
          setIsMenuOpen(false);
        }}
        onToggleMenu={() => {
          setIsMenuOpen(!isMenuOpen);
        }}
      />
      <GeminiTwoHero />
      <GeminiTwoMarquee />
      <GeminiTwoCapabilities />
      <GeminiTwoProcess />
      <GeminiTwoPricing />
      <GeminiTwoFooter />
      <GeminiTwoAnimationStyles />
    </div>
  );
}
