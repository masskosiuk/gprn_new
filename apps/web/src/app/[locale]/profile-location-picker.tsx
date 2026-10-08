"use client";

import { getMessage, type SupportedLocale } from "@gprn/i18n";
import { ChevronDown, MapPin } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export interface LocationOption {
  readonly admin1?: string;
  readonly country: string;
  readonly countryCode: string;
  readonly externalId: string;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
}

interface ProfileLocationPickerProps {
  readonly locale: SupportedLocale;
  readonly value: string;
  readonly selection: LocationOption | null;
  readonly onChange: (value: string) => void;
  readonly onSelect: (location: LocationOption) => void;
  readonly search: (
    query: string,
    locale: SupportedLocale,
  ) => Promise<readonly LocationOption[]>;
}

export function ProfileLocationPicker({
  locale,
  value,
  selection,
  onChange,
  onSelect,
  search,
}: ProfileLocationPickerProps) {
  const [isOpen, setOpen] = useState(false);
  const [options, setOptions] = useState<readonly LocationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const query = (selection?.label === value ? selection.name : value).trim();
  const listId = "profile-location-options";
  const t = (key: Parameters<typeof getMessage>[1]) => getMessage(locale, key);

  useEffect(() => {
    if (!isOpen || query.length < 2) {
      setOptions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setOptions([]);
    setActiveIndex(-1);
    setLoading(true);
    const timer = window.setTimeout(() => {
      void search(query, locale)
        .then((locations) => {
          if (cancelled) return;
          setOptions(locations);
          setActiveIndex((current) => Math.min(current, locations.length - 1));
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, query, locale, search]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      document
        .getElementById(`${listId}-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, activeIndex]);

  function select(location: LocationOption) {
    onSelect(location);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        event.key === "ArrowDown"
          ? Math.min(current + 1, Math.max(0, options.length - 1))
          : Math.max(0, current - 1),
      );
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      const location = options[activeIndex];
      if (!loading && location) select(location);
    }
  }

  return (
    <div className="form-field profile-location-field">
      <label htmlFor="profile-location">{t("profile.location")}</label>
      <div
        className="location-combobox"
        ref={wrapperRef}
        onBlur={(event) => {
          if (!wrapperRef.current?.contains(event.relatedTarget as Node | null))
            setOpen(false);
        }}
      >
        <input
          aria-activedescendant={
            isOpen && options[activeIndex]
              ? `${listId}-${activeIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby="profile-location-hint"
          aria-expanded={isOpen && query.length >= 2}
          autoComplete="off"
          id="profile-location"
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t("location.searchPlaceholder")}
          role="combobox"
          type="text"
          value={value}
        />
        <ChevronDown aria-hidden="true" size={17} />
        {isOpen && query.length >= 2 ? (
          <div
            className="location-options profile-location-options"
            id={listId}
            role="listbox"
            aria-label={t("profile.location")}
          >
            {loading ? (
              <div className="location-status" role="status">
                {t("location.loading")}
              </div>
            ) : options.length ? (
              options.map((location, index) => (
                <button
                  aria-selected={location.externalId === selection?.externalId}
                  className={index === activeIndex ? "is-active" : undefined}
                  id={`${listId}-${index}`}
                  key={location.externalId}
                  onClick={() => select(location)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActiveIndex(index)}
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  <MapPin aria-hidden="true" size={15} />
                  <span>{location.label}</span>
                </button>
              ))
            ) : (
              <div className="location-status" role="status">
                {t("location.empty")}
              </div>
            )}
          </div>
        ) : null}
      </div>
      <small id="profile-location-hint">
        {t("location.profileHint")} {t("location.dataBy")}{" "}
        <a href="https://open-meteo.com/" rel="noreferrer" target="_blank">
          Open-Meteo
        </a>
      </small>
    </div>
  );
}
