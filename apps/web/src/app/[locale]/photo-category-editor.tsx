"use client";

import { getMessage, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import { Check, Pencil, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface PhotoGenre {
  readonly slug: string;
}

export function photoGenreLabel(slug: string, locale: SupportedLocale): string {
  const key = `category.${slug}` as MessageKey;
  const label = getMessage(locale, key);
  return label && label !== key ? label : slug;
}

export function PhotoCategoryEditor({
  slug,
  locale,
  editable,
  pressed,
  onBrowse,
  onLoad,
  onSave,
}: {
  readonly slug: string;
  readonly locale: SupportedLocale;
  readonly editable: boolean;
  readonly pressed?: boolean;
  readonly onBrowse: () => void;
  readonly onLoad: () => Promise<readonly PhotoGenre[]>;
  readonly onSave: (slug: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slug);
  const [options, setOptions] = useState<readonly PhotoGenre[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"load" | "save" | null>(null);
  const generation = useRef(0);
  const selectRef = useRef<HTMLSelectElement>(null);
  const t = (key: MessageKey) => getMessage(locale, key);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (editing && !loading) selectRef.current?.focus();
  }, [editing, loading]);

  function cancel() {
    generation.current++;
    setEditing(false);
    setLoading(false);
    setError(null);
  }

  async function start() {
    const request = ++generation.current;
    setDraft(slug);
    setOptions([]);
    setEditing(true);
    setLoading(true);
    setError(null);
    try {
      const genres = await onLoad();
      if (request !== generation.current) return;
      setOptions(genres);
      if (!genres.length) setError("load");
    } catch {
      if (request === generation.current) setError("load");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }

  if (!editable || !editing)
    return (
      <span className="photo-category-line">
        <button
          className="photo-meta-tag"
          aria-pressed={pressed}
          onClick={onBrowse}
          type="button"
        >
          {photoGenreLabel(slug, locale)}
        </button>
        {editable ? (
          <button
            type="button"
            className="icon-button photo-rename-action"
            aria-label={t("photo.changeGenre")}
            title={t("photo.changeGenre")}
            onClick={start}
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
        ) : null}
      </span>
    );

  return (
    <form
      className="photo-category-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          loading ||
          saving ||
          error === "load" ||
          !options.some((option) => option.slug === draft)
        )
          return;
        if (draft === slug) {
          cancel();
          return;
        }
        setSaving(true);
        setError(null);
        try {
          await onSave(draft);
          setEditing(false);
        } catch {
          setError("save");
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
      <select
        ref={selectRef}
        aria-label={t("photo.genre")}
        disabled={loading || saving || error === "load"}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
      >
        {!options.some((option) => option.slug === slug) ? (
          <option value={slug} disabled>
            {photoGenreLabel(slug, locale)}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.slug} value={option.slug}>
            {photoGenreLabel(option.slug, locale)}
          </option>
        ))}
      </select>
      <div className="photo-title-controls">
        {error === "load" ? (
          <button
            type="button"
            className="icon-button photo-rename-action"
            aria-label={t("photo.retryGenres")}
            title={t("photo.retryGenres")}
            onClick={start}
          >
            <RotateCw aria-hidden="true" size={17} />
          </button>
        ) : (
          <button
            type="submit"
            className="icon-button photo-rename-action"
            disabled={
              loading ||
              saving ||
              !options.some((option) => option.slug === draft)
            }
            aria-label={t("common.save")}
            title={t("common.save")}
          >
            <Check aria-hidden="true" size={17} />
          </button>
        )}
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
          {t(error === "load" ? "photo.genreLoadFailed" : "photo.genreFailed")}
        </small>
      ) : null}
    </form>
  );
}
