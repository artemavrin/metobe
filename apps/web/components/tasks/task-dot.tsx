/**
 * A task's colour dot. While the task waits for the person it rings (Tailwind «ping») until it is seen; with
 * reduced motion it stands still. Decorative: what it says goes to a screen reader in words, beside it.
 */
export const TaskDot = ({
  color,
  ringing = false,
}: {
  color: string;
  ringing?: boolean;
}) => (
  <span aria-hidden className="relative flex size-2 shrink-0">
    {ringing && (
      <span
        className="absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping"
        style={{ background: color }}
      />
    )}
    <span
      className="relative size-2 rounded-full"
      style={{ background: color }}
    />
  </span>
);
