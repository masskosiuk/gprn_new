"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { getMessage, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import {
  DigitalProductSection,
  type DigitalProductOffer,
} from "./digital-products";
import { PublicationTools, useCommunity } from "./community";

type Product = Omit<DigitalProductOffer, "kind"> & {
  kind: "PHOTO" | "VIDEO" | "PRESET" | "LUT";
  currency?: string;
  videoUrl?: string;
};
export function ServerMarketplace({
  initialProductId,
}: {
  initialProductId?: string;
}) {
  const { request, root, userId, login, locale: language } = useCommunity();
  const locale = language as SupportedLocale;
  const t = (key: MessageKey) => getMessage(locale, key);
  const text = (ru: string, en: string) =>
    locale === "ru" || locale === "uk" ? ru : en;
  const [kind, setKind] = useState("ALL");
  const [genre, setGenre] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setSelected(initialProductId ?? null);
  }, [initialProductId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      kind,
      genre,
      search,
      page: String(page),
      ...(selected ? { id: selected } : {}),
    });
    request<{ products: Product[]; total: number }>(
      "/digital-products?" + query,
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      },
    )
      .then((data) => {
        setProducts(data.products);
        setTotal(data.total);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setProducts([]);
          setError(
            text("Не удалось загрузить каталог", "Could not load the catalog"),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, genre, search, page, version, selected]);
  async function purchase(offer: DigitalProductOffer) {
    if (!userId) {
      login();
      return false;
    }
    if (offer.isDemo) return true;
    await request("/digital-products/" + offer.id + "/purchase", {
      method: "POST",
    });
    return true;
  }
  const digital = (type: "PRESET" | "LUT") =>
    products.filter(
      (product) => product.kind === type,
    ) as DigitalProductOffer[];
  return (
    <section className="page-section server-marketplace">
      <div className="community-filters marketplace-filters">
        <label>
          {text("Категория", "Category")}
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
              setSelected(null);
            }}
          >
            <option value="ALL">{t("category.all")}</option>
            <option value="PHOTO">{t("nav.discover")}</option>
            <option value="VIDEO">{t("nav.video")}</option>
            <option value="PRESET">{t("marketplace.preset")}</option>
            <option value="LUT">LUT</option>
          </select>
        </label>
        <label>
          {text("Жанр", "Genre")}
          <select
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value);
              setPage(1);
              setSelected(null);
            }}
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
            aria-label={t("common.search")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              setSelected(null);
            }}
          />
        </label>
      </div>
      {selected ? (
        <button
          type="button"
          className="secondary-action"
          onClick={() => {
            setSelected(null);
            window.history.replaceState(
              null,
              "",
              "/" + locale + "/marketplace",
            );
          }}
        >
          {text("Все товары", "All products")}
        </button>
      ) : null}
      {error ? (
        <p role="status">
          {error}
          <button type="button" onClick={() => setVersion((v) => v + 1)}>
            {text("Повторить", "Retry")}
          </button>
        </p>
      ) : null}
      {loading ? (
        <p role="status">{text("Загрузка…", "Loading…")}</p>
      ) : !products.length ? (
        <p>{text("Товары не найдены", "No products found")}</p>
      ) : null}
      <div className="product-grid">
        {products
          .filter((p) => p.kind === "PHOTO" || p.kind === "VIDEO")
          .map((product) => (
            <article className="product-card" key={product.id}>
              {product.videoUrl ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  poster={product.imageUrl}
                  src={product.videoUrl}
                />
              ) : (
                <img
                  src={product.imageUrl}
                  alt={product.title}
                  loading="lazy"
                />
              )}
              <div className="product-body">
                <span className="pill">
                  {t(product.kind === "VIDEO" ? "nav.video" : "nav.discover")}
                </span>
                <h2>{product.title}</h2>
                {product.seller ? (
                  <Link
                    href={
                      "/" +
                      locale +
                      "/profile?author=" +
                      encodeURIComponent(product.seller.username)
                    }
                  >
                    {product.seller.displayName}
                  </Link>
                ) : null}
                <p>{product.description}</p>
                <strong>
                  {new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: product.currency ?? "USD",
                  }).format(product.priceMinor / 100)}
                </strong>
                <button
                  type="button"
                  className="primary-action compact"
                  onClick={() => {
                    if (!userId) login();
                    else
                      setError(
                        text(
                          "Оплата стоковых материалов пока не подключена.",
                          "Stock payment checkout is not connected yet.",
                        ),
                      );
                  }}
                >
                  <ShoppingBag size={16} />
                  {t("marketplace.buy")}
                </button>
                <PublicationTools
                  comments={false}
                  source={{
                    type: "PRODUCT",
                    id: product.id,
                    title: product.title ?? "",
                    image: product.imageUrl,
                    path: "/" + locale + "/marketplace?product=" + product.id,
                  }}
                />
              </div>
            </article>
          ))}
      </div>
      <DigitalProductSection
        kind="preset"
        catalog
        locale={locale}
        offers={digital("PRESET")}
        apiRoot={root}
        purchase={purchase}
      />
      <DigitalProductSection
        kind="lut"
        catalog
        locale={locale}
        offers={digital("LUT")}
        apiRoot={root}
        purchase={purchase}
      />
      {total > 24 ? (
        <div className="community-pagination">
          <button
            type="button"
            disabled={page === 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            ←
          </button>
          <span>
            {page} / {Math.ceil(total / 24)}
          </span>
          <button
            type="button"
            disabled={page * 24 >= total || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      ) : null}
    </section>
  );
}
