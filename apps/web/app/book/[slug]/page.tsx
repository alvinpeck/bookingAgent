import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/trpc/server";
import { TRPCError } from "@trpc/server";

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let services: Awaited<ReturnType<typeof api.services.listPublic>>;
  try {
    services = await api.services.listPublic({ tenantSlug: slug });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-gray-900 capitalize">
            {slug.replace(/-/g, " ")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Book an appointment online</p>
        </div>
      </div>

      {/* Services */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {services.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">No services available for booking right now.</p>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Available services
            </h2>
            <div className="space-y-3">
              {services.map((s) => (
                <Link
                  key={s.id}
                  href={`/book/${slug}/${s.slug}`}
                  className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between gap-4 hover:border-indigo-300 hover:shadow-sm transition-all block"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: s.colorHex ?? "#6366f1" }}
                    >
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{s.name}</p>
                      {s.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{s.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s.durationMinutes} min
                        {s.price ? ` · ${s.currency} ${s.price}` : " · Free"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg">
                    Book →
                  </span>
                </Link>
              ))}
            </div>

            <p className="mt-8 text-center text-xs text-gray-400">
              Powered by BookingAgent
            </p>
          </>
        )}
      </div>
    </div>
  );
}
