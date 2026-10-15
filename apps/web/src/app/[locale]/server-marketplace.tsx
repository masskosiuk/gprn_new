"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Expand, ShoppingBag } from "lucide-react";
import { getMessage, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import {
  DigitalProductSection,
  type DigitalProductOffer,
} from "./digital-products";
import { PublicationTools, useCommunity } from "./community";
import {
  marketplacePageSize,
  selectMarketplaceDemos,
  type MarketplaceDemoWork,
} from "../../lib/marketplace-catalog";

type Product = Omit<DigitalProductOffer, "kind"> & {
  kind: "PHOTO" | "VIDEO" | "PRESET" | "LUT";
  currency?: string;
  videoUrl?: string;
  photoId?: string;
  demoPreview?: boolean;
};
export function ServerMarketplace({
  initialProductId,
  demoWorks = [],
  onDemoPreview,
}: {
  initialProductId?: string;
  demoWorks?: readonly MarketplaceDemoWork[];
  onDemoPreview: (id: string) => void;
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
  const [digitalPage, setDigitalPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [digitalTotal, setDigitalTotal] = useState(0);
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
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);
    const load = (type: string | null, currentPage: number) => {
      if (!type)
        return Promise.resolve({ products: [] as Product[], total: 0 });
      const query = new URLSearchParams({
        kind: type,
        genre,
        search,
        page: String(currentPage),
        pageSize: String(marketplacePageSize),
        ...(selected ? { id: selected } : {}),
      });
      return request<{ products: Product[]; total: number }>(
        "/digital-products?" + query,
        { signal },
      );
    };
    Promise.all([
      load(
        selected
          ? "ALL"
          : kind === "ALL"
            ? "MEDIA"
            : ["PHOTO", "VIDEO"].includes(kind)
              ? kind
              : null,
        selected ? 1 : page,
      ),
      load(
        selected
          ? null
          : kind === "ALL"
            ? "DIGITAL"
            : ["PRESET", "LUT"].includes(kind)
              ? kind
              : null,
        digitalPage,
      ),
    ])
      .then(([media, digital]) => {
        if (controller.signal.aborted) return;
        setProducts([...media.products, ...digital.products]);
        const selectedDigital =
          selected &&
          media.products.some(
            (product) => product.kind === "PRESET" || product.kind === "LUT",
          );
        setTotal(selectedDigital ? 0 : media.total);
        setDigitalTotal(selectedDigital ? media.total : digital.total);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setProducts([]);
          setTotal(0);
          setDigitalTotal(0);
          setError(
            text("Не удалось загрузить каталог", "Could not load the catalog"),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, genre, search, page, digitalPage, version, selected]);
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
  const mediaProducts = products.filter(
    (product) => product.kind === "PHOTO" || product.kind === "VIDEO",
  );
  const demoProducts: Product[] = selectMarketplaceDemos(
    demoWorks,
    { kind, genre, search, page, selected },
    mediaProducts.map((product) => product.photoId),
    locale,
  ).map((work) => ({
    ...work,
    id: `demo:${work.id}`,
    photoId: work.id,
    priceMinor: 0,
    isDemo: true,
    demoPreview: true,
  }));
  const showMedia =
    !["PRESET", "LUT"].includes(kind) &&
    (!selected || mediaProducts.length > 0);
  const showDigital =
    !["PHOTO", "VIDEO"].includes(kind) &&
    (!selected ||
      products.some(
        (product) => product.kind === "PRESET" || product.kind === "LUT",
      ));
  function pagination(
    current: number,
    count: number,
    change: (page: number) => void,
    label: string,
  ) {
    if (count <= marketplacePageSize) return null;
    return (
      <nav className="community-pagination" aria-label={label}>
        <button
          className="icon-button"
          type="button"
          aria-label={text("Предыдущая страница", "Previous page")}
          title={text("Предыдущая страница", "Previous page")}
          disabled={current === 1 || loading}
          onClick={() => change(current - 1)}
        >
          <ChevronLeft size={20} />
        </button>
        <span>
          {current} / {Math.ceil(count / marketplacePageSize)}
        </span>
        <button
          className="icon-button"
          type="button"
          aria-label={text("Следующая страница", "Next page")}
          title={text("Следующая страница", "Next page")}
          disabled={current * marketplacePageSize >= count || loading}
          onClick={() => change(current + 1)}
        >
          <ChevronRight size={20} />
        </button>
      </nav>
    );
  }
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
              setDigitalPage(1);
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
              setDigitalPage(1);
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
              setDigitalPage(1);
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
            setPage(1);
            setDigitalPage(1);
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
      {loading ? <p role="status">{text("Загрузка…", "Loading…")}</p> : null}
      <div
        className={`marketplace-layout${!showMedia ? " is-digital-only" : !showDigital ? " is-media-only" : ""}`}
      >
        {showMedia ? (
          <div className="marketplace-media">
            <h2 className="marketplace-section-title">
              {text("Фото и видео", "Photos and videos")}
            </h2>
            {!loading &&
            !error &&
            !mediaProducts.length &&
            !demoProducts.length ? (
              <p className="empty-state">
                {text("Товары не найдены", "No products found")}
              </p>
            ) : null}
            <div className="product-grid">
              {[...mediaProducts, ...demoProducts].map((product) => (
                <article className="product-card" key={product.id}>
                  {product.videoUrl ? (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      poster={product.imageUrl}
                      src={product.videoUrl}
                    />
                  ) : product.demoPreview ? (
                    <button
                      className="marketplace-media-preview"
                      type="button"
                      aria-label={`${t("photo.openPreview")}: ${product.title}`}
                      onClick={() => onDemoPreview(product.photoId!)}
                    >
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        loading="lazy"
                      />
                    </button>
                  ) : (
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      loading="lazy"
                    />
                  )}
                  <div className="product-body">
                    <span className="pill">
                      {t(
                        product.kind === "VIDEO" ? "nav.video" : "nav.discover",
                      )}
                    </span>
                    {product.demoPreview ? (
                      <span className="product-kind-label">
                        <small>{t("product.demo")}</small>
                      </span>
                    ) : null}
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
                    {product.description ? <p>{product.description}</p> : null}
                    {!product.demoPreview ? (
                      <strong>
                        {new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency: product.currency ?? "USD",
                        }).format(product.priceMinor / 100)}
                      </strong>
                    ) : null}
                    {product.demoPreview ? (
                      <button
                        className="secondary-action compact"
                        type="button"
                        onClick={() => onDemoPreview(product.photoId!)}
                      >
                        <Expand size={16} />
                        {text("Просмотр", "Preview")}
                      </button>
                    ) : (
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
                    )}
                    <PublicationTools
                      comments={false}
                      source={{
                        type: product.demoPreview ? "PHOTO" : "PRODUCT",
                        id: product.demoPreview ? product.photoId! : product.id,
                        title: product.title ?? "",
                        image: product.imageUrl,
                        path: product.demoPreview
                          ? `/${locale}/profile?author=${encodeURIComponent(product.seller?.username ?? "")}&photo=${product.photoId}`
                          : "/" + locale + "/marketplace?product=" + product.id,
                      }}
                    />
                  </div>
                </article>
              ))}
            </div>
            {pagination(
              page,
              total,
              setPage,
              text("Фото и видео", "Photos and videos"),
            )}
          </div>
        ) : null}
        {showDigital ? (
          <aside
            className="marketplace-digital"
            aria-label={text("Пресеты и LUT", "Presets and LUTs")}
          >
            {!loading && !error && !digitalTotal ? (
              <p className="empty-state">
                {text("Товары не найдены", "No products found")}
              </p>
            ) : null}
            {digital("PRESET").length ? (
              <DigitalProductSection
                kind="preset"
                catalog
                locale={locale}
                offers={digital("PRESET")}
                apiRoot={root}
                purchase={purchase}
              />
            ) : null}
            {digital("LUT").length ? (
              <DigitalProductSection
                kind="lut"
                catalog
                locale={locale}
                offers={digital("LUT")}
                apiRoot={root}
                purchase={purchase}
              />
            ) : null}
            {pagination(
              digitalPage,
              digitalTotal,
              setDigitalPage,
              text("Пресеты и LUT", "Presets and LUTs"),
            )}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
