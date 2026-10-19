"use client";

import { getMessage, type SupportedLocale } from "@gprn/i18n";
import { Check, MapPin, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ProfileLocationPicker,
  type LocationOption,
} from "./profile-location-picker";

export function PhotoLocationEditor({
  photoId,
  label,
  locale,
  editable,
  disabled,
  pressed,
  onBrowse,
  search,
  onSave,
}: {
  readonly photoId: string;
  readonly label: string;
  readonly locale: SupportedLocale;
  readonly editable: boolean;
  readonly disabled?: boolean;
  readonly pressed?: boolean;
  readonly onBrowse: () => void;
  readonly search: (
    query: string,
    locale: SupportedLocale,
  ) => Promise<readonly LocationOption[]>;
  readonly onSave: (location: LocationOption) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(label);
  const [selection, setSelection] = useState<LocationOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const t = (key: Parameters<typeof getMessage>[1]) => getMessage(locale, key);
  useEffect(() => {
    if (editing) {
      const input = formRef.current?.querySelector("input");
      input?.focus();
      input?.select();
    }
  }, [editing]);
  function cancel() {
    setEditing(false);
    setError(false);
  }
  if (!editable || !editing)
    return (
      <span className="photo-category-line">
        <button
          type="button"
          className="photo-meta-tag"
          disabled={disabled}
          aria-pressed={pressed}
          onClick={onBrowse}
        >
          <MapPin aria-hidden="true" size={14} />
          {label}
        </button>
        {editable ? (
          <button
            type="button"
            className="icon-button photo-rename-action"
            aria-label={t("photo.changeLocation")}
            title={t("photo.changeLocation")}
            onClick={() => {
              setQuery(label);
              setSelection(null);
              setError(false);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
        ) : null}
      </span>
    );
  return (
    <form
      ref={formRef}
      className="photo-location-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!selection || saving) return;
        setSaving(true);
        setError(false);
        try {
          await onSave(selection);
          setEditing(false);
        } catch {
          setError(true);
        } finally {
          setSaving(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!saving) cancel();
        }
      }}
    >
      <fieldset disabled={saving}>
        <ProfileLocationPicker
          idPrefix={`photo-location-${photoId}`}
          labelKey="photo.location"
          showHint={false}
          locale={locale}
          value={query}
          selection={selection}
          search={search}
          onChange={(value) => {
            setQuery(value);
            setSelection(null);
            setError(false);
          }}
          onSelect={(location) => {
            setSelection(location);
            setQuery(location.label);
            setError(false);
          }}
        />
      </fieldset>
      <div className="photo-title-controls">
        <button
          type="submit"
          className="icon-button photo-rename-action"
          disabled={saving || !selection}
          aria-label={t("common.save")}
          title={t("common.save")}
        >
          <Check aria-hidden="true" size={17} />
        </button>
        <button
          type="button"
          className="icon-button photo-rename-action"
          disabled={saving}
          aria-label={t("common.cancel")}
          title={t("common.cancel")}
          onClick={cancel}
        >
          <X aria-hidden="true" size={17} />
        </button>
      </div>
      {error ? (
        <small className="photo-title-error" role="alert">
          {t("photo.locationFailed")}
        </small>
      ) : null}
    </form>
  );
}
