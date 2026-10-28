"""Closed catalogue of electrical measurements accepted by BINTU."""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping


@dataclass(frozen=True)
class MeasurementSpec:
    measurement_type: str
    label: str
    unit: str


_MEASUREMENT_SPECS = (
    MeasurementSpec("dc_voltage", "Tension DC", "V"),
    MeasurementSpec("dc_current", "Courant DC", "A"),
    MeasurementSpec("ac_voltage", "Tension AC", "V"),
    MeasurementSpec("ac_current", "Courant AC", "A"),
    MeasurementSpec("ac_power", "Puissance AC", "W"),
)

MEASUREMENT_CATALOG: Mapping[str, MeasurementSpec] = MappingProxyType(
    {spec.measurement_type: spec for spec in _MEASUREMENT_SPECS}
)

