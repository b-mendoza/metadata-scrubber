export const GEMINI_LANDING_STYLES = `
          @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Syne:wght@400;500;600;700;800&display=swap');

          :root {
            --neon-lime: #ccff00;
            --deep-purple: #1a1a2e;
            --glass-border: rgba(255, 255, 255, 0.08);
            --glass-bg: rgba(255, 255, 255, 0.02);
          }

          .font-display { font-family: 'Syne', sans-serif; }
          .font-body { font-family: 'Space Grotesk', sans-serif; }

          .blob-gradient {
            background: radial-gradient(circle at 50% 50%, rgba(76, 29, 149, 0.15), transparent 60%);
          }
          
          .text-glow {
            text-shadow: 0 0 20px rgba(204, 255, 0, 0.3);
          }

          .glass-panel {
            background: var(--glass-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--glass-border);
          }

          .grid-bg {
            background-size: 50px 50px;
            background-image: linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                              linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            mask-image: radial-gradient(circle at center, black 40%, transparent 100%);
          }

          @keyframes float {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
            100% { transform: translateY(0px); }
          }
          
          @keyframes marquee {
            0% { transform: translateX(0%); }
            100% { transform: translateX(-50%); }
          }

          .animate-float {
            animation: float 6s ease-in-out infinite;
          }

          .animate-float-delayed {
            animation: float 8s ease-in-out infinite;
            animation-delay: 2s;
          }

          .animate-marquee {
            animation: marquee 20s linear infinite;
          }
        `;
