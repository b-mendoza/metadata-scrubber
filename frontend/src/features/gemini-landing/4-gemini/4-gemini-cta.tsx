export function GeminiCta() {
  return (
    <section className="relative overflow-hidden py-32 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1)_0%,transparent_70%)]" />
      <div className="relative z-10 container mx-auto px-4">
        <h2 className="mb-6 font-sans text-5xl font-bold tracking-tighter text-white uppercase md:text-7xl">
          Execute <span className="text-cyan-500">Control</span>
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-lg text-zinc-400">
          Join the network of businesses optimizing their spend management
          protocols.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            type="button"
            className="clip-corner-br bg-white px-10 py-4 font-bold tracking-wider text-black uppercase transition-transform hover:scale-105"
          >
            Initiate Setup
          </button>
          <button
            type="button"
            className="border border-zinc-700 px-10 py-4 font-bold tracking-wider text-white uppercase transition-colors hover:border-cyan-500 hover:text-cyan-400"
          >
            Contact_Sales
          </button>
        </div>
      </div>
    </section>
  );
}
