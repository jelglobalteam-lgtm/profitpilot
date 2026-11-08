/** "!" a pulsar para indicar que há algo por fazer do lado do utilizador (sem animação se o sistema pedir menos movimento). */
export function AttentionBang({ title = "Tem algo por fazer" }: { title?: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center"
    >
      <span className="absolute inline-flex h-full w-full rounded-full bg-warning/60 motion-safe:animate-ping" />
      <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[10px] font-bold leading-none text-white">
        !
      </span>
    </span>
  );
}
