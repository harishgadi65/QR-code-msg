// A thin gold rule flanking a small emoji — the recurring "— ❤ —" divider seen
// throughout the festive theme (see index.css's .vintage-rule).
export function FestiveDivider({ icon }: { icon: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <span className="vintage-rule" />
      <span className="text-base">{icon}</span>
      <span className="vintage-rule" />
    </div>
  )
}
