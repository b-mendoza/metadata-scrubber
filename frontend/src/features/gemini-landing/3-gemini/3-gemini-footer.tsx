export function GeminiFooter() {
  return (
    <footer className="border-t border-[#333] bg-[#020202] py-12 text-xs">
      <div className="container mx-auto flex flex-col items-center justify-between gap-6 px-6 md:flex-row">
        <div className="flex items-center gap-2 text-neutral-500">
          <div className="h-2 w-2 bg-[#39ff14]" />
          SPENDGUARD SYSTEMS © 2026
        </div>
        <div className="flex gap-8 font-bold tracking-widest text-neutral-500 uppercase">
          <a href="/privacy" className="hover:text-white">
            Privacy_Policy
          </a>
          <a href="/terms" className="hover:text-white">
            Terms_of_Service
          </a>
          <a href="/status" className="hover:text-white">
            Status
          </a>
        </div>
      </div>
    </footer>
  );
}
