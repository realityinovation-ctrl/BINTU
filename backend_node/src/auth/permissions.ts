export const DIAGNOSTIC_READ = "diagnostic:read";
export const DIAGNOSTIC_CREATE = "diagnostic:create";
export const DIAGNOSTIC_OPERATE = "diagnostic:operate";
export const ORGANIZATION_MANAGE = "organization:manage";

const ADMIN_PERMISSIONS = [
  DIAGNOSTIC_CREATE,
  DIAGNOSTIC_OPERATE,
  DIAGNOSTIC_READ,
  ORGANIZATION_MANAGE,
] as const;

const MEMBER_PERMISSIONS = [
  DIAGNOSTIC_CREATE,
  DIAGNOSTIC_OPERATE,
  DIAGNOSTIC_READ,
] as const;

export type MembershipRole = "admin" | "member";

export function permissionsFor(role: MembershipRole): readonly string[] {
  return role === "admin" ? ADMIN_PERMISSIONS : MEMBER_PERMISSIONS;
}

export function isMembershipRole(value: string): value is MembershipRole {
  return value === "admin" || value === "member";
}
