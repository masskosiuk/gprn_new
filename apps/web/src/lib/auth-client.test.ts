import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiRequestError,
  authErrorKey,
  googleProviderStatus,
  googleUnavailableKey,
  requestAuthSession,
  requestJson,
} from "./auth-client.ts";

const credentials = {
  email: "test@example.invalid",
  password: "test-password",
};
const user = { id: "existing-admin", roles: ["ADMIN"] };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

test("a gateway error is an API outage, not a missing account or Google configuration", async () => {
  const fetcher: typeof fetch = async () => new Response("", { status: 502 });
  await assert.rejects(
    requestJson("https://example.invalid/providers", {}, fetcher),
    (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.status, 502);
      assert.equal(authErrorKey(error, "login"), "auth.serverUnavailable");
      assert.equal(authErrorKey(error, "register"), "auth.serverUnavailable");
      return true;
    },
  );
});

test("network failures and timeouts report unavailable authentication", async () => {
  for (const failure of [
    new TypeError("fetch failed"),
    new DOMException("Timed out", "TimeoutError"),
  ]) {
    const fetcher: typeof fetch = async () => {
      throw failure;
    };
    await assert.rejects(
      requestJson("https://example.invalid", {}, fetcher),
      (error: unknown) => {
        assert.equal(authErrorKey(error, "login"), "auth.serverUnavailable");
        return true;
      },
    );
  }
});

test("invalid credentials and disabled accounts keep their server error codes", async () => {
  for (const [code, key] of [
    ["AUTH_INVALID_CREDENTIALS", "auth.invalidCredentials"],
    ["AUTH_USER_NOT_ACTIVE", "auth.accountInactive"],
  ]) {
    const fetcher: typeof fetch = async () => json({ code }, 401);
    await assert.rejects(
      requestAuthSession(
        "https://example.invalid",
        "login",
        credentials,
        fetcher,
      ),
      (error: unknown) => {
        assert.equal(authErrorKey(error, "login"), key);
        return true;
      },
    );
  }
});

test("rate limits, validation and unknown errors have separate messages", () => {
  assert.equal(
    authErrorKey(new ApiRequestError(429), "login"),
    "auth.rateLimited",
  );
  assert.equal(
    authErrorKey(new ApiRequestError(400), "register"),
    "auth.validation",
  );
  assert.equal(
    authErrorKey(new ApiRequestError(400), "login"),
    "auth.loginValidation",
  );
  assert.equal(
    authErrorKey(new ApiRequestError(409), "register"),
    "auth.accountExists",
  );
  assert.equal(
    authErrorKey(new Error("unexpected"), "register"),
    "auth.registrationFailed",
  );
});

test("successful login preserves the existing administrator role and session cookies", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://example.invalid/api/v1/auth/login");
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "include");
    assert.deepEqual(JSON.parse(String(init?.body)), credentials);
    assert.equal(
      new Headers(init?.headers).get("content-type"),
      "application/json",
    );
    return json({ user });
  };
  assert.deepEqual(
    await requestAuthSession(
      "https://example.invalid/api/v1",
      "login",
      credentials,
      fetcher,
    ),
    { user },
  );
});

test("registration logs into an existing account only after a conflict", async () => {
  const paths: string[] = [];
  const fetcher: typeof fetch = async (url) => {
    paths.push(String(url));
    return paths.length === 1
      ? json({ code: "AUTH_EMAIL_OR_USERNAME_EXISTS" }, 409)
      : json({ user });
  };
  assert.deepEqual(
    await requestAuthSession(
      "https://example.invalid",
      "register",
      { ...credentials, displayName: "Demo" },
      fetcher,
    ),
    { user },
  );
  assert.deepEqual(paths, [
    "https://example.invalid/auth/register",
    "https://example.invalid/auth/login",
  ]);
});

test("registration never silently attempts login after a gateway error, validation error or rate limit", async () => {
  for (const status of [400, 429, 500, 502, 503]) {
    let attempts = 0;
    const fetcher: typeof fetch = async () => {
      attempts += 1;
      return json({}, status);
    };
    await assert.rejects(
      requestAuthSession(
        "https://example.invalid",
        "register",
        credentials,
        fetcher,
      ),
    );
    assert.equal(attempts, 1);
  }
});

test("successful registration does not fall back to login", async () => {
  let attempts = 0;
  const fetcher: typeof fetch = async () => {
    attempts += 1;
    return json({ user });
  };
  await requestAuthSession(
    "https://example.invalid",
    "register",
    credentials,
    fetcher,
  );
  assert.equal(attempts, 1);
});

test("only an explicit provider status indicates missing Google configuration", () => {
  for (const body of [
    null,
    {},
    { providers: [] },
    { providers: [{ id: "google", status: "UNKNOWN" }] },
  ]) {
    const status = googleProviderStatus(body);
    assert.equal(status, "UNAVAILABLE");
    assert.equal(googleUnavailableKey(status), "auth.serverUnavailable");
  }
  assert.equal(
    googleProviderStatus({
      providers: [{ id: "google", status: "AVAILABLE" }],
    }),
    "AVAILABLE",
  );
  const status = googleProviderStatus({
    providers: [{ id: "google", status: "NEEDS_CONFIGURATION" }],
  });
  assert.equal(googleUnavailableKey(status), "auth.googleNotConfigured");
  assert.equal(googleUnavailableKey("COMING_SOON"), "auth.googleUnavailable");
});

test("an unexpected HTML response cannot be treated as a successful sign-in", async () => {
  const fetcher: typeof fetch = async () =>
    new Response("<html>proxy error</html>");
  await assert.rejects(
    requestJson("https://example.invalid", {}, fetcher),
    (error: unknown) => {
      assert.equal(authErrorKey(error, "login"), "auth.serverUnavailable");
      return true;
    },
  );
});
