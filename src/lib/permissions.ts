import type { OrganizationRole } from "@prisma/client";

export const permissions = {
  manageWorkspace: (role: OrganizationRole) => role === "OWNER" || role === "ADMIN",
  manageMembers: (role: OrganizationRole) => role === "OWNER" || role === "ADMIN",
  manageBrands: (role: OrganizationRole) => role === "OWNER" || role === "ADMIN",
  manageIntegrations: (role: OrganizationRole) => role === "OWNER" || role === "ADMIN",
  manageInsights: (role: OrganizationRole) => role === "OWNER" || role === "ADMIN" || role === "MANAGER",
  manageActions: (role: OrganizationRole) => role === "OWNER" || role === "ADMIN" || role === "MANAGER",
  createFeedback: (role: OrganizationRole) => role !== "VIEWER",
  manageFeedback: (role: OrganizationRole, assignedToUserId: string | null, userId: string) =>
    role === "OWNER" || role === "ADMIN" || role === "MANAGER" ||
    (role === "MEMBER" && assignedToUserId === userId),
  read: (_role: OrganizationRole) => true,
} as const;
