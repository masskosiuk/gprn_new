"use client";

import { useEffect, useRef, useState } from "react";
import { getMessage, isSupportedLocale, type MessageKey } from "@gprn/i18n";
import { Clock3, Eye, RefreshCw, Swords, ThumbsUp, Trophy } from "lucide-react";
import { useCommunity } from "./community";
import type { ServerBattlePayload } from "./home-client";

export interface MyBattleWork {
  id: string;
  photoId: string;
  title: string;
  displayUrl: string | null;
  category: { slug: string; nameKey: string } | null;
  season: { id: string; name: string | null; nameKey: string; endsAt: string };
  round: number;
  votes: number;
  roundVotes: number;
  wonRounds: number;
  votesToAdvance: number;
  status: string;
  battle: ServerBattlePayload | null;
}

const statusKeys: Record<string, MessageKey> = {
  ACTIVE: "battles.open",
  PENDING: "battles.pendingModeration",
  WAITING: "battles.waitingOpponent",
  WINNER: "battles.seasonWinner",
  COMPLETED: "battles.seasonFinished",
  WITHDRAWN: "battles.participationWithdrawn",
  UNAVAILABLE: "battles.unavailable",
};

export function MyBattles({
  onPhotoOpen,
  onBattleOpen,
}: {
  onPhotoOpen(work: MyBattleWork): void;
  onBattleOpen(battle: ServerBattlePayload): void;
}) {
  const { userId, locale, request, login } = useCommunity();
  const t = (key: MessageKey) =>
    getMessage(isSupportedLocale(locale) ? locale : "en", key);
  const api = useRef(request);
  api.current = request;
  const [works, setWorks] = useState<MyBattleWork[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setWorks([]);
    setCursor(null);
    setLoadingMore(false);
    setError(false);
    setLoading(Boolean(userId));
    if (userId)
      void api
        .current<{ works: MyBattleWork[]; nextCursor: string | null }>(
          "/battles/mine",
          { signal: controller.signal, cache: "no-store" },
        )
        .then((data) => {
          if (current === generation.current) {
            setWorks(data.works);
            setCursor(data.nextCursor);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted && current === generation.current)
            setError(true);
        })
        .finally(() => {
          if (current === generation.current) setLoading(false);
        });
    return () => {
      controller.abort();
      generation.current++;
    };
  }, [userId, version]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const requested = cursor,
      current = generation.current;
    setLoadingMore(true);
    setError(false);
    try {
      const data = await api.current<{
        works: MyBattleWork[];
        nextCursor: string | null;
      }>(`/battles/mine?cursor=${encodeURIComponent(requested)}`, {
        cache: "no-store",
      });
      if (current !== generation.current) return;
      setWorks((old) => [
        ...old,
        ...data.works.filter(
          (work) => !old.some((item) => item.id === work.id),
        ),
      ]);
      setCursor(data.nextCursor === requested ? null : data.nextCursor);
    } catch {
      if (current === generation.current) setError(true);
    } finally {
      if (current === generation.current) setLoadingMore(false);
    }
  }

  if (!userId)
    return (
      <div className="battle-deck-empty">
        <Swords size={28} aria-hidden="true" />
        <p>{t("battles.mineSignIn")}</p>
        <button
          className="primary-action compact"
          onClick={login}
          type="button"
        >
          {t("auth.login")}
        </button>
      </div>
    );
  return (
    <div className="my-battles" aria-busy={loading || loadingMore}>
      <div className="my-battles-toolbar">
        <button
          className="icon-button"
          type="button"
          title={t("battles.refresh")}
          aria-label={t("battles.refresh")}
          disabled={loading}
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {loading ? (
        <p role="status">{t("common.loading")}</p>
      ) : !works.length && !error ? (
        <div className="battle-deck-empty">
          <Swords size={28} aria-hidden="true" />
          <p>{t("battles.mineEmpty")}</p>
        </div>
      ) : null}
      {error ? <p role="alert">{t("battles.mineLoadFailed")}</p> : null}
      <div className="my-battles-grid">
        {works.map((work) => (
          <article key={work.id} className="my-battle-work">
            <button
              type="button"
              className="my-battle-photo"
              disabled={!work.displayUrl}
              aria-label={work.title}
              onClick={() => onPhotoOpen(work)}
            >
              {work.displayUrl ? (
                <img src={work.displayUrl} alt={work.title} loading="lazy" />
              ) : (
                <Swords aria-hidden="true" size={32} />
              )}
            </button>
            <div className="my-battle-details">
              <div className="my-battle-title">
                <h2 title={work.title}>{work.title}</h2>
                {work.battle ? (
                  <button
                    className="icon-button"
                    type="button"
                    title={t("battles.openBattle")}
                    aria-label={t("battles.openBattle")}
                    onClick={() => onBattleOpen(work.battle!)}
                  >
                    <Eye size={18} />
                  </button>
                ) : null}
              </div>
              <p className="my-battle-season">
                {work.season.name ??
                  t(work.season.nameKey as MessageKey) ??
                  t("season.title")}
                {work.category ? (
                  <>
                    {" "}
                    ·{" "}
                    {t(`category.${work.category.slug}` as MessageKey) ??
                      t(work.category.nameKey as MessageKey) ??
                      work.category.slug}
                  </>
                ) : null}
              </p>
              <span
                className={`my-battle-state${work.status === "WINNER" ? " is-winner" : ""}`}
              >
                {work.status === "WINNER" ? (
                  <Trophy size={15} />
                ) : work.status === "WAITING" ? (
                  <Clock3 size={15} />
                ) : (
                  <Swords size={15} />
                )}
                {t(statusKeys[work.status] ?? "battles.unavailable")}
              </span>
              <dl className="my-battle-metrics">
                <div>
                  <dt>{t("battles.seasonVotes")}</dt>
                  <dd>
                    <ThumbsUp size={16} aria-hidden="true" />
                    <span>
                      {new Intl.NumberFormat(locale).format(work.votes)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t("battles.round")}</dt>
                  <dd>{work.round}</dd>
                </div>
                <div>
                  <dt>{t("battles.roundVotes")}</dt>
                  <dd>
                    {work.roundVotes}
                    <small> / {work.votesToAdvance}</small>
                  </dd>
                </div>
              </dl>
            </div>
          </article>
        ))}
      </div>
      {cursor ? (
        <button
          className="secondary-action compact my-battles-more"
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? t("common.loading") : t("battles.loadMore")}
        </button>
      ) : null}
    </div>
  );
}
