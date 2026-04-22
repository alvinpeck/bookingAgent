// Placeholder — will be fully built in Phase 7
export default function BookingsPage() {
  return <ComingSoon title="Bookings" phase={7} />;
}

function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">{title}</h1>
      <div className="mt-6 bg-white border border-dashed border-gray-300 rounded-xl px-6 py-12 text-center">
        <p className="text-gray-400 text-sm">
          Coming in Phase {phase}
        </p>
      </div>
    </div>
  );
}
