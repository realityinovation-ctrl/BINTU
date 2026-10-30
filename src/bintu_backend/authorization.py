"""BINTU authorization. Permissions come from a verified context, never from JSON."""

from __future__ import annotations

from dataclasses import dataclass

DIAGNOSTIC_READ = "diagnostic:read"
DIAGNOSTIC_CREATE = "diagnostic:create"
DIAGNOSTIC_OPERATE = "diagnostic:operate"
ORGANIZATION_MANAGE = "organization:manage"

KNOWN_PERMISSIONS = frozenset(
    {
        DIAGNOSTIC_READ,
        DIAGNOSTIC_CREATE,
        DIAGNOSTIC_OPERATE,
        ORGANIZATION_MANAGE,
    }
)

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "owner": frozenset(
        {
            DIAGNOSTIC_READ,
            DIAGNOSTIC_CREATE,
            DIAGNOSTIC_OPERATE,
            ORGANIZATION_MANAGE,
        }
    ),
    "technician": frozenset(
        {DIAGNOSTIC_READ, DIAGNOSTIC_CREATE, DIAGNOSTIC_OPERATE}
    ),
    "reader": frozenset({DIAGNOSTIC_READ}),
}


class AuthenticationError(Exception):
    def __init__(self, code: str = "unauthenticated") -> None:
        super().__init__(code)
        self.code = code


class ActiveOrganizationRequired(Exception):
    pass


class PermissionDenied(Exception):
    pass


@dataclass(frozen=True)
class AuthenticatedContext:
    user_id: str
    organization_id: str | None
    role: str | None
    permissions: frozenset[str]


def bintu_role(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    role = value.strip()
    if role.startswith("org:"):
        role = role[4:]
    if role in ROLE_PERMISSIONS:
        return role
    return None


def bintu_permission(value: str) -> str | None:
    permission = value.strip()
    if permission.startswith("org:"):
        permission = permission[4:]
    if permission in KNOWN_PERMISSIONS:
        return permission
    return None


def resolve_permissions(
    role: str | None, raw_permissions: object
) -> frozenset[str]:
    extracted: set[str] = set()
    if isinstance(raw_permissions, list):
        for item in raw_permissions:
            if isinstance(item, str):
                permission = bintu_permission(item)
                if permission is not None:
                    extracted.add(permission)
    if extracted:
        return frozenset(extracted)
    if role in ROLE_PERMISSIONS:
        return ROLE_PERMISSIONS[role]
    return frozenset()


def authorize(context: AuthenticatedContext, permission: str) -> None:
    if not context.organization_id:
        raise ActiveOrganizationRequired()
    if permission not in context.permissions:
        raise PermissionDenied()
