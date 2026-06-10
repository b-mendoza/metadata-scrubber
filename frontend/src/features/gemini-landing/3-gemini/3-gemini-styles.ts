export const GEMINI_STYLES = `
  @keyframes marquee {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  .animate-marquee {
    animation: marquee 30s linear infinite;
  }
  .animate-blink {
      animation: blink 1s step-end infinite;
  }
  @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
  }
`;
