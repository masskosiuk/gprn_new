"use client";

import { getMessage, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import {
  BadgeCheck,
  Camera,
  Compass,
  ImagePlus,
  MapPin,
  Medal,
  ShoppingBag,
  Swords,
  Trophy,
  Upload,
  UserCircle,
  UserPlus,
  X,
  type LucideIcon
} from "lucide-react";
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

type SectionId =
  | "home"
  | "discover"
  | "battles"
  | "challenges"
  | "leaderboard"
  | "map"
  | "marketplace"
  | "experts"
  | "profile";

interface HomeClientProps {
  readonly locale: SupportedLocale;
}

interface NavItem {
  readonly Icon: LucideIcon;
  readonly id: SectionId;
  readonly messageKey: MessageKey;
}

interface RegistrationForm {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

interface Feedback {
  readonly kind: "error" | "success";
  readonly text: string;
}

interface RegisteredProfile {
  readonly email: string;
  readonly name: string;
}

interface SelectedPhoto {
  readonly file: File;
  readonly name: string;
  readonly sizeLabel: string;
  readonly type: string;
}

const navItems: readonly NavItem[] = [
  { Icon: Compass, id: "home", messageKey: "nav.home" },
  { Icon: ImagePlus, id: "discover", messageKey: "nav.discover" },
  { Icon: Swords, id: "battles", messageKey: "nav.battles" },
  { Icon: BadgeCheck, id: "challenges", messageKey: "nav.challenges" },
  { Icon: Medal, id: "leaderboard", messageKey: "nav.leaderboard" },
  { Icon: MapPin, id: "map", messageKey: "nav.map" },
  { Icon: ShoppingBag, id: "marketplace", messageKey: "nav.marketplace" },
  { Icon: Trophy, id: "experts", messageKey: "nav.experts" },
  { Icon: UserCircle, id: "profile", messageKey: "nav.profile" }
];

const highlightedSections: readonly SectionId[] = ["battles", "marketplace", "experts"];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyRegistrationForm: RegistrationForm = {
  email: "",
  name: "",
  password: ""
};

export function HomeClient({ locale }: HomeClientProps): ReactNode {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("home");
  const [isRegistrationOpen, setRegistrationOpen] = useState(false);
  const [registrationForm, setRegistrationForm] = useState<RegistrationForm>(emptyRegistrationForm);
  const [registrationFeedback, setRegistrationFeedback] = useState<Feedback | null>(null);
  const [registeredProfile, setRegisteredProfile] = useState<RegisteredProfile | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(null);
  const [photoFeedback, setPhotoFeedback] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPhoto) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedPhoto.file);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedPhoto]);

  useEffect(() => {
    if (!isRegistrationOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setRegistrationOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRegistrationOpen]);

  const activeItem = navItems.find((item) => item.id === activeSection);
  const activeLabel = getMessage(locale, activeItem?.messageKey ?? "nav.home");
  const sectionSummary = getSectionSummary(locale, activeSection, registeredProfile);

  function selectSection(sectionId: SectionId): void {
    setActiveSection(sectionId);

    window.requestAnimationFrame(() => {
      const targetId = sectionId === "home" ? "home-hero" : "workspace-panel";
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openRegistration(): void {
    setRegistrationOpen(true);
    setRegistrationFeedback(null);
  }

  function openPhotoPicker(): void {
    fileInputRef.current?.click();
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPhotoFeedback(getMessage(locale, "photo.invalid"));
      event.target.value = "";
      return;
    }

    setSelectedPhoto({
      file,
      name: file.name,
      sizeLabel: formatFileSize(file.size),
      type: file.type || "image"
    });
    setPhotoFeedback("");
    setActiveSection("discover");
    event.target.value = "";

    window.requestAnimationFrame(() => {
      document.getElementById("workspace-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function savePhotoDraft(): void {
    if (!selectedPhoto) {
      openPhotoPicker();
      return;
    }

    setPhotoFeedback(getMessage(locale, "photo.saved"));
  }

  function updateRegistrationField(field: keyof RegistrationForm, value: string): void {
    setRegistrationForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function handleRegistrationSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const name = registrationForm.name.trim();
    const email = registrationForm.email.trim();
    const password = registrationForm.password;

    if (name.length < 2 || !emailPattern.test(email) || password.length < 8) {
      setRegistrationFeedback({
        kind: "error",
        text: getMessage(locale, "auth.validation")
      });
      return;
    }

    setRegisteredProfile({ email, name });
    setRegistrationForm(emptyRegistrationForm);
    setRegistrationFeedback({
      kind: "success",
      text: getMessage(locale, "auth.success")
    });
    setActiveSection("profile");

    window.requestAnimationFrame(() => {
      document.getElementById("workspace-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href={`/${locale}`}>
          {getMessage(locale, "app.name")}
        </a>

        <nav aria-label={getMessage(locale, "nav.home")} className="nav">
          {navItems.map(({ Icon, id, messageKey }) => (
            <button
              aria-current={activeSection === id ? "page" : undefined}
              className={`nav-button${activeSection === id ? " is-active" : ""}`}
              key={id}
              onClick={() => {
                selectSection(id);
              }}
              type="button"
            >
              <Icon aria-hidden="true" size={15} />
              <span>{getMessage(locale, messageKey)}</span>
            </button>
          ))}
        </nav>

        <button className="header-action" onClick={openRegistration} type="button">
          <UserPlus aria-hidden="true" size={17} />
          <span>{getMessage(locale, "auth.join")}</span>
        </button>
      </header>

      <input
        accept="image/*"
        className="visually-hidden"
        onChange={handlePhotoChange}
        ref={fileInputRef}
        type="file"
      />

      <section className="hero" id="home-hero">
        <div className="hero-copy">
          <h1>{getMessage(locale, "home.headline")}</h1>
          <p>{getMessage(locale, "home.subhead")}</p>

          <div className="hero-actions">
            <button className="primary-action" onClick={openPhotoPicker} type="button">
              <Camera aria-hidden="true" size={18} />
              {getMessage(locale, "photo.add")}
            </button>
            <button className="secondary-action" onClick={openRegistration} type="button">
              <UserPlus aria-hidden="true" size={18} />
              {getMessage(locale, "auth.join")}
            </button>
          </div>
        </div>

        <div className="photo-grid" aria-live="polite">
          <div className={`photo-tile photo-tile-large${previewUrl ? " has-photo" : ""}`}>
            {previewUrl ? (
              <img alt={`${getMessage(locale, "photo.selected")}: ${selectedPhoto?.name ?? ""}`} src={previewUrl} />
            ) : (
              <ImagePlus aria-hidden="true" size={56} />
            )}
          </div>
          <div className="stack">
            <div className="photo-tile info-tile">
              <span>{selectedPhoto ? selectedPhoto.name : getMessage(locale, "photo.empty")}</span>
              {selectedPhoto ? <small>{`${selectedPhoto.sizeLabel} / ${selectedPhoto.type}`}</small> : null}
            </div>
            <div className="photo-tile upload-tile">
              <Upload aria-hidden="true" size={24} />
              <button className="tile-button" onClick={openPhotoPicker} type="button">
                {selectedPhoto ? getMessage(locale, "photo.change") : getMessage(locale, "photo.add")}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace" id="workspace-panel">
        <div className="workspace-copy">
          <span className="eyebrow">{getMessage(locale, "sections.active")}</span>
          <h2>{activeLabel}</h2>
          <p>{sectionSummary}</p>

          <div className="workspace-actions">
            <button className="primary-action compact" onClick={openPhotoPicker} type="button">
              <Camera aria-hidden="true" size={17} />
              {getMessage(locale, "photo.add")}
            </button>
            {activeSection === "profile" && !registeredProfile ? (
              <button className="secondary-action compact" onClick={openRegistration} type="button">
                <UserPlus aria-hidden="true" size={17} />
                {getMessage(locale, "auth.join")}
              </button>
            ) : null}
          </div>
        </div>

        <aside className="upload-card" aria-live="polite">
          <h3>{getMessage(locale, "photo.selected")}</h3>
          <p>{selectedPhoto ? selectedPhoto.name : getMessage(locale, "photo.empty")}</p>
          {selectedPhoto ? <small>{`${selectedPhoto.sizeLabel} / ${selectedPhoto.type}`}</small> : null}

          <div className="upload-actions">
            <button className="secondary-action compact" onClick={openPhotoPicker} type="button">
              {selectedPhoto ? getMessage(locale, "photo.change") : getMessage(locale, "photo.add")}
            </button>
            <button className="primary-action compact" disabled={!selectedPhoto} onClick={savePhotoDraft} type="button">
              {getMessage(locale, "photo.saveDraft")}
            </button>
          </div>

          <p className={photoFeedback ? "status-message" : "helper-message"}>
            {photoFeedback || getMessage(locale, "photo.note")}
          </p>
        </aside>
      </section>

      <section className="future-strip">
        {highlightedSections.map((sectionId) => {
          const item = navItems.find((navItem) => navItem.id === sectionId);

          if (!item) {
            return null;
          }

          return (
            <button
              className={`future-item${activeSection === sectionId ? " is-active" : ""}`}
              key={sectionId}
              onClick={() => {
                selectSection(sectionId);
              }}
              type="button"
            >
              <strong>{getMessage(locale, item.messageKey)}</strong>
              <span>
                {sectionId === "battles" ? <Trophy aria-hidden="true" size={14} /> : null}
                {getMessage(locale, "common.comingSoon")}
              </span>
            </button>
          );
        })}
      </section>

      {isRegistrationOpen ? (
        <div
          className="modal-backdrop"
          onMouseDown={() => {
            setRegistrationOpen(false);
          }}
          role="presentation"
        >
          <section
            aria-labelledby="registration-title"
            aria-modal="true"
            className="auth-dialog"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            role="dialog"
          >
            <div className="dialog-header">
              <h2 id="registration-title">{getMessage(locale, "auth.title")}</h2>
              <button
                aria-label={getMessage(locale, "auth.close")}
                className="icon-button"
                onClick={() => {
                  setRegistrationOpen(false);
                }}
                type="button"
              >
                <X aria-hidden="true" size={19} />
              </button>
            </div>

            <form className="auth-form" onSubmit={handleRegistrationSubmit}>
              <label className="form-field" htmlFor="registration-name">
                <span>{getMessage(locale, "auth.name")}</span>
                <input
                  autoComplete="name"
                  id="registration-name"
                  minLength={2}
                  onChange={(event) => {
                    updateRegistrationField("name", event.target.value);
                  }}
                  required
                  type="text"
                  value={registrationForm.name}
                />
              </label>

              <label className="form-field" htmlFor="registration-email">
                <span>{getMessage(locale, "auth.email")}</span>
                <input
                  autoComplete="email"
                  id="registration-email"
                  onChange={(event) => {
                    updateRegistrationField("email", event.target.value);
                  }}
                  required
                  type="email"
                  value={registrationForm.email}
                />
              </label>

              <label className="form-field" htmlFor="registration-password">
                <span>{getMessage(locale, "auth.password")}</span>
                <input
                  autoComplete="new-password"
                  id="registration-password"
                  minLength={8}
                  onChange={(event) => {
                    updateRegistrationField("password", event.target.value);
                  }}
                  required
                  type="password"
                  value={registrationForm.password}
                />
              </label>

              <button className="primary-action full" type="submit">
                {getMessage(locale, "auth.submit")}
              </button>
            </form>

            {registrationFeedback ? (
              <p className={`dialog-feedback ${registrationFeedback.kind}`} role="status">
                {registrationFeedback.text}
              </p>
            ) : (
              <p className="helper-message">{getMessage(locale, "auth.note")}</p>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function getSectionSummary(
  locale: SupportedLocale,
  activeSection: SectionId,
  registeredProfile: RegisteredProfile | null
): string {
  if (activeSection === "home") {
    return getMessage(locale, "home.subhead");
  }

  if (activeSection === "profile") {
    return registeredProfile
      ? `${registeredProfile.name} - ${registeredProfile.email}`
      : getMessage(locale, "sections.profilePrompt");
  }

  return getMessage(locale, "sections.placeholder");
}

function formatFileSize(bytes: number): string {
  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${Math.max(1, Math.round(kilobytes))} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
