import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PHOTOGRAPHY_CATEGORY_SLUGS } from "@gprn/domain";
import {
  defaultPhotoCategories,
  normalizePhotoCategory,
  photoCategoryFilters,
} from "./photo-categories.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const home = read("../app/[locale]/home-client.tsx");
const ast = ts.createSourceFile(
  "home.tsx",
  home,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function declaration(name: string) {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (found) return;
    if (
      ts.isFunctionDeclaration(node)
        ? node.name?.text === name
        : ts.isVariableStatement(node) &&
          node.declarationList.declarations.some(
            (item) => ts.isIdentifier(item.name) && item.name.text === name,
          )
    )
      found = node;
    else ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(found, `Missing ${name}`);
  return found.getText(ast);
}
function evaluate(source: string, context: object = {}) {
  return runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    context,
  );
}

test("photography genres are unique filters and retain their own IDs rather than falling back to documentary", () => {
  const catalog = evaluate(
    `${declaration("categoryFilters")}\n${declaration("normalizeServerCategory")}\n({ filters: categoryFilters, normalize: normalizeServerCategory })`,
    {
      useMemo: (calculate: () => unknown) => calculate(),
      photoCategoryFilters,
      photoCategories: defaultPhotoCategories,
      normalizePhotoCategory,
    },
  );
  for (const slug of PHOTOGRAPHY_CATEGORY_SLUGS) {
    assert.equal(
      catalog.filters.filter((item: any) => item.id === slug).length,
      1,
    );
    assert.equal(catalog.normalize(slug), slug);
    assert.equal(
      catalog.filters.find((item: any) => item.id === slug).key,
      `category.${slug}`,
    );
  }
});

test("existing databases and fresh installations receive the same active genres without overwriting existing categories", () => {
  const seed = read("../../../../packages/db/prisma/seed.ts");
  const migration = read(
    "../../../../packages/db/prisma/migrations/0019_photography_categories/migration.sql",
  );
  assert.match(seed, /const categories = PHOTOGRAPHY_CATEGORY_SLUGS;/);
  for (const [offset, slug] of [
    "fine-art",
    "commercial",
    "product",
  ].entries()) {
    assert.equal(
      PHOTOGRAPHY_CATEGORY_SLUGS.filter((item) => item === slug).length,
      1,
    );
    assert.match(
      migration,
      new RegExp(
        `'${slug}',\\s*'category\\.${slug}\\.name',\\s*true,\\s*${11 + offset},`,
      ),
    );
  }
  assert.match(migration, /ON CONFLICT \("slug"\) DO NOTHING/);
  assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|DROP|TRUNCATE)\b/i);
});

test("Russian, Ukrainian and English use clear distinct photography genre labels", () => {
  const exports: any = {};
  evaluate(read("../../../../packages/i18n/src/messages.ts"), {
    exports,
    require: () => ({
      defaultLocale: "en",
      supportedLocales: ["en", "ru", "uk"],
    }),
  });
  assert.equal(
    exports.getMessage("ru", "category.fine-art"),
    "Художественная съёмка",
  );
  assert.equal(
    exports.getMessage("ru", "category.commercial"),
    "Коммерческая съёмка",
  );
  assert.equal(
    exports.getMessage("ru", "category.product"),
    "Предметная съёмка",
  );
  assert.equal(exports.getMessage("ru", "category.food"), "Фуд-фотография");
  assert.equal(exports.getMessage("ru", "category.aerial"), "Аэросъёмка");
  const requested = {
    macro: "Макросъёмка",
    fashion: "Фэшн и мода",
    sports: "Спортивная",
    astrophotography: "Астрофотография",
    interior: "Интерьерная",
    art: "Арт-фотография",
    "black-and-white": "Чёрно-белая",
    "still-life": "Натюрморт",
  };
  for (const [slug, label] of Object.entries(requested)) {
    assert.equal(exports.getMessage("ru", `category.${slug}`), label);
  }
  for (const locale of ["en", "ru", "uk"]) {
    const labels = PHOTOGRAPHY_CATEGORY_SLUGS.map((slug) =>
      exports.getMessage(locale, `category.${slug}`),
    );
    assert.equal(new Set(labels).size, PHOTOGRAPHY_CATEGORY_SLUGS.length);
    assert(labels.every((label) => label && !label.startsWith("category.")));
  }
});

test("aerial photography is available in seeds, marketplaces and an additive, repeat-safe migration", () => {
  const seed = read("../../../../packages/db/prisma/seed.ts");
  const migration = read(
    "../../../../packages/db/prisma/migrations/0021_aerial_photography_category/migration.sql",
  );
  assert.match(seed, /const categories = PHOTOGRAPHY_CATEGORY_SLUGS;/);
  assert.equal(
    PHOTOGRAPHY_CATEGORY_SLUGS.filter((slug) => slug === "aerial").length,
    1,
  );
  assert.match(
    migration,
    /'aerial',\s*'category\.aerial\.name',\s*true,\s*15,/,
  );
  assert.match(migration, /ON CONFLICT \("slug"\) DO NOTHING/);
  assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|DROP|TRUNCATE)\b/i);
  for (const file of ["server-marketplace.tsx", "digital-products.tsx"]) {
    assert.match(
      read(`../app/[locale]/${file}`),
      /\.\.\.PHOTOGRAPHY_CATEGORY_SLUGS/,
    );
  }
});

test("food photography is active in both fresh seeds and an additive, repeat-safe database migration", () => {
  const seed = read("../../../../packages/db/prisma/seed.ts");
  const migration = read(
    "../../../../packages/db/prisma/migrations/0020_food_photography_category/migration.sql",
  );
  assert.match(seed, /const categories = PHOTOGRAPHY_CATEGORY_SLUGS;/);
  assert.equal(
    PHOTOGRAPHY_CATEGORY_SLUGS.filter((slug) => slug === "food").length,
    1,
  );
  assert.match(migration, /'food',\s*'category\.food\.name',\s*true,\s*14,/);
  assert.match(migration, /ON CONFLICT \("slug"\) DO NOTHING/);
  assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|DROP|TRUNCATE)\b/i);
});

test("the synchronized catalog preserves legacy order and adds each new database genre once without moving existing photos", () => {
  assert.equal(
    new Set(PHOTOGRAPHY_CATEGORY_SLUGS).size,
    PHOTOGRAPHY_CATEGORY_SLUGS.length,
  );
  assert.deepEqual(PHOTOGRAPHY_CATEGORY_SLUGS.slice(0, 16), [
    "portrait",
    "landscape",
    "street",
    "architecture",
    "automotive",
    "fashion",
    "travel",
    "wildlife",
    "documentary",
    "night",
    "boudoir",
    "fine-art",
    "commercial",
    "product",
    "food",
    "aerial",
  ]);
  const migration = read(
    "../../../../packages/db/prisma/migrations/0022_synchronized_photo_categories/migration.sql",
  );
  const rows = [
    ...migration.matchAll(
      /'([^']+)'::uuid, '([^']+)', 'category\.([^']+)\.name', true, (\d+),/g,
    ),
  ];
  assert.deepEqual(
    rows.map((row) => row[2]),
    PHOTOGRAPHY_CATEGORY_SLUGS.slice(16),
  );
  assert.equal(new Set(rows.map((row) => row[1])).size, rows.length);
  for (const row of rows) {
    assert.equal(row[2], row[3]);
    assert.equal(PHOTOGRAPHY_CATEGORY_SLUGS[Number(row[4])], row[2]);
  }
  assert.match(migration, /ON CONFLICT \("slug"\) DO NOTHING/);
  assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(migration, /'fashion'/);
});

test("feed filters use exactly the active server catalog, including future slugs, and never merge distinct genres", () => {
  const active = [
    { slug: "fashion" },
    { slug: "macro" },
    { slug: "future-genre" },
  ];
  assert.deepEqual(
    photoCategoryFilters(active).map((item) => item.id),
    ["all", ...active.map((item) => item.slug)],
  );
  assert.deepEqual(photoCategoryFilters([]), [
    { id: "all", key: "category.all" },
  ]);
  assert.equal(normalizePhotoCategory("future-genre"), "future-genre");
  assert.equal(normalizePhotoCategory(null), "documentary");
  assert.equal(normalizePhotoCategory(""), "documentary");
  assert.match(home, /onLoad=\{loadPhotoCategories\}/);
});

function categoryLoader(
  apiRequest: (...args: any[]) => Promise<unknown>,
  onCategories: (rows: unknown) => void,
) {
  return evaluate(
    `${declaration("loadPhotoCategories")}\nloadPhotoCategories`,
    {
      useCallback: (fn: unknown) => fn,
      photoCategoryRequest: { current: null },
      apiRequest,
      setPhotoCategories: onCategories,
      AbortSignal,
    },
  );
}

test("feed and photo editor share a single catalog request and the same active genre result", async () => {
  let requests = 0;
  let finish!: (result: unknown) => void;
  let filters = photoCategoryFilters(defaultPhotoCategories);
  const load = categoryLoader(
    (url, options) => {
      requests++;
      assert.equal(url, "/categories");
      assert.equal(options.cache, "no-store");
      assert(options.signal instanceof AbortSignal);
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    (rows: any) => {
      filters = photoCategoryFilters(rows);
    },
  );
  const feed = load();
  const editor = load();
  assert.equal(feed, editor);
  const categories = [{ slug: "sports" }, { slug: "macro" }];
  finish({ categories });
  assert.equal(await editor, categories);
  assert.deepEqual(
    filters.map((item) => item.id),
    ["all", "sports", "macro"],
  );
  assert.equal(await load(), categories);
  assert.equal(requests, 1);
});

test("a failed shared catalog request can be retried without replacing filters with an empty catalog", async () => {
  let requests = 0;
  const updates: unknown[] = [];
  const categories = [{ slug: "interior" }];
  const load = categoryLoader(
    async () => {
      if (++requests === 1) throw new Error("Offline");
      return { categories };
    },
    (rows) => {
      updates.push(rows);
    },
  );
  await assert.rejects(load(), /Offline/);
  assert.deepEqual(updates, []);
  assert.equal(await load(), categories);
  assert.deepEqual(updates, [categories]);
  assert.equal(requests, 2);
});

for (const hidden of [false, true])
  test(`saving a ${hidden ? "hidden" : "visible"} location updates all galleries without losing engagement or leaving old map coordinates`, async () => {
    const original = {
      id: "work",
      categoryId: "fine-art",
      votes: 27,
      commentCount: 6,
      locationId: "kyiv",
      locationLabel: "Kyiv",
      locationLatitude: 50.45,
      locationLongitude: 30.52,
    };
    const unrelated = { ...original, id: "other" };
    const arrays = Array.from({ length: 3 }, () => [original, unrelated]);
    const mapped = {
      locationId: "paris",
      locationLabel: "Paris, France",
      locationLatitude: hidden ? undefined : 48.85,
      locationLongitude: hidden ? undefined : 2.35,
      locationHidden: hidden,
    };
    let request: any;
    const update = evaluate(
      `${declaration("changeWorkLocation")}\nchangeWorkLocation`,
      {
        serverUser: { id: "author" },
        apiRequest: async (url: string, options: any) => {
          request = { url, ...options };
          return { photo: {} };
        },
        mapServerPhoto: () => mapped,
        setUploadedPhotos: (fn: any) => {
          arrays[0] = fn(arrays[0]);
        },
        setServerPhotos: (fn: any) => {
          arrays[1] = fn(arrays[1]);
        },
        setServerPublicPhotos: (fn: any) => {
          arrays[2] = fn(arrays[2]);
        },
      },
    );
    const location = { name: "Paris" };
    await update("work", location);
    assert.equal(request.url, "/photos/work/location");
    assert.equal(request.method, "PATCH");
    assert.deepEqual(JSON.parse(request.body), { location });
    for (const rows of arrays) {
      assert.equal(rows[0].locationId, "paris");
      assert.equal(rows[0].locationLatitude, mapped.locationLatitude);
      assert.equal(rows[0].locationLongitude, mapped.locationLongitude);
      assert.equal(rows[0].locationHidden, hidden);
      assert.equal(rows[0].votes, 27);
      assert.equal(rows[0].commentCount, 6);
      assert.equal(rows[0].categoryId, "fine-art");
      assert.equal(rows[1], unrelated);
    }
  });
