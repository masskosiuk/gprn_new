"use client";

import { getMessage, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import {
  Download,
  ImagePlus,
  Palette,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiRequestError } from "../../lib/auth-client";
import { paletteFromPixels } from "@gprn/domain";
import Link from "next/link";
import { PublicationTools } from "./community";

export interface DigitalProductOffer {
  readonly id: string;
  readonly kind?: "PRESET" | "LUT";
  readonly genre?: string | null;
  readonly seller?: { username: string; displayName: string };
  readonly imageUrl: string;
  readonly priceMinor: number;
  readonly title?: string;
  readonly titleKey?: MessageKey;
  readonly description?: string | null;
  readonly colors?: readonly string[];
  readonly status?: string;
  readonly isDemo?: boolean;
  readonly owned?: boolean;
  readonly files?: readonly {
    id: string;
    name: string;
    format: string;
    size: number;
  }[];
}

export interface ProductInput {
  readonly kind: "PRESET" | "LUT";
  readonly title: string;
  readonly description: string;
  readonly genre?: string;
  readonly priceMinor: number;
  readonly active: boolean;
  readonly coverDataUrl?: string;
  readonly keepFileIds: readonly string[];
  readonly files: readonly { name: string; dataUrl: string }[];
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ProductDialog({
  title,
  close,
  children,
  className = "",
  closeDisabled = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  className?: string;
  closeDisabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  function dismiss() {
    if (closeDisabled) return;
    dialog.current?.close();
    close();
  }
  return (
    <dialog
      aria-label={title}
      className={`product-dialog ${className}`}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          dismiss();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          aria-label="Close"
          className="icon-button"
          disabled={closeDisabled}
          onClick={dismiss}
          type="button"
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

function ProductCover({
  offer,
  title,
  paletteLabel,
  formats,
}: {
  offer: DigitalProductOffer;
  title: string;
  paletteLabel: string;
  formats: string;
}) {
  const [extracted, setExtracted] = useState<readonly string[]>([]);
  const colors = offer.colors?.length ? offer.colors : extracted;
  useEffect(() => setExtracted([]), [offer.imageUrl]);
  return (
    <div className="profile-product-preview">
      <img
        alt={title}
        src={offer.imageUrl}
        loading="lazy"
        crossOrigin={offer.colors?.length ? undefined : "anonymous"}
        onLoad={(event) => {
          if (offer.colors?.length) return;
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 80;
            canvas.height = 50;
            const context = canvas.getContext("2d", {
              willReadFrequently: true,
            });
            if (!context) return;
            context.drawImage(event.currentTarget, 0, 0, 80, 50);
            const rgba = context.getImageData(0, 0, 80, 50).data;
            const rgb = new Uint8Array(80 * 50 * 3);
            for (let pixel = 0; pixel < 80 * 50; pixel++)
              rgb.set(rgba.subarray(pixel * 4, pixel * 4 + 3), pixel * 3);
            setExtracted(paletteFromPixels(rgb));
          } catch {
            setExtracted([]);
          }
        }}
      />
      {formats && <span className="product-file-chip">{formats}</span>}
      {colors.length > 0 && (
        <div
          className="product-swatch-row"
          aria-label={paletteLabel}
          role="img"
        >
          {colors.map((color) =>
            /^#[0-9a-f]{6}$/i.test(color) ? (
              <span
                key={color}
                style={{ backgroundColor: color }}
                title={color}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function ProductEditor({
  kind,
  offer,
  locale,
  save,
  close,
}: {
  kind: "PRESET" | "LUT";
  offer: DigitalProductOffer | null;
  locale: SupportedLocale;
  save: (input: ProductInput, id?: string) => Promise<void>;
  close: () => void;
}) {
  const t = (key: MessageKey) => getMessage(locale, key);
  const [title, setTitle] = useState(
    offer?.title ?? (offer?.titleKey ? t(offer.titleKey) : ""),
  );
  const [description, setDescription] = useState(offer?.description ?? "");
  const [genre, setGenre] = useState(offer?.genre ?? "");
  const [price, setPrice] = useState(String((offer?.priceMinor ?? 2500) / 100));
  const [free, setFree] = useState(offer?.priceMinor === 0);
  const [active, setActive] = useState(!offer || offer.status === "PUBLISHED");
  const [cover, setCover] = useState<string>();
  const [files, setFiles] = useState<File[]>([]);
  const [kept, setKept] = useState([...(offer?.files ?? [])]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const coverInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const totalSize =
    files.reduce((sum, file) => sum + file.size, 0) +
    kept.reduce((sum, file) => sum + file.size, 0);
  return (
    <ProductDialog
      title={t(offer ? "product.edit" : "product.add")}
      closeDisabled={busy}
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        className="product-editor"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || reading) return;
          const priceMinor = free ? 0 : Math.round(Number(price) * 100);
          if (
            !title.trim() ||
            (!cover && !offer?.imageUrl) ||
            (!files.length && !kept.length) ||
            totalSize > 12 * 1024 * 1024 ||
            files.length + kept.length > 20 ||
            !Number.isSafeInteger(priceMinor) ||
            priceMinor < (free ? 0 : 1)
          ) {
            setError(t("product.invalid"));
            return;
          }
          setBusy(true);
          setError("");
          try {
            const uploads = [];
            for (const file of files)
              uploads.push({ name: file.name, dataUrl: await readFile(file) });
            await save(
              {
                kind,
                title: title.trim(),
                description,
                genre,
                priceMinor,
                active,
                coverDataUrl: cover,
                keepFileIds: kept.map((file) => file.id),
                files: uploads,
              },
              offer?.id,
            );
            close();
          } catch (failure) {
            setError(
              t(
                failure instanceof ApiRequestError && failure.status === 400
                  ? "product.invalid"
                  : "product.failed",
              ),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label className="form-field">
            <span>{t("product.name")}</span>
            <input
              maxLength={140}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>{t("product.description")}</span>
            <textarea
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="product-editor-cover">
            <label className="form-field">
              <span>{t("discover.category")}</span>
              <select
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
              >
                <option value="">{t("category.all")}</option>
                {(
                  [
                    "portrait",
                    "landscape",
                    "street",
                    "nature",
                    "architecture",
                    "documentary",
                    "commercial",
                    "boudoir",
                    "cinematic",
                  ] as const
                ).map((key) => (
                  <option key={key} value={key}>
                    {key === "cinematic"
                      ? locale === "ru"
                        ? "Кино"
                        : "Cinema"
                      : t(("category." + key) as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            {cover || offer?.imageUrl ? (
              <img src={cover ?? offer!.imageUrl} alt={t("product.cover")} />
            ) : (
              <ImagePlus size={42} />
            )}
            <button
              className="secondary-action compact"
              disabled={reading}
              onClick={() => coverInput.current?.click()}
              type="button"
            >
              <ImagePlus size={17} />
              {t("product.cover")}
            </button>
          </div>
          <small>{t("product.coverLimit")}</small>
          <input
            hidden
            ref={coverInput}
            accept="image/jpeg,image/png,image/webp,image/avif"
            type="file"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              if (
                file.size > 5 * 1024 * 1024 ||
                ![
                  "image/jpeg",
                  "image/png",
                  "image/webp",
                  "image/avif",
                ].includes(file.type)
              ) {
                setError(t("product.invalid"));
                return;
              }
              setReading(true);
              try {
                setCover(await readFile(file));
                setError("");
              } catch {
                setError(t("product.failed"));
              } finally {
                setReading(false);
              }
            }}
          />
          <div className="product-editor-file-heading">
            <strong>{t("product.files")}</strong>
            <button
              className="secondary-action compact"
              onClick={() => filesInput.current?.click()}
              type="button"
            >
              <Upload size={16} />
              {t("product.files")}
            </button>
          </div>
          <small>
            {kind === "LUT" ? ".CUBE" : ".XMP, .LRTEMPLATE"} ·{" "}
            {t("product.fileLimits")}
          </small>
          <input
            hidden
            ref={filesInput}
            multiple
            accept={kind === "LUT" ? ".cube" : ".xmp,.lrtemplate"}
            type="file"
            onChange={(event) => {
              const next = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (
                next.some(
                  (file) =>
                    file.size > 8 * 1024 * 1024 ||
                    !(
                      kind === "LUT" ? /\.cube$/i : /\.(xmp|lrtemplate)$/i
                    ).test(file.name),
                ) ||
                files.length + kept.length + next.length > 20 ||
                totalSize + next.reduce((sum, file) => sum + file.size, 0) >
                  12 * 1024 * 1024
              ) {
                setError(t("product.invalid"));
                return;
              }
              setFiles((current) => [...current, ...next]);
              setError("");
            }}
          />
          <ul className="product-file-list">
            {kept.map((file) => (
              <li key={file.id}>
                <span>{file.name}</span>
                <button
                  aria-label={`${t("product.remove")}: ${file.name}`}
                  title={t("product.remove")}
                  className="icon-button"
                  type="button"
                  onClick={() =>
                    setKept((current) =>
                      current.filter((item) => item.id !== file.id),
                    )
                  }
                >
                  <X size={16} />
                </button>
              </li>
            ))}
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span>{file.name}</span>
                <button
                  aria-label={`${t("product.remove")}: ${file.name}`}
                  title={t("product.remove")}
                  className="icon-button"
                  type="button"
                  onClick={() =>
                    setFiles((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="product-editor-price">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={free}
                onChange={(event) => setFree(event.target.checked)}
              />
              <span>{t("product.free")}</span>
            </label>
            <label className="form-field">
              <span>{t("product.price")}</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="10000"
                disabled={free}
                required={!free}
                value={free ? "0" : price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </label>
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            <span>{t("product.active")}</span>
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="form-feedback is-error">
            {error}
          </p>
        )}
        <footer>
          <button
            className="secondary-action compact"
            disabled={busy}
            onClick={close}
            type="button"
          >
            {t("product.cancel")}
          </button>
          <button
            className="primary-action compact"
            disabled={busy || reading}
            type="submit"
          >
            <ShoppingBag size={17} />
            {t(busy ? "product.saving" : "product.save")}
          </button>
        </footer>
      </form>
    </ProductDialog>
  );
}

export function DigitalProductSection({
  kind,
  offers = [],
  locale,
  canManage = false,
  purchased = false,
  save,
  archive,
  purchase,
  apiRoot,
  catalog = false,
}: {
  kind: "preset" | "lut";
  offers?: readonly DigitalProductOffer[];
  locale: SupportedLocale;
  canManage?: boolean;
  purchased?: boolean;
  save?: (input: ProductInput, id?: string) => Promise<void>;
  archive?: (id: string) => Promise<void>;
  purchase: (offer: DigitalProductOffer) => Promise<boolean>;
  apiRoot: string;
  catalog?: boolean;
}) {
  const t = (key: MessageKey) => getMessage(locale, key);
  const [editor, setEditor] = useState<
    DigitalProductOffer | null | undefined
  >();
  const [selected, setSelected] = useState<DigitalProductOffer>();
  const [downloads, setDownloads] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<DigitalProductOffer>();
  const isLut = kind === "lut";
  const Icon = isLut ? Video : Palette;
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(value / 100);
  const titleOf = (offer: DigitalProductOffer) =>
    offer.isDemo && offer.titleKey
      ? t(offer.titleKey)
      : (offer.title ?? (offer.titleKey ? t(offer.titleKey) : ""));
  const formatsOf = (offer: DigitalProductOffer) =>
    [...new Set(offer.files?.map((file) => file.format) ?? [])].join(" · ");
  const preview = (offer: DigitalProductOffer) => {
    setError("");
    setSelected(offer);
    setDownloads(Boolean(canManage || purchased || offer.owned));
  };
  const begin = async (offer: DigitalProductOffer) => {
    setError("");
    setSelected(offer);
    setDownloads(false);
    if (canManage || offer.owned) {
      setDownloads(true);
      return;
    }
    if (offer.priceMinor === 0 || offer.isDemo) {
      setBusy(true);
      try {
        if (await purchase(offer)) setDownloads(true);
        else setSelected(undefined);
      } catch {
        setError(t("product.failed"));
      } finally {
        setBusy(false);
      }
    }
  };
  if (!offers.length && !canManage) return null;
  return (
    <section
      className={`profile-products-section is-${kind}`}
      aria-labelledby={`profile-${kind}-${purchased ? "purchases" : "products"}`}
    >
      <div className="profile-products-heading">
        <span className="profile-products-icon" aria-hidden="true">
          <Icon size={22} />
        </span>
        <div>
          <span className="eyebrow">
            {t(
              purchased
                ? "product.myPurchases"
                : isLut
                  ? "profile.lutOfferEyebrow"
                  : "profile.presetOfferEyebrow",
            )}
          </span>
          <h2 id={`profile-${kind}-${purchased ? "purchases" : "products"}`}>
            {t(
              catalog
                ? isLut
                  ? "marketplace.lut"
                  : "marketplace.preset"
                : purchased
                  ? isLut
                    ? "product.purchasedLuts"
                    : "product.purchasedPresets"
                  : isLut
                    ? "profile.lutOfferTitle"
                    : "profile.presetOfferTitle",
            )}
          </h2>
          {!purchased && (
            <p>
              {t(isLut ? "profile.lutOfferCopy" : "profile.presetOfferCopy")}
            </p>
          )}
        </div>
        {canManage && (
          <button
            className="secondary-action compact product-create-action"
            onClick={() => setEditor(null)}
            type="button"
          >
            <Plus size={17} />
            {t("product.add")}
          </button>
        )}
      </div>
      {!offers.length && <p className="empty-state">{t("product.empty")}</p>}
      <div className="profile-product-grid">
        {offers.map((offer) => {
          const title = titleOf(offer);
          const formats = formatsOf(offer);
          return (
            <article className="profile-product-tile" key={offer.id}>
              <ProductCover
                offer={offer}
                title={title}
                paletteLabel={t("product.colors")}
                formats={formats}
              />
              <div className="profile-product-body">
                <span className="product-kind-label">
                  <Icon size={14} />
                  {t(isLut ? "marketplace.lut" : "marketplace.preset")}
                  {offer.isDemo && <small>{t("product.demo")}</small>}
                  {canManage && offer.status !== "PUBLISHED" && (
                    <small>{t("product.hidden")}</small>
                  )}
                </span>
                <h3>
                  <button
                    className="product-title-trigger"
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => preview(offer)}
                  >
                    {title}
                  </button>
                </h3>
                {offer.seller ? (
                  <Link
                    href={
                      "/" +
                      locale +
                      "/profile?author=" +
                      encodeURIComponent(offer.seller.username)
                    }
                  >
                    {offer.seller.displayName}
                  </Link>
                ) : null}
                {offer.description && <p>{offer.description}</p>}
                {offer.files && (
                  <p>
                    {t("product.fileCount")}: {offer.files.length} · {formats}
                  </p>
                )}
                <div className="profile-product-footer">
                  <strong>
                    {offer.owned
                      ? t("product.purchased")
                      : offer.priceMinor === 0
                        ? t("marketplace.free")
                        : money(offer.priceMinor)}
                  </strong>
                  <div className="product-card-actions">
                    {canManage && (
                      <>
                        <button
                          aria-label={t("product.edit")}
                          title={t("product.edit")}
                          className="icon-button"
                          type="button"
                          onClick={() => setEditor(offer)}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          aria-label={t("product.remove")}
                          title={t("product.remove")}
                          className="icon-button"
                          type="button"
                          onClick={() => setRemoving(offer)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </>
                    )}
                    <button
                      className="primary-action compact"
                      disabled={!offer.files?.length}
                      type="button"
                      onClick={() => void begin(offer)}
                    >
                      {canManage ||
                      offer.owned ||
                      offer.priceMinor === 0 ||
                      offer.isDemo ? (
                        <Download size={16} />
                      ) : (
                        <ShoppingBag size={16} />
                      )}
                      {t(
                        offer.isDemo
                          ? "product.demoDownload"
                          : canManage || offer.owned || offer.priceMinor === 0
                            ? "marketplace.download"
                            : "marketplace.buy",
                      )}
                    </button>
                  </div>
                </div>
                {/^[0-9a-f-]{36}$/i.test(offer.id) &&
                offer.status === "PUBLISHED" ? (
                  <PublicationTools
                    comments={false}
                    source={{
                      type: "PRODUCT",
                      id: offer.id,
                      title,
                      image: offer.imageUrl,
                      path: "/" + locale + "/marketplace?product=" + offer.id,
                    }}
                  />
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {editor !== undefined && save && (
        <ProductEditor
          key={editor?.id ?? "new"}
          kind={isLut ? "LUT" : "PRESET"}
          offer={editor}
          locale={locale}
          save={save}
          close={() => setEditor(undefined)}
        />
      )}
      {selected && (
        <ProductDialog
          title={titleOf(selected)}
          className="product-dialog--preview"
          closeDisabled={busy}
          close={() => {
            if (!busy) setSelected(undefined);
          }}
        >
          <div className="product-detail-grid">
            <div className="product-detail-cover">
              <ProductCover
                offer={selected}
                title={titleOf(selected)}
                paletteLabel={t("product.colors")}
                formats={formatsOf(selected)}
              />
            </div>
            <div className="product-detail-copy">
              <span className="product-kind-label">
                <Icon size={16} />
                {t(isLut ? "marketplace.lut" : "marketplace.preset")}
                {selected.isDemo && <small>{t("product.demo")}</small>}
              </span>
              {selected.seller && (
                <Link
                  href={`/${locale}/profile?author=${encodeURIComponent(selected.seller.username)}`}
                >
                  {selected.seller.displayName}
                </Link>
              )}
              {selected.description && <p>{selected.description}</p>}
              {selected.files && (
                <p>
                  {t("product.fileCount")}: {selected.files.length} ·{" "}
                  {formatsOf(selected)}
                </p>
              )}
              <strong className="product-detail-price">
                {selected.owned
                  ? t("product.purchased")
                  : selected.priceMinor === 0
                    ? t("marketplace.free")
                    : money(selected.priceMinor)}
              </strong>
              {downloads ? (
                <ul className="product-file-list">
                  {selected.files?.map((file) => (
                    <li key={file.id}>
                      <span>{file.name}</span>
                      <a
                        className="secondary-action compact"
                        href={`${apiRoot}/digital-products/${selected.id}/files/${file.id}`}
                        download
                      >
                        <Download size={17} />
                        {t("marketplace.download")}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <button
                    className="primary-action compact"
                    disabled={busy || !selected.files?.length}
                    type="button"
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        if (await purchase(selected)) setDownloads(true);
                        else setSelected(undefined);
                      } catch (failure) {
                        setError(
                          t(
                            failure instanceof ApiRequestError &&
                              failure.code === "INSUFFICIENT_FUNDS"
                              ? "wallet.insufficient"
                              : "product.failed",
                          ),
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {selected.isDemo || selected.priceMinor === 0 ? (
                      <Download size={17} />
                    ) : (
                      <ShoppingBag size={17} />
                    )}
                    {t(
                      selected.isDemo
                        ? "product.demoDownload"
                        : selected.priceMinor === 0
                          ? "marketplace.download"
                          : "product.purchase",
                    )}
                  </button>
                </>
              )}
              {error && (
                <p role="alert" className="form-feedback is-error">
                  {error}
                </p>
              )}
            </div>
          </div>
        </ProductDialog>
      )}
      {removing && archive && (
        <ProductDialog
          title={t("product.remove")}
          closeDisabled={busy}
          close={() => {
            if (!busy) setRemoving(undefined);
          }}
        >
          <p>{t("product.removeConfirm")}</p>
          <button
            className="secondary-action compact"
            disabled={busy}
            type="button"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await archive(removing.id);
                setRemoving(undefined);
              } catch {
                setError(t("product.failed"));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={17} />
            {t("product.remove")}
          </button>
          {error && <p role="alert">{error}</p>}
        </ProductDialog>
      )}
    </section>
  );
}
