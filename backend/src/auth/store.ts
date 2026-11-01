import type { MembershipRole } from "./permissions";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  disabledAt: string | null;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  createdAt: string;
}

export interface MembershipRecord {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  createdAt: string;
}

export interface SessionRecord {
  idHash: string;
  userId: string;
  organizationId: string;
  csrfTokenHash: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface InvitationRecord {
  id: string;
  organizationId: string;
  role: MembershipRole;
  codeHash: string;
  createdBy: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface AuthStore {
  migrate(): void;
  transaction<T>(work: () => T): T;
  findUserByEmail(email: string): UserRecord | null;
  findUserById(id: string): UserRecord | null;
  insertUser(user: UserRecord): void;
  disableUser(id: string, disabledAt: string): void;
  insertOrganization(organization: OrganizationRecord): void;
  insertMembership(membership: MembershipRecord): void;
  listMemberships(userId: string): MembershipRecord[];
  insertSession(session: SessionRecord): void;
  findSession(idHash: string): SessionRecord | null;
  touchSession(idHash: string, lastSeenAt: string): void;
  revokeSession(idHash: string, revokedAt: string): void;
  updateCsrfHash(idHash: string, csrfTokenHash: string): void;
  insertInvitation(invitation: InvitationRecord): void;
  findInvitationByCodeHash(codeHash: string): InvitationRecord | null;
  markInvitationUsed(id: string, usedAt: string): boolean;
}
