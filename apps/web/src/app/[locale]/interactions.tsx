"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { useCommunity } from "./community";

type Member = {
  id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
};
type Message = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
};
type Thread = {
  id: string;
  topic: string;
  status: string;
  incoming: boolean;
  unread: boolean;
  updatedAt: string;
  peer: Member;
  lastMessage: Message | null;
};
type Inquiry = {
  id: string;
  kind: string;
  status: string;
  body: string;
  reply?: string;
  imageUrl?: string;
  targetPath?: string;
  createdAt: string;
};
type Post = {
  id: string;
  title: string;
  status: string;
  body: string;
  sourcePath?: string;
  moderationReason?: string;
};
type Order = {
  id: string;
  title: string;
  status: string;
  customerId: string;
  providerId: string;
  customer: Member | null;
  provider: Member | null;
  message: string;
  priceMinor: string;
  currency: string;
};
type Tab = "MESSAGE" | "REQUESTS" | "ORDERS" | "INQUIRIES" | "DISCUSSIONS";
const statusRu: Record<string, string> = {
  OPEN: "Открыто",
  ACCEPTED: "Принято",
  DECLINED: "Отклонено",
  CLOSED: "Закрыто",
  UNDER_REVIEW: "На проверке",
  RESOLVED: "Решено",
  DISMISSED: "Отклонено",
  PENDING: "Ожидает ответа",
  APPROVED: "Опубликовано",
  REJECTED: "Отклонено",
  IN_PROGRESS: "В работе",
  SUBMITTED: "На приёмке",
  COMPLETED: "Завершено",
  CANCELLED: "Отменено",
  DISPUTED: "Спор",
};
const topicRu: Record<string, string> = {
  MESSAGE: "Сообщение",
  SHOOT: "Съёмка",
  REVIEW: "Оценка",
  MENTORSHIP: "Менторство",
  REPORT: "Жалоба",
  SUGGESTION: "Предложение",
};

export function MyInteractions() {
  const { locale, userId, login, request, root } = useCommunity();
  const ru = locale === "ru" || locale === "uk";
  const t = (r: string, e: string) => (ru ? r : e);
  const [tab, setTab] = useState<Tab>("MESSAGE");
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const [threads, setThreads] = useState<Thread[]>([]),
    [orders, setOrders] = useState<Order[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]),
    [posts, setPosts] = useState<Post[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null),
    [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<Message[]>([]),
    [messagePage, setMessagePage] = useState(1),
    [messageTotal, setMessageTotal] = useState(0);
  const [version, setVersion] = useState(0),
    [loading, setLoading] = useState(false),
    [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(""),
    [detailError, setDetailError] = useState(""),
    [busy, setBusy] = useState(false),
    [body, setBody] = useState("");
  const failed = t(
    "Не удалось выполнить запрос. Повторите попытку.",
    "The request failed. Please try again.",
  );
  const status = (value: string) =>
    ru ? (statusRu[value] ?? value) : value.toLowerCase().replaceAll("_", " ");
  const topic = (value: string) =>
    ru ? (topicRu[value] ?? value) : value.toLowerCase().replaceAll("_", " ");
  const date = (value: string) =>
    new Date(value).toLocaleString(locale, {
      dateStyle: "short",
      timeStyle: "short",
    });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("thread"),
      orderId = params.get("order");
    if (id) {
      setSelected(id);
      setTab("MESSAGE");
    }
    if (orderId) {
      setSelected(orderId);
      setTab("ORDERS");
    }
    if (params.has("inquiry")) setTab("INQUIRIES");
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setVersion((v) => v + 1);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const load = async () => {
      if (tab === "INQUIRIES") {
        const data = await request<{ inquiries: Inquiry[] }>(
          "/community/inquiries",
          { signal: controller.signal },
        );
        setInquiries(data.inquiries);
      } else if (tab === "DISCUSSIONS") {
        const data = await request<{ posts: Post[] }>("/community/mine", {
          signal: controller.signal,
        });
        setPosts(
          data.posts.filter(
            (p) => (p as Post & { kind: string }).kind === "DISCUSSION",
          ),
        );
      } else if (tab === "ORDERS") {
        const data = await request<{ requests: Order[]; total: number }>(
          "/platform/service-requests?page=" + page,
          { signal: controller.signal },
        );
        setOrders(data.requests);
        setTotal(data.total);
      } else {
        const data = await request<{ threads: Thread[]; total: number }>(
          "/interactions?page=" +
            page +
            (tab === "MESSAGE" ? "&topic=MESSAGE" : "&requests=true"),
          { signal: controller.signal },
        );
        setThreads(data.threads);
        setTotal(data.total);
      }
    };
    load()
      .catch(() => {
        if (!controller.signal.aborted) setError(failed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId, tab, page, version]);
  useEffect(() => {
    if (
      !userId ||
      !selected ||
      !["MESSAGE", "REQUESTS", "ORDERS"].includes(tab)
    )
      return;
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError("");
    const path =
      tab === "ORDERS" ? "/platform/service-requests/" : "/interactions/";
    request<{
      thread?: Thread;
      request?: Order;
      messages: Message[];
      total: number;
    }>(path + selected + "?page=" + messagePage, { signal: controller.signal })
      .then((data) => {
        setThread(data.thread ?? null);
        setOrder(data.request ?? null);
        setMessages(data.messages);
        setMessageTotal(data.total);
        if (data.thread) {
          setThreads((items) =>
            items.map((item) =>
              item.id === selected ? { ...item, unread: false } : item,
            ),
          );
          if (data.thread.topic !== "MESSAGE" && tab === "MESSAGE")
            setTab("REQUESTS");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setDetailError(failed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [userId, selected, tab, messagePage, version]);
  function choose(id: string) {
    setSelected(id);
    setThread(null);
    setOrder(null);
    setMessages([]);
    setBody("");
    setMessagePage(1);
    setDetailError("");
  }
  async function action(value: string) {
    if (!selected || busy) return;
    setBusy(true);
    setDetailError("");
    try {
      await request(
        (tab === "ORDERS" ? "/platform/service-requests/" : "/interactions/") +
          selected,
        { method: "PATCH", body: JSON.stringify({ action: value }) },
      );
      setVersion((v) => v + 1);
    } catch (e) {
      setDetailError(
        (e as { code?: string }).code === "INSUFFICIENT_FUNDS"
          ? t(
              "Недостаточно средств. Оплата не выполнена.",
              "Insufficient funds. Payment was not completed.",
            )
          : failed,
      );
    } finally {
      setBusy(false);
    }
  }
  const terminal = thread
    ? ["CLOSED", "DECLINED"].includes(thread.status)
    : order
      ? ["COMPLETED", "CANCELLED", "DECLINED"].includes(order.status)
      : true;
  if (!userId)
    return (
      <button className="primary-action" type="button" onClick={login}>
        {t("Войти", "Sign in")}
      </button>
    );
  return (
    <section className="page-section interactions-page">
      <nav
        className="interactions-tabs"
        aria-label={t("Мои взаимодействия", "My interactions")}
      >
        {(
          [
            ["MESSAGE", t("Сообщения", "Messages")],
            ["REQUESTS", t("Запросы", "Requests")],
            ["ORDERS", t("Заказы", "Orders")],
            ["INQUIRIES", t("Обращения", "Administration")],
            ["DISCUSSIONS", t("Споры и дискуссии", "Discussions")],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setPage(1);
              setSelected(null);
              setThread(null);
              setOrder(null);
            }}
          >
            {label}
          </button>
        ))}
        <button
          className="icon-button"
          type="button"
          title={t("Обновить", "Refresh")}
          aria-label={t("Обновить", "Refresh")}
          disabled={loading || busy}
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={18} />
        </button>
      </nav>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">{t("Загрузка…", "Loading…")}</p>}
      {tab === "INQUIRIES" ? (
        <div className="interactions-records">
          {inquiries.map((item) => (
            <article key={item.id}>
              <header>
                <strong>{topic(item.kind)}</strong>
                <span>
                  {status(item.status)} · {date(item.createdAt)}
                </span>
              </header>
              <p>{item.body}</p>
              {item.imageUrl && (
                <img
                  className="interaction-attachment"
                  src={root + item.imageUrl}
                  alt={t("Вложение", "Attachment")}
                />
              )}
              {item.targetPath && (
                <Link href={item.targetPath}>
                  {t("Открыть материал", "View material")}
                </Link>
              )}
              {item.reply && (
                <blockquote>
                  <strong>
                    {t("Ответ администрации", "Administration reply")}
                  </strong>
                  <p>{item.reply}</p>
                </blockquote>
              )}
            </article>
          ))}
          {!loading && !error && !inquiries.length && (
            <p>{t("Обращений пока нет", "No inquiries yet")}</p>
          )}
        </div>
      ) : tab === "DISCUSSIONS" ? (
        <div className="interactions-records">
          {posts.map((post) => (
            <article key={post.id}>
              <header>
                <Link href={`/${locale}/discussions?post=${post.id}`}>
                  {post.title}
                </Link>
                <span>{status(post.status)}</span>
              </header>
              <p>{post.body}</p>
              {post.moderationReason && <p>{post.moderationReason}</p>}
              {post.sourcePath && (
                <Link href={post.sourcePath}>{t("Оригинал", "Original")}</Link>
              )}
            </article>
          ))}
          {!loading && !error && !posts.length && (
            <p>{t("Дискуссий пока нет", "No discussions yet")}</p>
          )}
        </div>
      ) : (
        <>
          <div
            className={`interactions-layout ${selected ? "has-selection" : ""}`}
          >
            <div className="interactions-list">
              {tab === "ORDERS"
                ? orders.map((item) => (
                    <button
                      type="button"
                      className={selected === item.id ? "is-active" : ""}
                      key={item.id}
                      onClick={() => choose(item.id)}
                    >
                      <strong>{item.title}</strong>
                      <span>
                        {item.customerId === userId
                          ? item.provider?.displayName
                          : item.customer?.displayName}
                      </span>
                      <small>
                        {status(item.status)} ·{" "}
                        {new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency: item.currency,
                        }).format(Number(item.priceMinor) / 100)}
                      </small>
                    </button>
                  ))
                : threads.map((item) => (
                    <button
                      type="button"
                      className={selected === item.id ? "is-active" : ""}
                      key={item.id}
                      onClick={() => choose(item.id)}
                    >
                      <span className="interaction-list-person">
                        {item.peer.avatarUrl && (
                          <img src={item.peer.avatarUrl} alt="" />
                        )}
                        <strong>{item.peer.displayName}</strong>
                        {item.unread && (
                          <span
                            className="interaction-unread"
                            aria-label={t("Непрочитано", "Unread")}
                          />
                        )}
                      </span>
                      <small>
                        {topic(item.topic)} ·{" "}
                        {t(
                          item.incoming ? "Входящий" : "Исходящий",
                          item.incoming ? "Incoming" : "Outgoing",
                        )}{" "}
                        · {status(item.status)}
                      </small>
                      <span className="interaction-excerpt">
                        {item.lastMessage?.body}
                      </span>
                      <small>{date(item.updatedAt)}</small>
                    </button>
                  ))}
              {!loading &&
                !error &&
                !(tab === "ORDERS" ? orders.length : threads.length) && (
                  <p>{t("Пока пусто", "Nothing here yet")}</p>
                )}
              {total > 30 && (
                <div className="interaction-pagination">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    aria-label="Previous"
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    {page} / {Math.ceil(total / 30)}
                  </span>
                  <button
                    type="button"
                    disabled={page * 30 >= total || loading}
                    aria-label="Next"
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
            <div className="interaction-conversation" aria-busy={detailLoading}>
              {selected && (
                <button
                  type="button"
                  className="interaction-back"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft size={18} />
                  {t("Назад", "Back")}
                </button>
              )}
              {detailLoading ? (
                <p role="status">{t("Загрузка…", "Loading…")}</p>
              ) : selected && (thread || order) ? (
                <>
                  <header className="interaction-conversation-header">
                    {thread ? (
                      <Link
                        href={`/${locale}/profile?author=${encodeURIComponent(thread.peer.username ?? "")}`}
                      >
                        {thread.peer.avatarUrl && (
                          <img src={thread.peer.avatarUrl} alt="" />
                        )}
                        <strong>{thread.peer.displayName}</strong>
                      </Link>
                    ) : (
                      <strong>{order!.title}</strong>
                    )}
                    <span>{status((thread ?? order)!.status)}</span>
                  </header>
                  {order && <p>{order.message}</p>}
                  <div className="interaction-status-actions">
                    {thread?.incoming &&
                      thread.topic !== "MESSAGE" &&
                      thread.status === "OPEN" && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => action("accept")}
                          >
                            <Check size={16} />
                            {t("Принять", "Accept")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => action("decline")}
                          >
                            <X size={16} />
                            {t("Отклонить", "Decline")}
                          </button>
                        </>
                      )}
                    {thread && !terminal && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => action("close")}
                      >
                        <X size={16} />
                        {t("Закрыть", "Close")}
                      </button>
                    )}
                    {order &&
                      (
                        [
                          ["accept", "PENDING", false, "Принять", "Accept"],
                          ["decline", "PENDING", false, "Отклонить", "Decline"],
                          ["start", "ACCEPTED", false, "Начать", "Start"],
                          [
                            "submit",
                            "IN_PROGRESS",
                            false,
                            "Сдать работу",
                            "Submit work",
                          ],
                          [
                            "complete",
                            "SUBMITTED",
                            true,
                            "Подтвердить и оплатить",
                            "Approve and pay",
                          ],
                          ["cancel", "PENDING", true, "Отменить", "Cancel"],
                        ] as [string, string, boolean, string, string][]
                      )
                        .filter(
                          ([, s, customer]) =>
                            s === order.status &&
                            customer === (order.customerId === userId),
                        )
                        .map(([key, , , r, e]) => (
                          <button
                            type="button"
                            disabled={busy}
                            key={key}
                            onClick={() => action(key)}
                          >
                            {t(r, e)}
                          </button>
                        ))}
                  </div>
                  <div className="interaction-message-history">
                    {messages.map((message) => (
                      <article
                        key={message.id}
                        className={message.authorId === userId ? "is-mine" : ""}
                      >
                        <small>
                          {message.authorId === userId
                            ? t("Вы", "You")
                            : (thread?.peer.displayName ??
                              t("Участник заказа", "Order participant"))}{" "}
                          · {date(message.createdAt)}
                        </small>
                        <p>{message.body}</p>
                      </article>
                    ))}
                  </div>
                  {messageTotal > 50 && (
                    <div className="interaction-pagination">
                      <button
                        type="button"
                        disabled={messagePage <= 1}
                        onClick={() => setMessagePage((p) => p - 1)}
                      >
                        {t("Новее", "Newer")}
                      </button>
                      <span>
                        {messagePage} / {Math.ceil(messageTotal / 50)}
                      </span>
                      <button
                        type="button"
                        disabled={messagePage * 50 >= messageTotal}
                        onClick={() => setMessagePage((p) => p + 1)}
                      >
                        {t("Ранее", "Older")}
                      </button>
                    </div>
                  )}
                  {!terminal && (
                    <form
                      className="interaction-reply"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (busy || !body.trim()) return;
                        setBusy(true);
                        setDetailError("");
                        try {
                          await request(
                            (order
                              ? "/platform/service-requests/"
                              : "/interactions/") +
                              selected +
                              "/messages",
                            {
                              method: "POST",
                              body: JSON.stringify(
                                order ? { message: body } : { body },
                              ),
                            },
                          );
                          setBody("");
                          setMessagePage(1);
                          setVersion((v) => v + 1);
                        } catch {
                          setDetailError(failed);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <textarea
                        aria-label={t("Сообщение", "Message")}
                        required
                        rows={2}
                        maxLength={5000}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="primary-action"
                        disabled={busy || !body.trim()}
                      >
                        <Send size={18} />
                        {t("Отправить", "Send")}
                      </button>
                    </form>
                  )}
                </>
              ) : (
                !selected && (
                  <p>
                    {t(
                      "Выберите диалог или запрос",
                      "Select a conversation or request",
                    )}
                  </p>
                )
              )}
              {detailError && <p role="alert">{detailError}</p>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
