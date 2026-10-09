"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
  type SelectHTMLAttributes,
} from "react";
import {
  Flag,
  MessageCircle,
  MessagesSquare,
  Plus,
  Send,
  Share2,
  Trash2,
  X,
  ChevronDown,
  Mail,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Camera,
  Star,
  GraduationCap,
} from "lucide-react";
import Link from "next/link";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Kind = "EVENT" | "DISCUSSION" | "CASTING";
type Source = {
  type: "PHOTO" | "POST" | "PROFILE" | "PRODUCT";
  id: string;
  title: string;
  image?: string;
  path: string;
};
type Author = {
  id: string;
  username: string;
  displayName: string;
  tier: string;
  avatarUrl?: string | null;
};
type Post = {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  coverUrl: string | null;
  location: string;
  language: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  moderationReason?: string;
  author: Author;
  sourcePath?: string;
  commentCount: number;
  isDemo: boolean;
};
type Inquiry = {
  id: string;
  kind: string;
  body: string;
  reply?: string;
  status: string;
  createdAt: string;
  imageUrl?: string;
  targetPath?: string;
  targetType?: string;
  targetId?: string;
  authorId: string;
  author: {
    email: string;
    profile: { displayName: string; username: string } | null;
  };
};
type Context = {
  locale: string;
  userId?: string;
  isAdmin: boolean;
  login(): void;
  request: Request;
  root: string;
};
const CommunityContext = createContext<Context | null>(null);
export function CommunityProvider({
  children,
  request,
  ...value
}: Omit<Context, "request"> & { request: Request; children: ReactNode }) {
  return (
    <CommunityContext.Provider
      value={{
        ...value,
        request: <T,>(path: string, init: RequestInit = {}) =>
          request<T>(path, {
            ...init,
            signal: init.signal ?? AbortSignal.timeout(15000),
          }),
      }}
    >
      {children}
    </CommunityContext.Provider>
  );
}
export function useCommunity() {
  const value = useContext(CommunityContext);
  if (!value) throw new Error("CommunityProvider missing");
  return value;
}
function useWords() {
  const { locale } = useCommunity();
  return (ru: string, en: string) =>
    locale === "ru" || locale === "uk" ? ru : en;
}
const paths: Record<Kind, string> = {
  EVENT: "events",
  DISCUSSION: "discussions",
  CASTING: "search",
};
function useTitle(kind: Kind) {
  const t = useWords();
  return kind === "EVENT"
    ? t("Мероприятия", "Events")
    : kind === "DISCUSSION"
      ? t("Дискуссии", "Discussions")
      : t("Поиск", "Casting & Jobs");
}
function errorText(error: unknown, t: ReturnType<typeof useWords>) {
  const code = (error as { code?: string })?.code;
  if (code === "PRO_REQUIRED")
    return t(
      "Публикация мероприятий доступна по подписке Pro.",
      "An active Pro subscription is required to publish events.",
    );
  if (code === "COMMUNITY_COOLDOWN")
    return t(
      "Можно публиковать раз в трое суток. С Pro ограничений по дням нет.",
      "You can publish once every 72 hours, or without this limit with Pro.",
    );
  if (code === "RATE_LIMITED")
    return t(
      "Слишком много запросов. Попробуйте позже.",
      "Too many requests. Please try again later.",
    );
  return t(
    "Не удалось выполнить запрос. Проверьте соединение и повторите.",
    "The request failed. Check your connection and try again.",
  );
}
async function imageData(file?: File) {
  if (!file) return undefined;
  if (
    !/^image\/(jpeg|png|webp|avif)$/.test(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("image");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function Dialog({
  title,
  close,
  children,
  className = "",
}: {
  title: string;
  close(): void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  function dismiss() {
    ref.current?.close();
    close();
  }
  return (
    <dialog
      className={`community-dialog ${className}`}
      aria-label={title}
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target !== ref.current) return;
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
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={dismiss}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Feedback({ children }: { children: string }) {
  return children ? (
    <p className="community-feedback" role="status">
      {children}
    </p>
  ) : null;
}
function AuthorLink({ author }: { author: Author }) {
  const { locale } = useCommunity();
  return (
    <Link
      href={
        "/" + locale + "/profile?author=" + encodeURIComponent(author.username)
      }
    >
      {author.displayName}
    </Link>
  );
}

export function ReportButton({
  type,
  id,
  path,
}: {
  type: string;
  id: string;
  path?: string;
}) {
  const { userId, login } = useCommunity();
  const t = useWords();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="community-report icon-button"
        type="button"
        title={t("Пожаловаться", "Report")}
        aria-label={t("Пожаловаться", "Report")}
        onClick={() => (userId ? setOpen(true) : login())}
      >
        <Flag size={15} />
      </button>
      {open ? (
        <Dialog
          title={t("Пожаловаться", "Report")}
          close={() => setOpen(false)}
        >
          <InquiryForm
            kind="REPORT"
            target={{ targetType: type, targetId: id, targetPath: path }}
            done={() => setOpen(false)}
          />
        </Dialog>
      ) : null}
    </>
  );
}
function InquiryForm({
  kind,
  target,
  done,
}: {
  kind: "SUGGESTION" | "REPORT";
  target?: object;
  done?(): void;
}) {
  const { userId, login, request } = useCommunity();
  const t = useWords();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) {
      login();
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setFeedback("");
    try {
      await request("/community/inquiries", {
        method: "POST",
        body: JSON.stringify({
          kind,
          ...target,
          body: data.get("body"),
          imageDataUrl: await imageData(
            (data.get("image") as File)?.size
              ? (data.get("image") as File)
              : undefined,
          ),
        }),
      });
      form.reset();
      setFeedback(
        t(
          "Отправлено администрации. Ответ появится здесь и в уведомлениях.",
          "Sent to the administrators. Replies appear here and in your notifications.",
        ),
      );
      done?.();
    } catch (error) {
      setFeedback(errorText(error, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="community-form" onSubmit={submit}>
      <label>
        {kind === "REPORT"
          ? t("Причина жалобы", "Reason for reporting")
          : t("Предложение", "Suggestion")}
        <textarea name="body" maxLength={10000} required rows={5} />
      </label>
      <label>
        {t("Изображение (до 5 МБ)", "Image (up to 5 MB)")}
        <input
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
        />
      </label>
      <button className="primary-action" disabled={busy} type="submit">
        <Send size={17} />
        {t("Отправить", "Send")}
      </button>
      <Feedback>{feedback}</Feedback>
    </form>
  );
}
export function SuggestionsPage() {
  const { userId, request } = useCommunity();
  const t = useWords();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    request<{ inquiries: Inquiry[] }>("/community/inquiries", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then((result) => setItems(result.inquiries))
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e, t));
      });
    return () => controller.abort();
  }, [userId, version]);
  return (
    <section className="community-suggestions">
      <InquiryForm kind="SUGGESTION" done={() => setVersion((v) => v + 1)} />
      <Feedback>{error}</Feedback>
      {items.length ? <h2>{t("Ваши обращения", "Your submissions")}</h2> : null}
      {items.map((item) => (
        <article className="community-inquiry" key={item.id}>
          <small>
            {item.kind === "REPORT"
              ? t("Жалоба", "Report")
              : t("Предложение", "Suggestion")}{" "}
            · {new Date(item.createdAt).toLocaleDateString()}
          </small>
          <p>{item.body}</p>
          {item.reply ? (
            <blockquote>{item.reply}</blockquote>
          ) : (
            <span>{t("Ожидает ответа", "Awaiting reply")}</span>
          )}
        </article>
      ))}
    </section>
  );
}

function PostComposer({
  kind,
  source,
  close,
  saved,
}: {
  kind: Kind;
  source?: Source;
  close(): void;
  saved?(): void;
}) {
  const { request, locale } = useCommunity();
  const title = useTitle(kind);
  const t = useWords();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await request("/community/posts", {
        method: "POST",
        body: JSON.stringify({
          kind,
          locale,
          title: form.get("title"),
          body: form.get("body"),
          location: form.get("location"),
          language: form.get("language"),
          startsAt: new Date(String(form.get("startsAt"))).toISOString(),
          endsAt: form.get("endsAt")
            ? new Date(String(form.get("endsAt"))).toISOString()
            : undefined,
          coverDataUrl: source
            ? undefined
            : await imageData(
                (form.get("cover") as File)?.size
                  ? (form.get("cover") as File)
                  : undefined,
              ),
          sourceType: source?.type,
          sourceId: source?.id,
        }),
      });
      setSent(true);
      setFeedback(
        t(
          "Отправлено на модерацию. Публикация станет видна после одобрения.",
          "Submitted for moderation. Your post becomes public after approval.",
        ),
      );
      saved?.();
    } catch (error) {
      setFeedback(errorText(error, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={title} close={close}>
      <form className="community-form" onSubmit={submit}>
        {source ? (
          <div className="community-source">
            {source.image ? (
              <img src={source.image} alt={source.title} />
            ) : null}
            <a href={source.path} target="_blank" rel="noopener noreferrer">
              {source.title}
              <ExternalLink size={14} />
            </a>
          </div>
        ) : null}
        <label>
          {t("Название", "Title")}
          <input
            name="title"
            required
            maxLength={180}
            defaultValue={source?.title ?? ""}
          />
        </label>
        <label>
          {source
            ? t("Ваш вопрос или претензия", "Your question or concern")
            : t("Описание", "Description")}
          <textarea name="body" rows={5} maxLength={10000} required />
        </label>
        {!source ? (
          <label>
            {t("Обложка (до 5 МБ)", "Cover (up to 5 MB)")}
            <input
              name="cover"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              required
            />
          </label>
        ) : null}
        <div className="community-fields">
          <label>
            {t("Локация", "Location")}
            <input name="location" maxLength={180} required />
          </label>
          <label>
            {t("Язык", "Language")}
            <LanguageSelect name="language" defaultValue={locale} />
          </label>
          <label>
            {t("Дата", "Date")}
            <input
              name="startsAt"
              type="datetime-local"
              defaultValue={new Date(
                Date.now() - new Date().getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16)}
              required
            />
          </label>
          {kind === "EVENT" ? (
            <label>
              {t("Окончание", "End date")}
              <input name="endsAt" type="datetime-local" />
            </label>
          ) : null}
        </div>
        <button
          type="submit"
          className="primary-action"
          disabled={busy || sent}
        >
          <Send size={17} />
          {t("На модерацию", "Submit for review")}
        </button>
        <Feedback>{feedback}</Feedback>
      </form>
    </Dialog>
  );
}
function LanguageSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props}>
      <option value="en">English</option>
      <option value="uk">Українська</option>
      <option value="ru">Русский</option>
      <option value="fr">Français</option>
      <option value="de">Deutsch</option>
      <option value="es">Español</option>
      <option value="it">Italiano</option>
      <option value="pl">Polski</option>
      <option value="pt">Português</option>
      <option value="ja">日本語</option>
      <option value="zh">中文</option>
      <option value="ko">한국어</option>
      <option value="tr">Türkçe</option>
      <option value="nl">Nederlands</option>
    </select>
  );
}
export function DiscussionButton({
  source,
  compact = false,
}: {
  source: Source;
  compact?: boolean;
}) {
  const { userId, login } = useCommunity();
  const t = useWords();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={
          compact
            ? "community-discuss icon-button"
            : "community-discuss secondary-action"
        }
        type="button"
        title={t("Открыть дискуссию", "Open discussion")}
        aria-label={t("Открыть дискуссию", "Open discussion")}
        onClick={() => (userId ? setOpen(true) : login())}
      >
        {compact ? <MessagesSquare size={16} /> : <MessageCircle size={16} />}
        {compact ? null : t("Открыть дискуссию", "Open discussion")}
      </button>
      {open ? (
        <PostComposer
          kind="DISCUSSION"
          source={source}
          close={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
export function PublicationTools({
  source,
  reportType,
  comments = true,
}: {
  source: Source;
  reportType?: string;
  comments?: boolean;
}) {
  return (
    <div className="community-publication-tools">
      <div className="community-inline">
        <DiscussionButton source={source} compact />
        <ReportButton
          type={reportType ?? source.type}
          id={source.id}
          path={source.path}
        />
      </div>
      {comments && (source.type === "PHOTO" || source.type === "POST") ? (
        <Comments kind={source.type} id={source.id} />
      ) : null}
    </div>
  );
}

type Comment = { id: string; body: string; createdAt: string; author: Author };
function CommentRow({
  comment,
  busy,
  remove,
  translationAvailable,
}: {
  comment: Comment;
  busy: boolean;
  remove(id: string): Promise<void>;
  translationAvailable: boolean;
}) {
  const { request, userId, isAdmin, locale } = useCommunity();
  const t = useWords();
  const [translation, setTranslation] = useState<string>();
  const [translated, setTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [feedback, setFeedback] = useState("");
  const href =
    "/" +
    locale +
    "/profile?author=" +
    encodeURIComponent(comment.author.username);
  async function translate() {
    if (translation) {
      setTranslated((value) => !value);
      return;
    }
    setTranslating(true);
    setFeedback("");
    try {
      const result = await request<{ text: string }>(
        "/community/comments/" + comment.id + "/translation",
        { method: "POST", body: JSON.stringify({ language: locale }) },
      );
      setTranslation(result.text);
      setTranslated(true);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      setFeedback(
        code === "TRANSLATION_NOT_CONFIGURED"
          ? t("Перевод пока недоступен", "Translation is not available yet")
          : errorText(error, t),
      );
    } finally {
      setTranslating(false);
    }
  }
  return (
    <article className="community-comment">
      <Link
        className="community-comment-avatar"
        href={href}
        aria-label={comment.author.displayName}
      >
        {comment.author.avatarUrl ? (
          <img src={comment.author.avatarUrl} alt="" loading="lazy" />
        ) : (
          <span>
            {comment.author.displayName.slice(0, 1).toLocaleUpperCase(locale)}
          </span>
        )}
      </Link>
      <div className="community-comment-copy">
        <p>
          <Link href={href}>{comment.author.displayName}</Link>{" "}
          {translated ? translation : comment.body}
        </p>
        <div className="community-comment-meta">
          <time dateTime={comment.createdAt}>
            {new Date(comment.createdAt).toLocaleDateString(locale)}
          </time>
          {translationAvailable ? (
            <button
              type="button"
              disabled={translating}
              onClick={() => void translate()}
            >
              {translating
                ? t("Перевод…", "Translating…")
                : translated
                  ? t("Показать оригинал", "See original")
                  : t("Показать перевод", "See translation")}
            </button>
          ) : null}
        </div>
        {feedback ? <small role="status">{feedback}</small> : null}
      </div>
      <div className="community-comment-actions">
        {userId === comment.author.id || isAdmin ? (
          <button
            className="icon-button"
            type="button"
            disabled={busy}
            title={t("Удалить", "Delete")}
            aria-label={t("Удалить", "Delete")}
            onClick={() => void remove(comment.id)}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
        <ReportButton type="COMMENT" id={comment.id} />
      </div>
    </article>
  );
}
export function Comments({
  kind,
  id,
  initiallyOpen = false,
}: {
  kind: "PHOTO" | "POST";
  id: string;
  initiallyOpen?: boolean;
}) {
  const { request, userId, login, isAdmin, locale } = useCommunity();
  const t = useWords();
  const [open, setOpen] = useState(initiallyOpen);
  const [items, setItems] = useState<Comment[]>([]);
  const [translationAvailable, setTranslationAvailable] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [version, setVersion] = useState(0);
  const commentsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash === "#comments-" + id) {
      setOpen(true);
      commentsRef.current?.scrollIntoView({ block: "center" });
    }
  }, [id]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBusy(true);
    request<{
      comments: Comment[];
      total: number;
      translationAvailable?: boolean;
    }>("/community/comments/" + kind + "/" + id + "?page=" + page, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then((data) => {
        setItems(data.comments);
        setTranslationAvailable(Boolean(data.translationAvailable));
        setTotal(data.total);
        setFeedback("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setFeedback(errorText(e, t));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [open, kind, id, page, version]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return login();
    const form = event.currentTarget;
    setBusy(true);
    try {
      await request("/community/comments/" + kind + "/" + id, {
        method: "POST",
        body: JSON.stringify({ body: new FormData(form).get("body") }),
      });
      form.reset();
      setPage(1);
      setVersion((v) => v + 1);
    } catch (e) {
      setFeedback(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function remove(commentId: string) {
    setBusy(true);
    try {
      await request("/community/comments/" + commentId, { method: "DELETE" });
      setVersion((v) => v + 1);
    } catch (e) {
      setFeedback(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="community-comments"
      id={"comments-" + id}
      ref={commentsRef}
    >
      <button
        type="button"
        className="community-comments-toggle"
        aria-expanded={open}
        aria-controls={"comment-list-" + id}
        onClick={() => setOpen((value) => !value)}
      >
        <MessageCircle size={20} />
        {t("Комментарии", "Comments")}
        {open ? " (" + total + ")" : ""}
      </button>
      {open ? (
        <div id={"comment-list-" + id} className="community-comments-content">
          {busy ? (
            <small role="status">{t("Загрузка…", "Loading…")}</small>
          ) : null}
          {items.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              busy={busy}
              remove={remove}
              translationAvailable={translationAvailable}
            />
          ))}
          {total > 30 ? (
            <div className="community-inline">
              <button
                disabled={page === 1 || busy}
                onClick={() => setPage((p) => p - 1)}
                type="button"
              >
                ←
              </button>
              <span>{page}</span>
              <button
                disabled={page * 30 >= total || busy}
                onClick={() => setPage((p) => p + 1)}
                type="button"
              >
                →
              </button>
            </div>
          ) : null}
          {userId ? (
            <form className="community-comment-form" onSubmit={submit}>
              <textarea
                aria-label={t("Комментарий", "Comment")}
                name="body"
                rows={1}
                placeholder={t("Добавить комментарий…", "Add a comment…")}
                maxLength={3000}
                required
              />
              <button
                className="icon-button"
                type="submit"
                title={t("Отправить", "Send")}
                aria-label={t("Отправить", "Send")}
                disabled={busy}
              >
                <Send size={15} />
              </button>
            </form>
          ) : (
            <button type="button" className="secondary-action" onClick={login}>
              {t("Войти, чтобы комментировать", "Sign in to comment")}
            </button>
          )}
          <Feedback>{feedback}</Feedback>
        </div>
      ) : null}
    </section>
  );
}

export function CommunityBoard({
  kind,
  initialPostId,
}: {
  kind: Kind;
  initialPostId?: string;
}) {
  const { request, userId, login, locale } = useCommunity();
  const t = useWords();
  const [posts, setPosts] = useState<Post[]>([]);
  const [mine, setMine] = useState<Post[]>([]);
  const [isPro, setPro] = useState(false);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [version, setVersion] = useState(0);
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    location: "",
    language: "",
    search: "",
  });
  const [facets, setFacets] = useState({
    locations: [] as string[],
    languages: [] as string[],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const isCompactList = !selected;
  useEffect(() => {
    setSelected(initialPostId ?? null);
  }, [kind, initialPostId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFeedback("");
    const query = new URLSearchParams({ kind, page: String(page), ...filters });
    if (filters.to) query.set("to", filters.to + "T23:59:59.999Z");
    const path = selected
      ? "/community/posts/" + encodeURIComponent(selected)
      : "/community/posts?" + query;
    request<{
      post?: Post;
      posts?: Post[];
      total?: number;
      locations?: string[];
      languages?: string[];
    }>(path, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then((data) => {
        setPosts(data.post ? [data.post] : (data.posts ?? []));
        setTotal(data.total ?? 1);
        setFacets({
          locations: data.locations ?? [],
          languages: data.languages ?? [],
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setPosts([]);
          setFeedback(errorText(e, t));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, page, filters, version, selected]);
  useEffect(() => {
    if (!userId) {
      setMine([]);
      setPro(false);
      return;
    }
    const controller = new AbortController();
    request<{ posts: Post[]; isPro: boolean }>("/community/mine", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then((data) => {
        setMine(data.posts.filter((p) => p.kind === kind));
        setPro(data.isPro);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setFeedback(errorText(e, t));
      });
    return () => controller.abort();
  }, [userId, kind, version]);
  function change(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }
  async function remove(id: string) {
    try {
      await request("/community/posts/" + id, { method: "DELETE" });
      setVersion((v) => v + 1);
    } catch (e) {
      setFeedback(errorText(e, t));
    }
  }
  async function share(post: Post) {
    try {
      const url =
        window.location.origin +
        "/" +
        locale +
        "/" +
        paths[post.kind] +
        "?post=" +
        post.id;
      await navigator.clipboard.writeText(url);
      setFeedback(t("Ссылка скопирована", "Link copied"));
    } catch {
      setFeedback(
        t("Не удалось скопировать ссылку", "Could not copy the link"),
      );
    }
  }
  return (
    <section className="page-section community-board">
      <div className="community-board-toolbar">
        <span>
          {kind === "EVENT"
            ? t("Публикации по подписке Pro", "Publishing with Pro")
            : isPro
              ? "Pro"
              : t(
                  "Одна публикация раз в трое суток",
                  "One post every 72 hours",
                )}
        </span>
        <button
          className="primary-action compact"
          type="button"
          onClick={() => {
            if (!userId) login();
            else if (kind === "EVENT" && !isPro)
              setFeedback(
                t(
                  "Для публикации нужна действующая подписка Pro.",
                  "An active Pro subscription is required to publish.",
                ),
              );
            else setOpen(true);
          }}
        >
          <Plus size={17} />
          {t("Опубликовать", "Publish")}
        </button>
      </div>
      {selected ? (
        <button
          className="secondary-action"
          type="button"
          onClick={() => {
            setSelected(null);
            window.history.replaceState(
              null,
              "",
              "/" + locale + "/" + paths[kind],
            );
          }}
        >
          {t("Все публикации", "All posts")}
        </button>
      ) : (
        <div className="community-filters">
          <label>
            {t("Поиск", "Search")}
            <input
              type="search"
              value={filters.search}
              onChange={(e) => change("search", e.target.value)}
            />
          </label>
          <label>
            {t("С даты", "From")}
            <input
              type="date"
              value={filters.from}
              onChange={(e) => change("from", e.target.value)}
            />
          </label>
          <label>
            {t("По дату", "To")}
            <input
              type="date"
              value={filters.to}
              onChange={(e) => change("to", e.target.value)}
            />
          </label>
          <label>
            {t("Локация", "Location")}
            <select
              value={filters.location}
              onChange={(e) => change("location", e.target.value)}
            >
              <option value="">{t("Все", "All")}</option>
              {facets.locations.map((location) => (
                <option key={location}>{location}</option>
              ))}
            </select>
          </label>
          <label>
            {t("Язык", "Language")}
            <select
              value={filters.language}
              onChange={(e) => change("language", e.target.value)}
            >
              <option value="">{t("Все", "All")}</option>
              {facets.languages.map((language) => (
                <option key={language}>{language}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            title={t("Сбросить", "Clear")}
            onClick={() => {
              setFilters({
                from: "",
                to: "",
                location: "",
                language: "",
                search: "",
              });
              setPage(1);
            }}
          >
            <X size={17} />
          </button>
        </div>
      )}
      <Feedback>{feedback}</Feedback>
      {feedback ? (
        <button
          type="button"
          className="secondary-action"
          onClick={() => setVersion((v) => v + 1)}
        >
          {t("Повторить", "Retry")}
        </button>
      ) : null}
      {loading ? (
        <p role="status">{t("Загрузка…", "Loading…")}</p>
      ) : !posts.length ? (
        <p>{t("Публикаций пока нет", "No posts yet")}</p>
      ) : null}
      <div
        className={`community-posts community-posts--${kind.toLowerCase()}${kind !== "EVENT" ? " community-posts--list" : ""}${selected ? " community-posts--detail" : ""}`}
      >
        {posts.map((post) => (
          <article
            className={`community-post${selected ? " community-post--detail" : ""}${!post.coverUrl ? " community-post--no-cover" : ""}`}
            key={post.id}
            id={"post-" + post.id}
          >
            {post.coverUrl ? (
              <Link
                href={
                  "/" + locale + "/" + paths[post.kind] + "?post=" + post.id
                }
                className="community-post-cover"
              >
                <img src={post.coverUrl} alt={post.title} loading="lazy" />
              </Link>
            ) : null}
            <div className="community-post-copy">
              <div className="community-post-meta">
                <time dateTime={post.startsAt}>
                  {new Date(post.startsAt).toLocaleDateString(locale)}
                </time>
                <span>{post.location}</span>
                <span>{post.language.toUpperCase()}</span>
                {post.isDemo ? <small>{t("Демо", "Demo")}</small> : null}
              </div>
              <h2>
                <Link
                  href={
                    "/" + locale + "/" + paths[post.kind] + "?post=" + post.id
                  }
                >
                  {post.title}
                </Link>
              </h2>
              <div className="community-post-author">
                <AuthorLink author={post.author} />
              </div>
              <p className="community-post-description">{post.body}</p>
              {post.sourcePath ? (
                <a
                  href={post.sourcePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="community-original"
                >
                  <ExternalLink size={16} />
                  {t("Оригинальная публикация", "Original publication")}
                </a>
              ) : null}
              <div className="community-post-footer">
                {isCompactList ? (
                  <>
                    <Link
                      className="community-comment-link"
                      href={
                        "/" +
                        locale +
                        "/" +
                        paths[post.kind] +
                        "?post=" +
                        post.id +
                        "#comments-" +
                        post.id
                      }
                      title={t("Комментарии", "Comments")}
                      aria-label={
                        t("Комментарии", "Comments") + ": " + post.commentCount
                      }
                    >
                      <MessageCircle size={16} />
                      <span>{post.commentCount}</span>
                    </Link>
                    <DiscussionButton
                      compact
                      source={{
                        type: "POST",
                        id: post.id,
                        title: post.title,
                        image: post.coverUrl ?? undefined,
                        path:
                          "/" +
                          locale +
                          "/" +
                          paths[post.kind] +
                          "?post=" +
                          post.id,
                      }}
                    />
                    <ReportButton
                      type="POST"
                      id={post.id}
                      path={
                        "/" +
                        locale +
                        "/" +
                        paths[post.kind] +
                        "?post=" +
                        post.id
                      }
                    />
                  </>
                ) : null}
                <button
                  className="icon-button"
                  type="button"
                  title={t("Поделиться", "Share")}
                  aria-label={t("Поделиться", "Share")}
                  onClick={() => void share(post)}
                >
                  <Share2 size={17} />
                </button>
                {userId === post.author.id ? (
                  <button
                    type="button"
                    className="icon-button"
                    title={t("Удалить", "Delete")}
                    aria-label={t("Удалить", "Delete")}
                    onClick={() => void remove(post.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                ) : null}
              </div>
              {!isCompactList ? (
                <PublicationTools
                  source={{
                    type: "POST",
                    id: post.id,
                    title: post.title,
                    image: post.coverUrl ?? undefined,
                    path:
                      "/" +
                      locale +
                      "/" +
                      paths[post.kind] +
                      "?post=" +
                      post.id,
                  }}
                />
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {total > 24 && !selected ? (
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
      {mine.some((post) => post.status !== "APPROVED") ? (
        <details className="community-own">
          <summary>
            {t("Ваши публикации на модерации", "Your moderation submissions")}
          </summary>
          {mine
            .filter((p) => p.status !== "APPROVED")
            .map((post) => (
              <div key={post.id}>
                <strong>{post.title}</strong>
                <span>
                  {post.status === "REJECTED"
                    ? t("Отклонено", "Rejected")
                    : t("На проверке", "Under review")}
                </span>
                <p>{post.moderationReason}</p>
                <button
                  type="button"
                  className="icon-button"
                  title={t("Удалить", "Delete")}
                  onClick={() => void remove(post.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
        </details>
      ) : null}
      {open ? (
        <PostComposer
          kind={kind}
          close={() => setOpen(false)}
          saved={() => setVersion((v) => v + 1)}
        />
      ) : null}
    </section>
  );
}

export function CommunityHighlights() {
  const { request, locale } = useCommunity();
  const t = useWords();
  const [groups, setGroups] = useState<Record<Kind, Post[]>>({
    EVENT: [],
    DISCUSSION: [],
    CASTING: [],
  });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    request<{ groups: Record<Kind, Post[]> }>("/community/highlights", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then((data) => setGroups(data.groups))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version]);
  return (
    <>
      {(["DISCUSSION", "CASTING", "EVENT"] as const).map((kind) => (
        <section key={kind} className="page-section home-community-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {t("Последние публикации", "Latest posts")}
              </span>
              <h2>
                {kind === "EVENT"
                  ? t("Мероприятия", "Events")
                  : kind === "DISCUSSION"
                    ? t("Дискуссии", "Discussions")
                    : t("Поиск", "Casting & Jobs")}
              </h2>
            </div>
            <Link
              className="secondary-action compact"
              href={"/" + locale + "/" + paths[kind]}
            >
              {t("Смотреть", "View")}
              <ChevronRight size={16} />
            </Link>
          </div>
          {loading ? (
            <p role="status">{t("Загрузка…", "Loading…")}</p>
          ) : failed ? (
            <p role="status">
              {t("Не удалось загрузить публикации.", "Could not load posts.")}{" "}
              <button
                className="community-text-action"
                type="button"
                onClick={() => setVersion((value) => value + 1)}
              >
                {t("Повторить", "Retry")}
              </button>
            </p>
          ) : !groups[kind].length ? (
            <p className="empty-state">
              {t("Публикаций пока нет", "No posts yet")}
            </p>
          ) : null}
          <div
            className={`community-posts community-posts--${kind.toLowerCase()}${kind !== "EVENT" ? " community-posts--list" : ""}`}
          >
            {groups[kind].map((post) => (
              <Link
                key={post.id}
                href={
                  "/" +
                  locale +
                  "/" +
                  paths[kind] +
                  "?post=" +
                  encodeURIComponent(post.id)
                }
                className={`community-post home-community-card${!post.coverUrl ? " community-post--no-cover" : ""}`}
              >
                {post.coverUrl ? (
                  <span className="community-post-cover">
                    <img src={post.coverUrl} alt="" loading="lazy" />
                  </span>
                ) : null}
                <div className="community-post-copy">
                  <div className="community-post-meta">
                    <time dateTime={post.startsAt}>
                      {new Date(post.startsAt).toLocaleDateString(locale)}
                    </time>
                    <span>{post.location}</span>
                  </div>
                  <h3>{post.title}</h3>
                  <span className="community-post-author">
                    {post.author.displayName}
                  </span>
                  <p className="community-post-description">{post.body}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function AdminFold({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="community-admin-fold">
      <summary>
        {title}
        <ChevronDown size={18} />
      </summary>
      <div>{children}</div>
    </details>
  );
}
function AdminPostQueue({ kind }: { kind: Kind }) {
  const { request } = useCommunity();
  const t = useWords();
  const title = useTitle(kind);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Post[]>([]);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    request<{ posts: Post[] }>("/community/moderation", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then((data) => setItems(data.posts.filter((p) => p.kind === kind)))
      .catch((e) => {
        if (!controller.signal.aborted) setFeedback(errorText(e, t));
      });
    return () => controller.abort();
  }, [open, kind, version]);
  async function submit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await request("/community/moderation/" + id, {
        method: "PATCH",
        body: JSON.stringify({
          status: data.get("status"),
          reason: data.get("reason"),
        }),
      });
      setVersion((v) => v + 1);
      setFeedback(t("Сохранено", "Saved"));
    } catch (e) {
      setFeedback(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="community-admin-fold"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {title}
        <ChevronDown size={18} />
      </summary>
      {open ? (
        <div>
          <Feedback>{feedback}</Feedback>
          {!items.length ? (
            <p>{t("Очередь пуста", "The queue is empty")}</p>
          ) : null}
          {items.map((post) => (
            <article className="community-moderation-item" key={post.id}>
              {post.coverUrl ? (
                <img src={post.coverUrl} alt={post.title} />
              ) : null}
              <div>
                <h3>{post.title}</h3>
                <AuthorLink author={post.author} />
                <p>{post.body}</p>
                <small>
                  {post.location} · {post.language} ·{" "}
                  {new Date(post.startsAt).toLocaleString()}
                </small>
                {post.sourcePath ? (
                  <a
                    href={post.sourcePath}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("Оригинал", "Original")}
                  </a>
                ) : null}
                <form
                  className="community-form"
                  onSubmit={(e) => void submit(e, post.id)}
                >
                  <label>
                    {t("Решение", "Decision")}
                    <select name="status">
                      <option value="APPROVED">
                        {t("Одобрить", "Approve")}
                      </option>
                      <option value="UNDER_REVIEW">
                        {t("На проверке", "Under review")}
                      </option>
                      <option value="REJECTED">
                        {t("Отклонить", "Reject")}
                      </option>
                    </select>
                  </label>
                  <label>
                    {t(
                      "Причина (обязательна при отклонении)",
                      "Reason (required for rejection)",
                    )}
                    <textarea name="reason" maxLength={2000} rows={2} />
                  </label>
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={busy}
                  >
                    {t("Сохранить", "Save")}
                  </button>
                </form>
              </div>
            </article>
          ))}
          <button
            type="button"
            className="secondary-action"
            onClick={() => setVersion((v) => v + 1)}
          >
            {t("Обновить", "Refresh")}
          </button>
        </div>
      ) : null}
    </details>
  );
}
function AdminInquiryQueue({ kind }: { kind: "REPORT" | "SUGGESTION" }) {
  const { request, locale, root } = useCommunity();
  const t = useWords();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Inquiry[]>([]);
  const [feedback, setFeedback] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    request<{ inquiries: Inquiry[] }>(
      "/community/admin/inquiries?kind=" + kind,
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      },
    )
      .then((data) => setItems(data.inquiries))
      .catch((e) => {
        if (!controller.signal.aborted) setFeedback(errorText(e, t));
      });
    return () => controller.abort();
  }, [open, kind, version]);
  async function submit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await request("/community/admin/inquiries/" + id, {
        method: "PATCH",
        body: JSON.stringify({
          reply: form.get("reply"),
          status: form.get("status"),
        }),
      });
      setVersion((v) => v + 1);
      setFeedback(
        t(
          "Ответ сохранён и отправлен в аккаунт автора",
          "Reply saved and delivered to the author's account",
        ),
      );
    } catch (e) {
      setFeedback(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="community-admin-fold"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {kind === "REPORT"
          ? t("Жалобы", "Reports")
          : t("Предложения", "Suggestions")}
        <ChevronDown size={18} />
      </summary>
      {open ? (
        <div>
          <Feedback>{feedback}</Feedback>
          {items.map((item) => (
            <article className="community-inquiry" key={item.id}>
              <div className="community-inline">
                <Link
                  href={
                    "/" +
                    locale +
                    "/profile?author=" +
                    encodeURIComponent(item.author.profile?.username ?? "")
                  }
                >
                  {item.author.profile?.displayName ?? item.authorId}
                </Link>
                <a
                  href={
                    "mailto:" +
                    encodeURIComponent(item.author.email) +
                    "?subject=" +
                    encodeURIComponent(
                      t("Ответ на обращение GPRN", "GPRN submission reply"),
                    )
                  }
                >
                  <Mail size={15} />
                  {item.author.email}
                </a>
                <small>{new Date(item.createdAt).toLocaleDateString()}</small>
              </div>
              <p>{item.body}</p>
              {item.targetPath ? (
                <a
                  href={item.targetPath}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("Объект жалобы", "Reported content")}
                </a>
              ) : item.targetId ? (
                <small>
                  {item.targetType}: {item.targetId}
                </small>
              ) : null}
              {item.imageUrl ? (
                <img
                  className="community-inquiry-image"
                  src={root + "/community/inquiries/" + item.id + "/image"}
                  alt={t("Вложение", "Attachment")}
                />
              ) : null}
              <form
                className="community-form"
                onSubmit={(e) => void submit(e, item.id)}
              >
                <textarea
                  aria-label={t("Ответ автору", "Reply to author")}
                  name="reply"
                  defaultValue={item.reply ?? ""}
                  maxLength={10000}
                  rows={3}
                />
                <select name="status" defaultValue={item.status}>
                  <option value="OPEN">{t("Открыто", "Open")}</option>
                  <option value="UNDER_REVIEW">
                    {t("На проверке", "Under review")}
                  </option>
                  <option value="RESOLVED">{t("Решено", "Resolved")}</option>
                  <option value="DISMISSED">
                    {t("Отклонено", "Dismissed")}
                  </option>
                </select>
                <button
                  className="secondary-action"
                  type="submit"
                  disabled={busy}
                >
                  <Send size={16} />
                  {t("Ответить в аккаунт", "Reply in account")}
                </button>
              </form>
            </article>
          ))}
          <button
            type="button"
            className="secondary-action"
            onClick={() => setVersion((v) => v + 1)}
          >
            {t("Обновить", "Refresh")}
          </button>
        </div>
      ) : null}
    </details>
  );
}
export function AdminCommunitySections() {
  return (
    <>
      <AdminPostQueue kind="EVENT" />
      <AdminPostQueue kind="DISCUSSION" />
      <AdminPostQueue kind="CASTING" />
      <AdminInquiryQueue kind="REPORT" />
      <AdminInquiryQueue kind="SUGGESTION" />
    </>
  );
}
export function ProControl({
  userId,
  initialProUntil,
}: {
  userId: string;
  initialProUntil: string | null;
}) {
  const { request } = useCommunity();
  const t = useWords();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(initialProUntil?.slice(0, 10) ?? "");
  useEffect(() => {
    setDate(initialProUntil?.slice(0, 10) ?? "");
  }, [userId, initialProUntil]);
  return (
    <form
      className="community-pro-control"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await request("/community/admin/pro/" + userId, {
            method: "PATCH",
            body: JSON.stringify({
              proUntil: date
                ? new Date(date + "T23:59:59.999Z").toISOString()
                : null,
            }),
          });
          setFeedback(t("Подписка обновлена", "Subscription updated"));
        } catch (error) {
          setFeedback(errorText(error, t));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Pro {t("до", "until")}
        <input
          type="date"
          name="proUntil"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <button type="submit" className="secondary-action" disabled={busy}>
        {t(
          "Назначить Pro / снять, если дата пуста",
          "Set Pro / revoke with an empty date",
        )}
      </button>
      <Feedback>{feedback}</Feedback>
    </form>
  );
}

export function InteractionMenu({
  username,
  name,
  image,
  avatarUrl,
}: {
  username: string;
  name: string;
  image?: string;
  avatarUrl?: string;
}) {
  const { userId, login, request, locale } = useCommunity();
  const t = useWords();
  const [topic, setTopic] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [discussion, setDiscussion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sent, setSent] = useState(false);
  const options: [string, string, typeof MessageCircle][] = [
    ["SHOOT", t("Предложить съёмку", "Propose a shoot"), Camera],
    ["REVIEW", t("Заказать оценку", "Request a review"), Star],
    ["SECURE", t("Защищённая сделка", "Protected deal"), ShieldCheck],
    ["MENTORSHIP", t("Менторство", "Mentorship"), GraduationCap],
    ["DISPUTE", t("Открыть спор", "Open a dispute"), MessagesSquare],
    ["MESSAGE", t("Сообщение", "Message"), Mail],
  ];
  return (
    <>
      <button
        type="button"
        className="primary-action community-interaction-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MessageCircle size={17} />
        {t("Взаимодействовать", "Interact")}
      </button>
      {open ? (
        <Dialog
          title={t("Взаимодействовать", "Interact")}
          className="community-interaction-dialog"
          close={() => setOpen(false)}
        >
          <div className="community-interaction-author">
            <span className="community-interaction-avatar" aria-hidden="true">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" />
              ) : (
                name.slice(0, 1).toLocaleUpperCase(locale)
              )}
            </span>
            <div>
              <strong>{name}</strong>
              <span>@{username}</span>
            </div>
          </div>
          <div className="community-interaction-actions">
            {options.map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setOpen(false);
                  setFeedback("");
                  setSent(false);
                  if (!userId) login();
                  else if (key === "DISPUTE") setDiscussion(true);
                  else setTopic(key);
                }}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </Dialog>
      ) : null}
      {topic ? (
        <Dialog
          title={options.find(([key]) => key === topic)![1]}
          close={() => setTopic(null)}
        >
          {topic === "SECURE" ? (
            <p>
              <ShieldCheck size={18} />
              {t(
                "Защищённые сделки ещё не подключены. Платформа пока не принимает и не удерживает деньги за заказы.",
                "Protected payments are not connected yet. The platform does not currently accept or hold funds for orders.",
              )}
            </p>
          ) : (
            <form
              className="community-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const body = new FormData(e.currentTarget).get("body");
                setBusy(true);
                try {
                  await request(
                    "/community/contact/" + encodeURIComponent(username),
                    { method: "POST", body: JSON.stringify({ topic, body }) },
                  );
                  setSent(true);
                  setFeedback(
                    t(
                      "Сообщение отправлено в аккаунт автора",
                      "Message delivered to the author's account",
                    ),
                  );
                } catch (error) {
                  setFeedback(errorText(error, t));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {t("Сообщение автору", "Message to author")}
                <textarea name="body" required maxLength={5000} rows={5} />
              </label>
              <button
                type="submit"
                className="primary-action"
                disabled={busy || sent}
              >
                <Send size={17} />
                {t("Отправить", "Send")}
              </button>
              <Feedback>{feedback}</Feedback>
            </form>
          )}
        </Dialog>
      ) : null}
      {discussion ? (
        <PostComposer
          kind="DISCUSSION"
          source={{
            type: "PROFILE",
            id: username,
            title: name,
            image,
            path:
              "/" + locale + "/profile?author=" + encodeURIComponent(username),
          }}
          close={() => setDiscussion(false)}
        />
      ) : null}
    </>
  );
}
