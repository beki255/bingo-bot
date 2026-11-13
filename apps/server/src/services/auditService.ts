import type { Prisma, PrismaClient, UserRole } from "@prisma/client";

export async function recordAuditLog(
  client: PrismaClient | Prisma.TransactionClient,
  params: {
    actorId: string;
    actorRole: UserRole;
    action: string;
    targetType: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
  }
) {
  await client.auditLog.create({
    data: {
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      beforeJson:
        params.before !== undefined
          ? (JSON.parse(JSON.stringify(params.before)) as Prisma.InputJsonValue)
          : undefined,
      afterJson:
        params.after !== undefined
          ? (JSON.parse(JSON.stringify(params.after)) as Prisma.InputJsonValue)
          : undefined,
    },
  });
}

