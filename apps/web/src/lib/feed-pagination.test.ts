import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { mergeFeedPage, feedQueryString } from "./feed-pagination.ts";
import { galleryDropPoint } from "./gallery-drop.ts";
import { groupPhotoMapMarkers } from "./photo-map-groups.ts";
import { requestJson } from "./auth-client.ts";

const source = ts.createSourceFile(
  "home-client.tsx",
  readFileSync(
    new URL("../app/[locale]/home-client.tsx", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function handler(name: string, context: object) {
  let node: ts.FunctionDeclaration | undefined;
  function visit(child: ts.Node) {
    if (ts.isFunctionDeclaration(child) && child.name?.text === name)
      node = child;
    ts.forEachChild(child, visit);
  }
  visit(source);
  assert(node);
  return runInNewContext(
    ts.transpileModule(node.getText(source) + `\n${name}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
}
function fixture(initial: string[], fetcher: (path: string) => Promise<any>) {
  const context: any = {
    AbortController,
    AbortSignal,
    URLSearchParams,
    mergeFeedPage,
    serverPhotos: initial.map((id) => ({ id })),
    serverUser: null,
    feedQuery: "",
    firstFeedRefresh: { current: false },
    feedRequest: { current: { version: 0, busy: false, controller: null } },
    mapServerPhoto: (photo: any) => photo,
    apiRequest: fetcher,
    setHasServerFeed() {},
    setFeedStatus(value: string) {
      context.status = value;
    },
    setFeedLoadingMore(value: boolean) {
      context.loading = value;
    },
    setFeedMoreError(value: boolean) {
      context.error = value;
    },
    setFeedTotal(value: number) {
      context.total = value;
    },
    setFeedNextCursor(value: string | null) {
      context.cursor = value;
    },
    setServerPhotos(updater: (photos: any[]) => any[]) {
      context.serverPhotos = updater(context.serverPhotos);
    },
  };
  return {
    context,
    run: handler("refreshDiscoverPhotos", context) as (
      cursor?: string,
      reset?: boolean,
    ) => Promise<void>,
  };
}
const photoPage = (ids: string[], nextCursor: string | null) => ({
  photos: ids.map((id) => ({ id })),
  nextCursor,
  total: 150,
});
test("next pages append and deduplicate without replacing loaded works", async () => {
  const f = fixture(["a", "b"], async () => photoPage(["b", "demo"], null));
  await f.run("next");
  assert.deepEqual(
    f.context.serverPhotos.map((p: any) => p.id),
    ["a", "b", "demo"],
  );
  assert.equal(f.context.cursor, null);
});
test("refresh after uploads keeps fetching until previously displayed works are retained", async () => {
  const calls: string[] = [];
  const f = fixture(["old", "demo"], async (path) => {
    calls.push(path);
    return path.includes("cursor=")
      ? photoPage(["old", "demo"], "next-old")
      : photoPage(["upload1", "upload2"], "next");
  });
  await f.run();
  assert.equal(calls.length, 2);
  assert.deepEqual(
    f.context.serverPhotos.map((p: any) => p.id),
    ["upload1", "upload2", "old", "demo"],
  );
});
test("a failed page preserves photographs and requires explicit retry", async () => {
  const f = fixture(["a", "demo"], async () => {
    throw new Error("offline");
  });
  f.context.cursor = "next";
  await f.run("next");
  assert.deepEqual(
    f.context.serverPhotos.map((p: any) => p.id),
    ["a", "demo"],
  );
  assert.equal(f.context.cursor, "next");
  assert.equal(f.context.error, true);
  assert.equal(f.context.loading, false);
});
test("a late page from a previous filter cannot overwrite newer search results", async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const f = fixture(["old"], async (path) =>
    path.includes("search=new") ? photoPage(["new"], null) : pending,
  );
  const old = f.run("next");
  f.context.feedQuery = "search=new";
  await f.run(undefined, true);
  resolve(photoPage(["wrong"], null));
  await old;
  assert.deepEqual(
    f.context.serverPhotos.map((p: any) => p.id),
    ["new"],
  );
});
test("repeating a cursor never starts an automatic request loop", async () => {
  const f = fixture(["a"], async () => photoPage(["b"], "same"));
  await f.run("same");
  assert.equal(f.context.error, true);
  assert.equal(f.context.serverPhotos.length, 1);
});
test("filters including sale, dates and localized locations are sent to the full server catalog", () => {
  const query = new URLSearchParams(
    feedQueryString(
      {
        kind: "VIDEO",
        category: "street",
        location: "kyiv",
        from: "2026-10-01",
        to: "2026-10-02",
        search: " Киев ",
      },
      true,
      ["kyiv"],
    ),
  );
  assert.equal(query.get("search"), "Киев");
  assert.equal(query.get("saleOnly"), "true");
  assert.equal(query.get("mediaType"), "VIDEO");
  assert.equal(query.get("searchCities"), "kyiv");
  assert(query.get("from")?.endsWith("Z"));
  assert(query.get("to")?.endsWith("Z"));
});
test("inserting at each edge uses pointer position rather than previous array indices", () => {
  const rect = { left: 10, top: 10, width: 100, height: 200 };
  for (const [point, edge, placement] of [
    [{ x: 8, y: 100 }, "left", "before"],
    [{ x: 112, y: 100 }, "right", "after"],
    [{ x: 50, y: 8 }, "top", "before"],
    [{ x: 50, y: 212 }, "bottom", "after"],
  ] as const) {
    const drop = galleryDropPoint(point, rect);
    assert.equal(drop.edge, edge);
    assert.equal(drop.placement, placement);
  }
});
test("keyboard pickup without movement keeps the photo in place", () => {
  const gallery = ts.createSourceFile(
    "sortable-photo-gallery.tsx",
    readFileSync(
      new URL("../app/[locale]/sortable-photo-gallery.tsx", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let node: ts.VariableDeclaration | undefined;
  function visit(child: ts.Node) {
    if (
      ts.isVariableDeclaration(child) &&
      child.name.getText(gallery) === "detect"
    )
      node = child;
    ts.forEachChild(child, visit);
  }
  visit(gallery);
  assert(node?.initializer);
  const context = {
    items: [{ id: "a" }, { id: "b" }],
    dropRef: { current: null as null | { id: string; placement: string } },
    closestCenter: () => [{ id: "a" }, { id: "b" }],
  };
  const detect = runInNewContext(
    ts.transpileModule(
      `const detect = ${node.initializer.getText(gallery)}; detect`,
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      },
    ).outputText,
    context,
  );
  assert.equal(detect({ active: { id: "a" } })[0].id, "a");
  assert.equal(context.dropRef.current, null);
  context.closestCenter = () => [{ id: "b" }, { id: "a" }];
  detect({ active: { id: "a" } });
  const moved = context.dropRef.current as {
    id: string;
    placement: string;
  } | null;
  assert.equal(moved?.id, "b");
  assert.equal(moved?.placement, "after");
});
test("same-location photos produce one counted map marker without losing any photo", () => {
  const markers = Array.from({ length: 130 }, (_, id) => ({
    id,
    latitude: 50.4501,
    longitude: 30.5234,
  }));
  const grouped = groupPhotoMapMarkers([
    ...markers,
    { id: 999, latitude: 48.85, longitude: 2.35 },
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0]!.length, 130);
  assert.deepEqual(
    grouped.flat().map((p) => p.id),
    [...markers.map((p) => p.id), 999],
  );
});
test("mark all read changes UI only after the server confirms and preserves new arrivals", async () => {
  let confirm!: (value: unknown) => void;
  const response = new Promise((done) => {
    confirm = done;
  });
  const context: any = {
    AbortSignal,
    notificationsBusy: false,
    serverUser: { id: "user" },
    activeServerUserId: { current: "user" },
    notificationsReadThrough: { current: null },
    notifications: [
      {
        id: "old",
        serverBacked: true,
        read: false,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ],
    setNotificationsBusy() {},
    setNotificationsError(value: boolean) {
      context.error = value;
    },
    setNotifications(updater: (items: any[]) => any[]) {
      context.notifications = updater(context.notifications);
    },
    apiRequest: async (path: string, init: RequestInit) => {
      assert.equal(path, "/notifications/read-all");
      assert.equal(init.method, "PATCH");
      return requestJson(path, init, async (_url, request) => {
        assert.equal(
          new Headers(request?.headers).get("content-type"),
          "application/json",
        );
        assert.deepEqual(JSON.parse(String(request?.body)), {});
        return Response.json(await response);
      });
    },
  };
  const run = handler("markAllNotificationsRead", context);
  const result = run();
  assert.equal(context.notifications[0].read, false);
  context.notifications.push({
    id: "new",
    serverBacked: true,
    read: false,
    createdAt: "2026-10-03T00:00:00.000Z",
  });
  confirm({ readAt: "2026-10-02T00:00:00.000Z" });
  await result;
  assert.equal(context.notifications[0].read, true);
  assert.equal(context.notifications[1].read, false);
});
