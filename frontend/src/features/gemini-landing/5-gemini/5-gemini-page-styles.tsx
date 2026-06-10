export function GeminiPageStyles() {
  return (
    <>
      <style>{`
        @keyframes gemini-reveal-up {
          from {
            opacity: 0;
            transform: translateY(1rem);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes gemini-reveal-left {
          from {
            opacity: 0;
            transform: translateX(-1rem);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes gemini-reveal-scale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .gemini-reveal-up {
          animation: gemini-reveal-up 700ms ease-out 100ms both;
        }

        .gemini-reveal-left {
          animation: gemini-reveal-left 700ms ease-out 300ms both;
        }

        .gemini-reveal-actions {
          animation: gemini-reveal-up 700ms ease-out 500ms both;
        }

        .gemini-reveal-scale {
          animation: gemini-reveal-scale 1000ms ease-out 300ms both;
        }
      `}</style>
      <style>{`
        @keyframes scan-vertical {
          0%, 100% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scan-vertical {
          animation: scan-vertical 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .cursor-blink {
          animation: blink 1s step-end infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .clip-path-slant {
          clip-path: polygon(0 0, 100% 0, 100% 85%, 95% 100%, 0 100%);
        }
      `}</style>
    </>
  );
}
