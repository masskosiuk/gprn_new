import { createHash } from "node:crypto";
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";

const languages = new Set([
  "en",
  "uk",
  "ru",
  "pl",
  "de",
  "fr",
  "it",
  "es",
  "pt",
  "nl",
  "tr",
  "ja",
  "zh",
  "ko",
]);
type Translation = { text: string; sourceLanguage?: string };

export function translationLanguage(value: unknown): string {
  if (typeof value !== "string" || !languages.has(value))
    throw new BadRequestException({ code: "TRANSLATION_LANGUAGE_INVALID" });
  return value;
}

export class CommentTranslator {
  private readonly cache = new Map<
    string,
    { result: Translation; expires: number }
  >();
  private readonly pending = new Map<string, Promise<Translation>>();
  private minute = 0;
  private requests = 0;
  private day = 0;
  private characters = 0;

  constructor(
    private readonly config: { apiKey?: string; dailyCharacterLimit: number },
    private readonly request: typeof fetch = fetch,
  ) {}

  async translate(text: string, target: string): Promise<Translation> {
    translationLanguage(target);
    if (!this.config.apiKey)
      throw new ServiceUnavailableException({
        code: "TRANSLATION_NOT_CONFIGURED",
      });
    const key = createHash("sha256")
      .update(target + ":" + text)
      .digest("hex");
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expires > now) return cached.result;
    if (this.pending.has(key)) return this.pending.get(key)!;
    const minute = Math.floor(now / 60000);
    const day = Math.floor(now / 86400000);
    if (minute !== this.minute) {
      this.minute = minute;
      this.requests = 0;
    }
    if (day !== this.day) {
      this.day = day;
      this.characters = 0;
    }
    if (
      this.requests >= 30 ||
      this.characters + text.length > this.config.dailyCharacterLimit
    )
      throw new HttpException({ code: "RATE_LIMITED" }, 429);
    this.requests++;
    this.characters += text.length;
    const operation = this.fetchTranslation(text, target)
      .then((result) => {
        if (this.cache.size >= 500)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { result, expires: now + 7 * 86400000 });
        return result;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, operation);
    return operation;
  }

  private async fetchTranslation(
    text: string,
    target: string,
  ): Promise<Translation> {
    try {
      const response = await this.request(
        "https://translation.googleapis.com/language/translate/v2",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.config.apiKey!,
          },
          body: JSON.stringify({ q: text, target, format: "text" }),
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        },
      );
      if (!response.ok) throw new Error("provider unavailable");
      const body = (await response.json()) as {
        data?: {
          translations?: {
            translatedText?: unknown;
            detectedSourceLanguage?: unknown;
          }[];
        };
      };
      const item = body.data?.translations?.[0];
      if (
        typeof item?.translatedText !== "string" ||
        item.translatedText.length > 16000
      )
        throw new Error("invalid provider response");
      return {
        text: item.translatedText,
        ...(typeof item.detectedSourceLanguage === "string"
          ? { sourceLanguage: item.detectedSourceLanguage }
          : {}),
      };
    } catch {
      // Do not expose provider errors or API credentials to the client or logs.
      throw new ServiceUnavailableException({
        code: "TRANSLATION_UNAVAILABLE",
      });
    }
  }
}
