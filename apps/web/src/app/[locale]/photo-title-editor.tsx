"use client";

import { getMessage, type SupportedLocale } from "@gprn/i18n";
import { Check, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function PhotoTitleEditor({
  title,
  locale,
  editable,
  onSave,
}: {
  readonly title: string;
  readonly locale: SupportedLocale;
  readonly editable: boolean;
  readonly onSave: (title: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = (key: Parameters<typeof getMessage>[1]) => getMessage(locale, key);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!editable || !editing)
    return (
      <div className="photo-title-line">
        <strong>{title}</strong>
        {editable ? (
          <button
            className="icon-button photo-rename-action"
            type="button"
            aria-label={t("photo.rename")}
            title={t("photo.rename")}
            onClick={() => {
              setDraft(title);
              setFailed(false);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
        ) : null}
      </div>
    );

  return (
    <form
      className="photo-title-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !draft.trim()) return;
        setBusy(true);
        setFailed(false);
        try {
          await onSave(draft.trim());
          setEditing(false);
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        aria-label={t("photo.title")}
        disabled={busy}
        maxLength={140}
        ref={inputRef}
        required
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!busy) setEditing(false);
          }
        }}
      />
      <div className="photo-title-controls">
        <button
          aria-label={t("common.save")}
          title={t("common.save")}
          className="icon-button photo-rename-action"
          disabled={busy || !draft.trim()}
          type="submit"
        >
          <Check aria-hidden="true" size={17} />
        </button>
        <button
          aria-label={t("common.cancel")}
          title={t("common.cancel")}
          className="icon-button photo-rename-action"
          disabled={busy}
          onClick={() => setEditing(false)}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </div>
      {failed ? (
        <small className="photo-title-error" role="alert">
          {t("photo.renameFailed")}
        </small>
      ) : null}
    </form>
  );
}
