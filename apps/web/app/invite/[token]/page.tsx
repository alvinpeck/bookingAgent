import { db, tenantInvites, tenants } from "@booking-agent/db";
import { eq, and, isNull } from "drizzle-orm";
import AcceptInviteClient from "./AcceptInviteClient";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await db.query.tenantInvites.findFirst({
    where: and(eq(tenantInvites.token, token), isNull(tenantInvites.acceptedAt)),
  });

  if (!invite || new Date() > invite.expiresAt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow p-8 max-w-sm text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invalid invite</h1>
          <p className="text-sm text-gray-500">
            This invitation has expired or already been used.
          </p>
        </div>
      </div>
    );
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, invite.tenantId),
  });

  return (
    <AcceptInviteClient
      token={token}
      tenantName={tenant?.name ?? ""}
      email={invite.email ?? ""}
    />
  );
}
