"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  ShoppingBag,
  X,
} from "lucide-react";
import { getMessage, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import { useCommunity } from "./community";
import { marketplacePageSize } from "../../lib/marketplace-catalog";

type Product = {
  id: string;
  photoId: string;
  kind: "PHOTO" | "VIDEO" | "PRESET" | "LUT";
  title: string;
  imageUrl: string;
  priceMinor: number;
  currency?: string;
  seller: { username: string; displayName: string };
};
export function ServerMarketplace({
  initialProductId,
  version,
  onPreview,
}: {
  initialProductId?: string;
  version: number;
  onPreview: (id: string) => Promise<void>;
}) {
  const { request, locale: language } = useCommunity();
  const locale = language as SupportedLocale;
  const t = (key: MessageKey) => getMessage(locale, key);
  const text = (ru: string, en: string) =>
    locale === "ru" || locale === "uk" ? ru : en;
  const [kind, setKind] = useState("MEDIA");
  const [genre, setGenre] = useState("");
  const [search, setSearch] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(initialProductId);
  useEffect(() => setSelected(initialProductId), [initialProductId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      kind: selected ? "ALL" : kind,
      genre,
      search,
      sort,
      page: String(selected ? 1 : page),
      pageSize: String(marketplacePageSize),
      ...(selected ? { id: selected } : {}),
      ...(min ? { minPrice: String(Math.round(Number(min) * 100)) } : {}),
      ...(max ? { maxPrice: String(Math.round(Number(max) * 100)) } : {}),
    });
    request<{ products: Product[]; total: number }>(
      "/digital-products?" + query,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setProducts(result.products);
          setTotal(result.total);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setProducts([]);
          setTotal(0);
          setError(
            text(
              "Не удалось загрузить каталог. Проверьте фильтры и повторите.",
              "Could not load the catalog. Check filters and retry.",
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, genre, search, min, max, sort, page, selected, retry, version]);
  function change(set: (value: string) => void, value: string) {
    set(value);
    setSelected(undefined);
    setPage(1);
  }
  async function open(product: Product) {
    if (opening) return;
    setOpening(product.id);
    try {
      await onPreview(product.photoId);
    } finally {
      setOpening(undefined);
    }
  }
  return (
    <section className="page-section server-marketplace marketplace-photo-catalog">
      <div className="community-filters marketplace-filters">
        <label>
          {text("Тип работы", "Media type")}
          <select
            value={kind}
            onChange={(e) => change(setKind, e.target.value)}
          >
            <option value="MEDIA">
              {text("Фото и видео", "Photos and videos")}
            </option>
            <option value="PHOTO">{text("Фото", "Photos")}</option>
            <option value="VIDEO">{text("Видео", "Videos")}</option>
          </select>
        </label>
        <label>
          {text("Жанр", "Genre")}
          <select
            value={genre}
            onChange={(e) => change(setGenre, e.target.value)}
          >
            <option value="">{t("category.all")}</option>
            {[
              "portrait",
              "landscape",
              "street",
              "nature",
              "architecture",
              "documentary",
              "commercial",
              "product",
              "boudoir",
              "cinematic",
            ].map((key) => (
              <option key={key} value={key}>
                {key === "cinematic"
                  ? text("Кино", "Cinema")
                  : t(("category." + key) as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("common.search")}
          <input
            type="search"
            value={search}
            onChange={(e) => change(setSearch, e.target.value)}
          />
        </label>
        <label>
          {text("Цена от, USD", "Min price, USD")}
          <input
            type="number"
            min="0"
            max="10000"
            step="0.01"
            value={min}
            onChange={(e) => change(setMin, e.target.value)}
          />
        </label>
        <label>
          {text("Цена до, USD", "Max price, USD")}
          <input
            type="number"
            min="0"
            max="10000"
            step="0.01"
            value={max}
            onChange={(e) => change(setMax, e.target.value)}
          />
        </label>
        <label>
          {text("Сортировка", "Sort")}
          <select
            value={sort}
            onChange={(e) => change(setSort, e.target.value)}
          >
            <option value="">{text("Сначала новые", "Newest first")}</option>
            <option value="price-asc">
              {text("Сначала дешевле", "Lowest price first")}
            </option>
            <option value="price-desc">
              {text("Сначала дороже", "Highest price first")}
            </option>
          </select>
        </label>
        <button
          className="secondary-action compact"
          type="button"
          onClick={() => {
            setKind("MEDIA");
            setGenre("");
            setSearch("");
            setMin("");
            setMax("");
            setSort("");
            setPage(1);
            setSelected(undefined);
            window.history.replaceState(null, "", `/${locale}/marketplace`);
          }}
        >
          <X size={16} />
          {t("discover.clearFilters")}
        </button>
      </div>
      {loading && <p role="status">{text("Загрузка…", "Loading…")}</p>}
      {error && (
        <p role="status">
          {error}{" "}
          <button
            className="community-text-action"
            type="button"
            onClick={() => setRetry((v) => v + 1)}
          >
            {text("Повторить", "Retry")}
          </button>
        </p>
      )}
      {!loading && !error && !products.length && (
        <p className="empty-state">
          {text("Работы в продаже не найдены", "No works for sale found")}
        </p>
      )}
      <div className="product-grid marketplace-sale-grid">
        {products.map((product) =>
          product.kind === "PRESET" || product.kind === "LUT" ? (
            <article key={product.id} className="product-card">
              <img src={product.imageUrl} alt={product.title} />
              <div className="product-body">
                <h2>{product.title}</h2>
                <Link
                  className="secondary-action compact"
                  href={`/${locale}/profile?author=${encodeURIComponent(product.seller.username)}&product=${encodeURIComponent(product.id)}#presets`}
                >
                  {text("Открыть в профиле автора", "View in author's profile")}
                </Link>
              </div>
            </article>
          ) : (
            <article
              key={product.id}
              className="product-card marketplace-sale-card"
            >
              <button
                className="marketplace-media-preview"
                type="button"
                aria-label={`${t("photo.openPreview")}: ${product.title}`}
                disabled={Boolean(opening)}
                onClick={() => void open(product)}
              >
                <img
                  src={product.imageUrl}
                  alt={product.title}
                  loading="lazy"
                />
                <Expand size={18} className="marketplace-preview-icon" />
              </button>
              <div className="product-body">
                <span className="product-kind-label">
                  {product.kind === "VIDEO"
                    ? text("Видео", "Video")
                    : text("Фото", "Photo")}
                </span>
                <h2>
                  <button
                    type="button"
                    className="marketplace-work-title"
                    onClick={() => void open(product)}
                    disabled={Boolean(opening)}
                  >
                    {product.title}
                  </button>
                </h2>
                <Link
                  href={`/${locale}/profile?author=${encodeURIComponent(product.seller.username)}`}
                >
                  {product.seller.displayName}
                </Link>
                <div className="marketplace-sale-footer">
                  <strong>
                    {new Intl.NumberFormat(locale, {
                      style: "currency",
                      currency: product.currency ?? "USD",
                    }).format(product.priceMinor / 100)}
                  </strong>
                  <button
                    type="button"
                    className="primary-action compact"
                    disabled={Boolean(opening)}
                    onClick={() => void open(product)}
                  >
                    <ShoppingBag size={17} />
                    {t("marketplace.buy")}
                  </button>
                </div>
              </div>
            </article>
          ),
        )}
      </div>
      {total > marketplacePageSize && (
        <nav
          className="community-pagination"
          aria-label={text("Страницы каталога", "Catalog pages")}
        >
          <button
            type="button"
            className="icon-button"
            aria-label={text("Предыдущая страница", "Previous page")}
            disabled={page === 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <span>
            {page} / {Math.ceil(total / marketplacePageSize)}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={text("Следующая страница", "Next page")}
            disabled={page * marketplacePageSize >= total || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </nav>
      )}
    </section>
  );
}
