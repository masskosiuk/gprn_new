"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Filter,
  MapPin,
  Search,
  Star,
  X,
} from "lucide-react";
import { getMessage, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import { DiscussionButton, useCommunity } from "./community";

type Named = { slug: string; nameKey: string };
type Creator = {
  id: string;
  username: string;
  displayName: string;
  headline: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  tier: string;
  isVerifiedExpert: boolean;
  rating: string | null;
  reviews: number;
  reputation: number | null;
  languages: string[];
  categories: Named[];
  city: { id: string; nameKey: string; label: string } | null;
  country: Named | null;
};
export type Directory = {
  entries: Creator[];
  total: number;
  page: number;
  pageSize: number;
  countries: Named[];
  categories: Named[];
  cities: { id: string; nameKey: string; country: { slug: string } }[];
};
export type Leader = {
  username: string;
  displayName: string;
  rating: number;
  battles: number;
  wins: number;
  rank: number;
  avatarUrl: string | null;
  cityNameKey: string | null;
};

function useLabels() {
  const { locale: language } = useCommunity();
  const locale = language as SupportedLocale;
  const t = (key: MessageKey) => getMessage(locale, key);
  const label = (value: string, fallback = value) => {
    const key = value
      .replace(/^category\.(.+)\.name$/, "category.$1")
      .replace(/^city\.(.+)\.name$/, "map.location.$1");
    const translated = getMessage(locale, key as MessageKey);
    return translated && translated !== key ? translated : fallback;
  };
  const text = (ru: string, en: string) =>
    locale === "ru" || locale === "uk" ? ru : en;
  const profile = (username: string) =>
    `/${locale}/profile?author=${encodeURIComponent(username)}`;
  return { locale, t, label, text, profile };
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  return src ? (
    <img src={src} alt={name} loading="lazy" />
  ) : (
    <span className="directory-avatar-placeholder" aria-hidden="true">
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ServerLeaderboard({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { request, initialPublicData } = useCommunity();
  const { locale, t, label, text, profile } = useLabels();
  const [rows, setRows] = useState<Leader[]>(
    initialPublicData?.leaders?.entries.slice(0, 10) ?? [],
  );
  const [state, setState] = useState(
    initialPublicData?.leaders ? "ready" : "loading",
  );
  const firstRefresh = useRef(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!firstRefresh.current || !initialPublicData?.leaders)
      setState("loading");
    firstRefresh.current = false;
    request<{ entries: Leader[] }>("/leaderboards/global", {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setRows(data.entries.slice(0, 10));
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [version]);
  return (
    <section className={`page-section${embedded ? " experts-ranking" : ""}`}>
      {embedded && (
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t("nav.leaderboard")}</span>
            <h2>{t("section.leaderboard.title")}</h2>
            <p>
              {text(
                "Топ-10 фотографов по глобальной репутации.",
                "Top 10 photographers by global reputation.",
              )}
            </p>
          </div>
        </div>
      )}
      {state === "error" ? (
        <p role="status">
          {text("Не удалось загрузить рейтинг.", "Could not load the ranking.")}{" "}
          <button
            className="text-link-button"
            type="button"
            onClick={() => setVersion((v) => v + 1)}
          >
            {text("Повторить", "Retry")}
          </button>
        </p>
      ) : state === "loading" ? (
        <p role="status">{text("Загрузка…", "Loading…")}</p>
      ) : !rows.length ? (
        <p>{text("Рейтинг пока пуст", "No rankings yet")}</p>
      ) : (
        <div
          className="leaderboard-table"
          role="table"
          aria-label={text("Топ-10 фотографов", "Top 10 photographers")}
        >
          <div className="leaderboard-row is-head" role="row">
            <span className="leaderboard-rank">{t("leaderboard.rank")}</span>
            <span>{t("leaderboard.photographer")}</span>
            <span className="leaderboard-reputation">
              {t("leaderboard.reputation")}
            </span>
            <span className="leaderboard-change">{text("Победы", "Wins")}</span>
            <span className="leaderboard-battles">
              {t("leaderboard.battles")}
            </span>
          </div>
          {rows.map((row) => (
            <div className="leaderboard-row" role="row" key={row.username}>
              <span className="leaderboard-rank">{row.rank}</span>
              <span className="leaderboard-person">
                <Link href={profile(row.username)} aria-label={row.displayName}>
                  <Avatar name={row.displayName} src={row.avatarUrl} />
                </Link>
                <strong>
                  <Link href={profile(row.username)}>{row.displayName}</Link>
                </strong>
                <small>{row.cityNameKey ? label(row.cityNameKey) : ""}</small>
              </span>
              <span
                className="leaderboard-reputation"
                data-label={t("leaderboard.reputation")}
              >
                {row.rating.toLocaleString(locale)}
              </span>
              <span
                className="leaderboard-change"
                data-label={text("Победы", "Wins")}
              >
                {row.wins.toLocaleString(locale)}
              </span>
              <span
                className="leaderboard-battles"
                data-label={t("leaderboard.battles")}
              >
                {row.battles.toLocaleString(locale)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ServerExperts() {
  const { request, initialPublicData } = useCommunity();
  const { locale, t, label, text, profile } = useLabels();
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    country: "",
    city: "",
    minRating: "",
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Directory | null>(
    initialPublicData?.directory ?? null,
  );
  const [state, setState] = useState(
    initialPublicData?.directory ? "ready" : "loading",
  );
  const firstRefresh = useRef(true);
  const [version, setVersion] = useState(0);
  const change = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "country" ? { city: "" } : {}),
    }));
    setPage(1);
  };
  useEffect(() => {
    const controller = new AbortController();
    if (!firstRefresh.current || !initialPublicData?.directory)
      setState("loading");
    firstRefresh.current = false;
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ ...filters, page: String(page) });
      request<Directory>("/profiles?" + query, { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) {
            setData(value);
            setState("ready");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setState("error");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, page, version]);
  const options = (values: Named[]) =>
    values.map((item) => (
      <option key={item.slug} value={item.slug}>
        {label(item.nameKey)}
      </option>
    ));
  return (
    <>
      <ServerLeaderboard embedded />
      <section className="page-section server-experts">
        <div className="directory-filter-panel">
          <div className="directory-filter-heading">
            <div>
              <Filter aria-hidden="true" size={20} />
              <strong>{t("filters.title")}</strong>
            </div>
            <span aria-live="polite">
              {t("filters.found")}:{" "}
              {state === "ready" ? data?.total.toLocaleString(locale) : "…"}
            </span>
          </div>
          <div className="directory-filter-fields is-experts">
            <label className="search-box directory-search">
              <Search aria-hidden="true" size={18} />
              <span className="visually-hidden">{t("common.search")}</span>
              <input
                type="search"
                value={filters.search}
                placeholder={t("filters.searchExperts")}
                onChange={(e) => change("search", e.target.value)}
              />
            </label>
            <label className="form-field compact-field">
              <span>{t("filters.genre")}</span>
              <select
                value={filters.category}
                onChange={(e) => change("category", e.target.value)}
              >
                <option value="">{t("category.all")}</option>
                {options(data?.categories ?? [])}
              </select>
            </label>
            <label className="form-field compact-field">
              <span>{t("filters.country")}</span>
              <select
                value={filters.country}
                onChange={(e) => change("country", e.target.value)}
              >
                <option value="">{t("filters.countryAll")}</option>
                {options(data?.countries ?? [])}
              </select>
            </label>
            <label className="form-field compact-field">
              <span>{t("filters.city")}</span>
              <select
                value={filters.city}
                onChange={(e) => change("city", e.target.value)}
              >
                <option value="">{t("map.location.all")}</option>
                {data?.cities
                  .filter(
                    (city) =>
                      !filters.country || city.country.slug === filters.country,
                  )
                  .map((city) => (
                    <option key={city.id} value={city.id}>
                      {label(city.nameKey)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field compact-field">
              <span>{t("filters.minRating")}</span>
              <select
                value={filters.minRating}
                onChange={(e) => change("minRating", e.target.value)}
              >
                <option value="">{t("filters.ratingAny")}</option>
                {["4", "4.5", "4.8"].map((value) => (
                  <option key={value} value={value}>
                    {value}+
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="secondary-action compact directory-reset"
            onClick={() => {
              setFilters({
                search: "",
                category: "",
                country: "",
                city: "",
                minRating: "",
              });
              setPage(1);
            }}
          >
            <X size={15} />
            {t("common.reset")}
          </button>
        </div>
        {state === "error" ? (
          <p role="status">
            {text(
              "Не удалось загрузить каталог.",
              "Could not load the directory.",
            )}{" "}
            <button
              type="button"
              className="text-link-button"
              onClick={() => setVersion((v) => v + 1)}
            >
              {text("Повторить", "Retry")}
            </button>
          </p>
        ) : state === "loading" ? (
          <p role="status">{text("Загрузка…", "Loading…")}</p>
        ) : (
          <>
            <div className="expert-grid">
              {data?.entries.map((author) => (
                <article className="expert-card" key={author.id}>
                  <Link
                    href={profile(author.username)}
                    className="directory-avatar"
                    aria-label={author.displayName}
                  >
                    <Avatar name={author.displayName} src={author.avatarUrl} />
                  </Link>
                  <div className="expert-card-details">
                    {!!author.categories.length && (
                      <div className="expert-genres">
                        {author.categories.slice(0, 2).map((category) => (
                          <span className="pill" key={category.slug}>
                            {label(category.nameKey, category.slug)}
                          </span>
                        ))}
                      </div>
                    )}
                    <h2 className="author-name-line">
                      <Link href={profile(author.username)}>
                        {author.displayName}
                      </Link>
                      {author.isVerifiedExpert && (
                        <BadgeCheck
                          size={16}
                          className="directory-verified"
                          aria-label={text(
                            "Подтверждённый эксперт",
                            "Verified expert",
                          )}
                        />
                      )}
                    </h2>
                    {author.headline && <p>{author.headline}</p>}
                    <div className="meta-row creator-card-meta">
                      {author.city && (
                        <span>
                          <MapPin size={14} />
                          {label(author.city.nameKey, author.city.label)}
                        </span>
                      )}
                      {author.rating !== null && (
                        <span>
                          <Star size={14} />
                          {Number(author.rating).toLocaleString(locale)}{" "}
                          {t("experts.rating")}
                        </span>
                      )}
                      {author.reviews > 0 && (
                        <span>
                          {author.reviews.toLocaleString(locale)}{" "}
                          {t("experts.reviews")}
                        </span>
                      )}
                      {author.reputation !== null && (
                        <span>
                          {t("leaderboard.reputation")}:{" "}
                          {author.reputation.toLocaleString(locale)}
                        </span>
                      )}
                      <span className="creator-card-discussion">
                        <DiscussionButton
                          compact
                          source={{
                            type: "PROFILE",
                            id: author.username,
                            title: author.displayName,
                            image:
                              author.coverUrl ?? author.avatarUrl ?? undefined,
                            path: profile(author.username),
                          }}
                        />
                      </span>
                    </div>
                    {author.languages.length > 0 && (
                      <div className="language-list">
                        {author.languages.map((language) => (
                          <span key={language}>{language.toUpperCase()}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {!data?.entries.length && (
              <p className="empty-state">{t("experts.empty")}</p>
            )}
            {data && data.total > data.pageSize && (
              <nav
                className="directory-pagination"
                aria-label={text("Страницы каталога", "Directory pages")}
              >
                <button
                  type="button"
                  className="secondary-action compact"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label={text("Предыдущая страница", "Previous page")}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {page} / {Math.ceil(data.total / data.pageSize)}
                </span>
                <button
                  type="button"
                  className="secondary-action compact"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label={text("Следующая страница", "Next page")}
                >
                  <ChevronRight size={18} />
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </>
  );
}
