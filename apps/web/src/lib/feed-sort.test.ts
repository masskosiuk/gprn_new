import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { DEFAULT_FEED_SORT, FEED_SORTS } from "@gprn/domain";
import { getMessage } from "@gprn/i18n";

const home = readFileSync(
  new URL("../app/[locale]/home-client.tsx", import.meta.url),
  "utf8",
);
const control = readFileSync(
  new URL("../app/[locale]/feed-sort-control.tsx", import.meta.url),
  "utf8",
);

test("the accessible feed menu exposes only newest and best and notifies the parent of the selection", () => {
  const exports: any = {};
  const jsx = (type: any, props: any) => ({ type, props });
  runInNewContext(
    ts.transpileModule(control, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      require: (name: string) => {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "@gprn/domain") return { FEED_SORTS };
        if (name === "@gprn/i18n") return { getMessage };
        throw new Error(name);
      },
    },
  );
  let selected = DEFAULT_FEED_SORT;
  const render = () =>
    exports.FeedSortControl({
      locale: "ru",
      value: selected,
      onChange: (sort: typeof selected) => {
        selected = sort;
      },
    });
  const label = render();
  assert.equal(label.type, "label");
  assert.equal(label.props.children[0].props.children, "Сортировка");
  const select = label.props.children[1];
  assert.equal(select.props.value, "newest");
  assert.deepEqual(
    Array.from(select.props.children, (option: any) => [
      option.props.value,
      option.props.children,
    ]),
    [
      ["newest", "Сперва новые"],
      ["best", "Сперва лучшие"],
    ],
  );
  select.props.onChange({ target: { value: "best" } });
  assert.equal(render().props.children[1].props.value, "best");
});

test("feed sorting is initialized from the URL, defaults to newest and resets with filters", () => {
  assert.match(home, /useState<FeedSort>\(DEFAULT_FEED_SORT\)/);
  assert.match(home, /searchParams\.get\("sort"\) === "best"/);
  assert.match(home, /sort: feedSort/);
  assert.match(home, /url\.searchParams\.delete\("sort"\)/);
  const reset = home.slice(
    home.indexOf(
      'setSearchTerm("");',
      home.indexOf("function renderDiscoverPage"),
    ),
    home.indexOf('{t("discover.clearFilters")}'),
  );
  assert.match(reset, /setFeedSort\(DEFAULT_FEED_SORT\)/);
});

test("automatic feed orders never show manual drag controls but own portfolio dragging is preserved", () => {
  const feed = home.slice(
    home.indexOf("function renderDiscoverPage"),
    home.indexOf("function renderVideoPage"),
  );
  assert.match(feed, /renderPhotoMasonry\(visiblePhotos\)/);
  assert.doesNotMatch(feed, /isAdministrator \? "FEED"/);
  assert.match(home, /renderPhotoMasonry\(profilePhotos, "PORTFOLIO"\)/);
});

test("both feed orders have distinct Russian, Ukrainian and English labels", () => {
  for (const locale of ["ru", "uk", "en"] as const) {
    assert.notEqual(
      getMessage(locale, "feed.sort.newest"),
      getMessage(locale, "feed.sort.best"),
    );
    assert(getMessage(locale, "feed.sort"));
  }
});
