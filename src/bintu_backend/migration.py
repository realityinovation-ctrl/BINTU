"""Attach pre-Clerk diagnostics only when real Clerk ids are configured."""

from __future__ import annotations

import logging
import os
import re

from bintu_agent_core.sqlite_store import SQLiteInvestigationStore

logger = logging.getLogger("bintu.migration")

_ORGANIZATION_ID = re.compile(r"^org_[A-Za-z0-9]+$")
_USER_ID = re.compile(r"^user_[A-Za-z0-9]+$")


def claim_demo_organization(store: SQLiteInvestigationStore) -> int:
    organization_id = os.environ.get("BINTU_DEMO_ORGANIZATION_ID", "").strip()
    user_id = os.environ.get("BINTU_MIGRATION_USER_ID", "").strip()
    if not organization_id and not user_id:
        return 0
    if (
        _ORGANIZATION_ID.fullmatch(organization_id) is None
        or _USER_ID.fullmatch(user_id) is None
    ):
        logger.warning("diagnostic migration skipped: clerk identifiers rejected")
        return 0
    attached = store.claim_unassigned(organization_id, user_id)
    logger.info("unassigned diagnostics attached: %s", attached)
    return attached
