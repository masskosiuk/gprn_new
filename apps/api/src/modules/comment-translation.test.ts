import assert from "node:assert/strict";
import test from "node:test";
import {
  CommentTranslator,
  translationLanguage,
} from "./comment-translation.js";

const status = (value: number) => (error: unknown) =>
  (error as { getStatus(): number }).getStatus() === value;

test("comment translation validates every supported viewer language", () => {
  for (const locale of ["ru", "en", "uk", "zh", "ko", "ja", "fr", "es"])
    assert.equal(translationLanguage(locale), locale);
  for (const invalid of [undefined, "auto", "en&key=bad", "", {}])
    assert.throws(() => translationLanguage(invalid), status(400));
});

test("translation auto-detects source, uses a bounded request and keeps the key out of URLs", async () => {
  let calls = 0;
  const request = (async (url, options) => {
    calls++;
    assert.equal(
      url,
      "https://translation.googleapis.com/language/translate/v2",
    );
    assert.equal(options?.method, "POST");
    assert.equal(options?.redirect, "error");
    assert(options?.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(String(options?.body)), {
      q: "Hello",
      target: "ru",
      format: "text",
    });
    assert.equal(
      new Headers(options?.headers).get("x-goog-api-key"),
      "test-key",
    );
    return Response.json({
      data: {
        translations: [
          { translatedText: "Привет", detectedSourceLanguage: "en" },
        ],
      },
    });
  }) as typeof fetch;
  const translator = new CommentTranslator(
    { apiKey: "test-key", dailyCharacterLimit: 5 },
    request,
  );
  const [first, second] = await Promise.all([
    translator.translate("Hello", "ru"),
    translator.translate("Hello", "ru"),
  ]);
  assert.deepEqual(first, { text: "Привет", sourceLanguage: "en" });
  assert.deepEqual(first, second);
  assert.deepEqual(await translator.translate("Hello", "ru"), first);
  assert.equal(calls, 1);
  await assert.rejects(translator.translate("Other", "ru"), status(429));
  assert.equal(calls, 1);
});

test("missing credentials never produce a fake translation or a provider request", async () => {
  let calls = 0;
  const translator = new CommentTranslator(
    { dailyCharacterLimit: 100 },
    (async () => {
      calls++;
      throw Error();
    }) as typeof fetch,
  );
  await assert.rejects(translator.translate("Hello", "ru"), status(503));
  assert.equal(calls, 0);
});

test("upstream failures and malformed replies are sanitized", async () => {
  for (const request of [
    async () => {
      throw Error("credential must never appear");
    },
    async () => new Response("credential must never appear", { status: 401 }),
    async () =>
      Response.json({ data: { translations: [{ translatedText: {} }] } }),
  ]) {
    const translator = new CommentTranslator(
      { apiKey: "test-key", dailyCharacterLimit: 100 },
      request as typeof fetch,
    );
    await assert.rejects(
      translator.translate("Hello", "ru"),
      (error: unknown) => {
        assert.equal((error as { getStatus(): number }).getStatus(), 503);
        assert(!JSON.stringify(error).includes("credential must never appear"));
        return true;
      },
    );
  }
});
