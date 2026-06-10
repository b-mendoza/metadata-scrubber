export function GeminiOneCta() {
  return (
    <section className="px-6 py-20">
      <div className="container mx-auto max-w-5xl">
        <div className="glass-panel relative overflow-hidden border-t border-[#ccff00]/50 p-12 text-center md:p-24">
          <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-[#ccff00]/5 to-transparent" />
          <h2 className="font-display relative z-10 mb-8 text-5xl font-bold tracking-tighter md:text-7xl">
            READY TO{" "}
            <span className="bg-linear-to-b from-white to-white/50 bg-clip-text text-transparent">
              UPGRADE?
            </span>
          </h2>
          <p className="relative z-10 mx-auto mb-12 max-w-2xl text-xl text-gray-400">
            Join the forward-thinking enterprises in El Salvador utilizing Spend
            Guard for financial dominance.
          </p>
          <button
            type="button"
            className="font-display relative z-10 bg-[#ccff00] px-10 py-5 text-xl font-bold text-black transition-colors hover:bg-white"
          >
            Initialize Onboarding
          </button>
        </div>
      </div>
    </section>
  );
}
