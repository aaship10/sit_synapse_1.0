/** Small monospace tag for a fault code. Used in tables and headers. */
export default function FaultCodeTag({ code }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-btn bg-surface-muted px-1.5 py-0.5 font-mono text-[13px] text-text-primary">
      {code}
    </span>
  );
}
