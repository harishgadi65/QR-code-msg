// Decorative corner flourishes for the customer-facing festive theme — purely
// visual, rendered behind the card (see .vintage-corner / .vintage-page in
// index.css). Kept as one shared component so every screen in the scan/upload/
// view flow (CreateMemoryForm, MemoryView, MemoryPage) looks consistent.
export function FestiveCorners() {
  return (
    <>
      <div className="vintage-corner -left-3 -top-3 rotate-[-8deg] text-6xl select-none sm:text-7xl">
        🌸🌿
      </div>
      <div className="vintage-corner -right-2 -top-2 flex flex-col items-center gap-0.5 text-4xl select-none sm:text-5xl">
        <span>🪔</span>
        <span className="-mt-1 text-3xl sm:text-4xl">🪔</span>
      </div>
      <div className="vintage-corner -bottom-3 -left-3 rotate-[6deg] text-5xl select-none sm:text-6xl">
        🎁🌼
      </div>
      <div className="vintage-corner -bottom-3 -right-3 rotate-[-4deg] text-5xl select-none sm:text-6xl">
        🌹🥀
      </div>
    </>
  )
}
