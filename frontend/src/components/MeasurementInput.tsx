import { FormEvent, useEffect, useMemo, useState } from "react";
import { submitMeasurement } from "../api/client";
import type {
  Investigation,
  MeasurementCatalogItem,
} from "../types/investigation";

interface MeasurementInputProps {
  investigationId: string;
  catalog: MeasurementCatalogItem[];
  requestedType: string;
  requestedLocation: string;
  onSubmitted: (investigation: Investigation) => void;
}

export function MeasurementInput({
  investigationId,
  catalog,
  requestedType,
  requestedLocation,
  onSubmitted,
}: MeasurementInputProps) {
  const [measurementType, setMeasurementType] = useState(requestedType);
  const [value, setValue] = useState("");
  const [location, setLocation] = useState(requestedLocation);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMeasurementType(requestedType);
    setLocation(requestedLocation);
    setValue("");
    setError(null);
  }, [requestedLocation, requestedType]);

  const selected = useMemo(
    () =>
      catalog.find(
        (item) => item.measurement_type === measurementType,
      ) ?? null,
    [catalog, measurementType],
  );
  const numericValue = Number(value.replace(",", "."));
  const canSubmit =
    selected !== null &&
    value.trim() !== "" &&
    Number.isFinite(numericValue) &&
    location.trim() !== "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await submitMeasurement(investigationId, {
        measurement_type: selected.measurement_type,
        value: numericValue,
        unit: selected.unit,
        location: location.trim(),
      });
      onSubmitted(updated);
    } catch {
      setSubmitting(false);
      setError(
        "La mesure n'a pas été enregistrée. Vérifiez le type, la valeur et l'emplacement.",
      );
    }
  }

  return (
    <form
      className="measurement-form"
      onSubmit={(event) => void submit(event)}
    >
      <div>
        <p className="eyebrow">Mesure réelle du technicien</p>
        <h2>Ajouter une mesure</h2>
      </div>

      <label htmlFor="measurement-type">Type de mesure</label>
      <select
        id="measurement-type"
        value={measurementType}
        onChange={(event) => setMeasurementType(event.target.value)}
        disabled={submitting}
      >
        {catalog.map((item) => (
          <option
            key={item.measurement_type}
            value={item.measurement_type}
          >
            {item.label}
          </option>
        ))}
      </select>

      <label htmlFor="measurement-value">Valeur</label>
      <div className="measurement-value-row">
        <input
          id="measurement-value"
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="38,4"
          autoComplete="off"
          disabled={submitting}
        />
        <span className="measurement-unit" aria-label="Unité">
          {selected?.unit ?? "—"}
        </span>
      </div>

      <label htmlFor="measurement-location">Emplacement</label>
      <input
        id="measurement-location"
        type="text"
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        placeholder="Ex. sortie panneaux"
        autoComplete="off"
        maxLength={200}
        disabled={submitting}
      />

      <button
        className="primary-button full-width"
        type="submit"
        disabled={!canSubmit || submitting}
      >
        {submitting ? (
          <>
            <span className="spinner small-spinner" aria-hidden="true" />
            Ajout de la mesure…
          </>
        ) : (
          "Ajouter la mesure"
        )}
      </button>

      {error && (
        <p className="voice-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
