export function GeminiOneBackground() {
  return (
    <div className="pointer-events-none fixed inset-0">
      <div className="blob-gradient absolute top-0 left-0 h-[800px] w-full opacity-60" />
      <div className="grid-bg absolute inset-0 opacity-40" />
    </div>
  );
}
