export function GeminiPageStyles() {
  return (
    <style>{`
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes glitch {
          0% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
          100% { transform: translate(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes typing {
          from { width: 0 }
          to { width: 100% }
        }
        .scanline-overlay {
          background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2));
          background-size: 100% 4px;
        }
        .animate-scanline {
          animation: scanline 8s linear infinite;
        }
        .glitch-hover:hover {
          animation: glitch 0.3s cubic-bezier(.25, .46, .45, .94) both infinite;
        }
        .cursor-blink {
          animation: blink 1s step-end infinite;
        }
        .technical-grid {
          background-size: 50px 50px;
          background-image:
            linear-gradient(to right, rgba(6, 182, 212, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(6, 182, 212, 0.05) 1px, transparent 1px);
        }
        .clip-corner-tl {
          clip-path: polygon(20px 0, 100% 0, 100% 100%, 0 100%, 0 20px);
        }
        .clip-corner-br {
          clip-path: polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
        }
      `}</style>
  );
}
