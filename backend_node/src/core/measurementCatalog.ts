/** Closed catalogue of electrical measurements accepted by BINTU. */

export interface MeasurementSpec {
  measurement_type: string;
  label: string;
  unit: string;
}

const SPECS: readonly MeasurementSpec[] = [
  { measurement_type: "dc_voltage", label: "Tension DC", unit: "V" },
  { measurement_type: "dc_current", label: "Courant DC", unit: "A" },
  { measurement_type: "ac_voltage", label: "Tension AC", unit: "V" },
  { measurement_type: "ac_current", label: "Courant AC", unit: "A" },
  { measurement_type: "ac_power", label: "Puissance AC", unit: "W" },
];

export const MEASUREMENT_CATALOG: Readonly<Record<string, MeasurementSpec>> =
  Object.freeze(
    Object.fromEntries(SPECS.map((spec) => [spec.measurement_type, spec])),
  );
