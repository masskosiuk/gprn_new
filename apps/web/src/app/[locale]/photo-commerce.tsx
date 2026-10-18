"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  Palette,
  Save,
  Settings2,
  ShoppingBag,
  X,
} from "lucide-react";
import { useCommunity } from "./community";
import { ApiRequestError } from "../../lib/auth-client";
import type { DigitalProductOffer } from "./digital-products";

export interface PhotoSale {
  id: string;
  priceMinor: number;
  currency: string;
  isDemo?: boolean;
}
interface Commerce {
  sale: PhotoSale | null;
  owned: boolean;
  licenseTerms: string;
  authorUsername: string | null;
  appliedProductId: string | null;
  authorProducts: DigitalProductOffer[];
  settings: {
    enabled: boolean;
    priceMinor: number;
    licenseTerms: string;
    appliedProductId: string | null;
  } | null;
}
export function PhotoCommerce({
  photoId,
  sale,
  onChange,
  closePreview,
  purchased,
}: {
  photoId: string;
  sale?: PhotoSale | null;
  onChange: (sale: PhotoSale | null) => void;
  closePreview: () => void;
  purchased: () => Promise<void>;
}) {
  const { request, locale, userId, login, root } = useCommunity();
  const text = (ru: string, en: string) =>
    locale === "ru" || locale === "uk" ? ru : en;
  const money = (sale: PhotoSale) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: sale.currency,
    }).format(sale.priceMinor / 100);
  const [data, setData] = useState<Commerce>();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [price, setPrice] = useState("");
  const [terms, setTerms] = useState("");
  const [applied, setApplied] = useState("");
  const [rights, setRights] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  function load(result: Commerce) {
    setData(result);
    setEnabled(result.settings?.enabled ?? false);
    setPrice(
      result.settings?.priceMinor
        ? String(result.settings.priceMinor / 100)
        : "",
    );
    setTerms(result.settings?.licenseTerms ?? "");
    setApplied(result.settings?.appliedProductId ?? "");
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(undefined);
    setError("");
    request<Commerce>(`/photos/${photoId}/commerce`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) load(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            text(
              "Не удалось загрузить настройки работы.",
              "Could not load this work's settings.",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [photoId, userId, version]);
  function message(error: unknown) {
    const code = error instanceof ApiRequestError ? error.code : null;
    return code === "INSUFFICIENT_FUNDS"
      ? text(
          "Недостаточно средств в кошельке. Покупка не выполнена.",
          "Insufficient wallet funds. No purchase was made.",
        )
      : code === "SALE_QUOTE_CHANGED"
        ? text(
            "Цена или условия изменились. Обновите данные и подтвердите покупку заново.",
            "The price or terms changed. Reload and confirm again.",
          )
        : code === "SALE_ORIGINAL_REQUIRED"
          ? text(
              "Для продажи нужна ваша публичная одобренная работа с загруженным оригиналом и открытый профиль.",
              "Selling requires your approved public upload, its original file and a public profile.",
            )
          : text(
              "Не удалось сохранить изменения. Проверьте данные и повторите.",
              "Could not save changes. Check the details and try again.",
            );
  }
  const currentSale = data ? data.sale : sale;
  const attached = data?.authorProducts.find(
    (p) => p.id === data.appliedProductId,
  );
  return (
    <section
      className="photo-commerce"
      aria-label={text("Продажа и обработка", "Sales and processing")}
    >
      {data?.settings && (
        <button
          className="community-text-action photo-settings-action"
          type="button"
          disabled={busy}
          onClick={() => {
            setEditing(!editing);
            setConfirm(false);
            setError("");
          }}
        >
          <Settings2 size={16} />
          {text(
            "Настройки продажи и обработки",
            "Sales and processing settings",
          )}
        </button>
      )}
      {data?.authorProducts.length ? (
        <Link
          className="photo-author-presets"
          onClick={closePreview}
          href={`/${locale}/profile?author=${encodeURIComponent(data.authorUsername ?? "")}${attached ? `&product=${encodeURIComponent(attached.id)}` : ""}#presets`}
        >
          <Palette size={16} />
          {attached
            ? attached.kind === "LUT"
              ? text("LUT с этой работы", "LUT used in this work")
              : text(
                  "Пресет с этой фотографии",
                  "Preset used in this photograph",
                )
            : text("Пресеты автора", "Author's presets")}
        </Link>
      ) : null}
      {data?.owned ? (
        <div className="photo-purchase-owned">
          <a
            className="primary-action compact"
            href={`${root}/photos/${photoId}/original`}
          >
            <Download size={17} />
            {text("Скачать оригинал", "Download original")}
          </a>
          <details>
            <summary>{text("Условия покупки", "Purchase terms")}</summary>
            <p className="photo-license-terms">{data.licenseTerms}</p>
          </details>
        </div>
      ) : currentSale && !data?.settings ? (
        <div className="photo-sale-summary">
          <strong>{money(currentSale)}</strong>
          <button
            type="button"
            className="primary-action compact"
            disabled={loading || busy || !data || currentSale.isDemo}
            title={
              currentSale.isDemo
                ? text(
                    "Демо-работа: покупка недоступна",
                    "Demo work: purchase unavailable",
                  )
                : undefined
            }
            onClick={() => {
              if (!userId) {
                login();
                return;
              }
              setConfirm(!confirm);
              setAccepted(false);
              setError("");
            }}
          >
            <ShoppingBag size={17} />
            {text("Купить", "Buy")}
          </button>
        </div>
      ) : null}
      {currentSale?.isDemo && (
        <p className="photo-demo-notice">
          {text(
            "Демо-работа. Цена приведена для примера, покупка и списание средств недоступны.",
            "Demo work. The price is illustrative; purchases and charges are unavailable.",
          )}
        </p>
      )}
      {confirm && data?.sale && !data.sale.isDemo && (
        <form
          className="photo-checkout"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !accepted || !data.sale) return;
            setBusy(true);
            setError("");
            try {
              await request(`/photos/${photoId}/purchase`, {
                method: "POST",
                body: JSON.stringify({
                  accepted: true,
                  priceMinor: data.sale.priceMinor,
                  licenseTerms: data.licenseTerms,
                }),
              });
              const result = await request<Commerce>(
                `/photos/${photoId}/commerce`,
              );
              if (!result.owned) throw new Error("Purchase was not completed");
              load(result);
              setConfirm(false);
              await purchased();
            } catch (error) {
              setError(message(error));
              setAccepted(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="photo-license-terms">{data.licenseTerms}</p>
          <label className="photo-commerce-checkbox">
            <input
              type="checkbox"
              required
              checked={accepted}
              disabled={busy}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            {text(
              "Принимаю условия использования автора",
              "I accept the author's usage terms",
            )}
          </label>
          <button
            type="submit"
            className="primary-action compact"
            disabled={busy || !accepted}
          >
            <ShoppingBag size={17} />
            {text("Оплатить из кошелька", "Pay from wallet")} ·{" "}
            {money(data.sale)}
          </button>
        </form>
      )}
      {editing && data?.settings && (
        <form
          className="photo-sale-editor"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const priceMinor = Math.round(
              Number(price.replace(",", ".")) * 100,
            );
            if (
              enabled &&
              (!Number.isSafeInteger(priceMinor) ||
                priceMinor < 1 ||
                priceMinor > 1_000_000 ||
                terms.trim().length < 10 ||
                !rights)
            ) {
              setError(
                text(
                  "Укажите цену, условия использования и подтвердите право продажи.",
                  "Enter the price, usage terms and confirm your selling rights.",
                ),
              );
              return;
            }
            setBusy(true);
            setError("");
            try {
              const result = await request<Commerce>(
                `/photos/${photoId}/commerce`,
                {
                  method: "PATCH",
                  body: JSON.stringify({
                    enabled,
                    priceMinor,
                    licenseTerms: terms,
                    rightsConfirmed: rights,
                    appliedProductId: applied || null,
                  }),
                },
              );
              load(result);
              onChange(result.sale);
              setEditing(false);
              setRights(false);
            } catch (error) {
              setError(message(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="photo-commerce-checkbox">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {text("Разрешить продажу", "Allow sales")}
          </label>
          {enabled && (
            <>
              <label>
                {text("Цена, USD", "Price, USD")}
                <input
                  type="number"
                  min="0.01"
                  max="10000"
                  step="0.01"
                  required
                  value={price}
                  disabled={busy}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
              <label>
                {text("Условия использования", "Usage terms")}
                <textarea
                  value={terms}
                  minLength={10}
                  maxLength={2000}
                  required
                  disabled={busy}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </label>
              <label className="photo-commerce-checkbox">
                <input
                  type="checkbox"
                  required
                  checked={rights}
                  disabled={busy}
                  onChange={(e) => setRights(e.target.checked)}
                />
                {text(
                  "У меня есть права на продажу этой работы",
                  "I hold the rights to sell this work",
                )}
              </label>
            </>
          )}
          <label>
            {text("Использованный пресет или LUT", "Preset or LUT used")}
            <select
              value={applied}
              disabled={busy}
              onChange={(e) => setApplied(e.target.value)}
            >
              <option value="">{text("Не привязан", "Not linked")}</option>
              {data.authorProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title} ({product.kind})
                </option>
              ))}
            </select>
          </label>
          <div className="photo-sale-editor-actions">
            <button
              type="submit"
              className="primary-action compact"
              disabled={busy}
            >
              <Save size={16} />
              {text("Сохранить", "Save")}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={text("Отмена", "Cancel")}
              title={text("Отмена", "Cancel")}
              disabled={busy}
              onClick={() => {
                load(data);
                setEditing(false);
              }}
            >
              <X size={18} />
            </button>
          </div>
        </form>
      )}
      {error && (
        <div className="photo-commerce-error" role="status">
          <p>{error}</p>
          <button
            className="community-text-action"
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirm(false);
              setVersion((v) => v + 1);
            }}
          >
            {text("Обновить данные", "Reload details")}
          </button>
        </div>
      )}
    </section>
  );
}

export function PhotoPurchases() {
  const { request, userId, locale, root } = useCommunity();
  const [items, setItems] = useState<
    {
      photoId: string;
      title: string;
      displayUrl: string;
      licenseTerms: string | null;
    }[]
  >([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    request<{ purchases: typeof items }>("/photos/purchases", {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setItems(result.purchases);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [userId]);
  if (!items.length && !error) return null;
  return (
    <section className="photo-purchases">
      <h2>
        {locale === "ru"
          ? "Купленные фото и видео"
          : "Purchased photos and videos"}
      </h2>
      {error && (
        <p role="status">
          {locale === "ru"
            ? "Не удалось загрузить покупки. Обновите страницу."
            : "Could not load purchases. Reload the page."}
        </p>
      )}
      <div className="photo-purchases-grid">
        {items.map((item) => (
          <article key={item.photoId}>
            <img src={item.displayUrl} alt={item.title} loading="lazy" />
            <h3>{item.title}</h3>
            <a
              className="secondary-action compact"
              href={`${root}/photos/${item.photoId}/original`}
            >
              <Download size={16} />
              {locale === "ru" ? "Скачать оригинал" : "Download original"}
            </a>
            <details>
              <summary>
                {locale === "ru" ? "Условия покупки" : "Purchase terms"}
              </summary>
              <p className="photo-license-terms">{item.licenseTerms}</p>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
