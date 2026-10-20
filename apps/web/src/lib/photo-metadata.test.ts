import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

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
  );
  for (const slug of ["fine-art", "commercial", "product", "food", "aerial"]) {
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
  const catalog = ts.createSourceFile(
    "seed.ts",
    seed,
    ts.ScriptTarget.Latest,
    true,
  );
  const categories = catalog.statements
    .filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find(
      (node) => ts.isIdentifier(node.name) && node.name.text === "categories",
    );
  assert(
    categories?.initializer &&
      ts.isArrayLiteralExpression(categories.initializer),
  );
  const slugs = categories.initializer.elements.map((node) =>
    ts.isStringLiteral(node) ? node.text : "",
  );
  for (const [offset, slug] of [
    "fine-art",
    "commercial",
    "product",
  ].entries()) {
    assert.equal(slugs.filter((item) => item === slug).length, 1);
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
  for (const locale of ["en", "ru", "uk"]) {
    const labels = ["fine-art", "commercial", "product", "food", "aerial"].map(
      (slug) => exports.getMessage(locale, `category.${slug}`),
    );
    assert.equal(new Set(labels).size, 5);
    assert(labels.every((label) => label && !label.startsWith("category.")));
  }
});

test("aerial photography is available in seeds, marketplaces and an additive, repeat-safe migration", () => {
  const seed = read("../../../../packages/db/prisma/seed.ts");
  const migration = read(
    "../../../../packages/db/prisma/migrations/0021_aerial_photography_category/migration.sql",
  );
  assert.equal(seed.match(/"aerial"/g)?.length, 1);
  assert.match(
    migration,
    /'aerial',\s*'category\.aerial\.name',\s*true,\s*15,/,
  );
  assert.match(migration, /ON CONFLICT \("slug"\) DO NOTHING/);
  assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|DROP|TRUNCATE)\b/i);
  for (const file of ["server-marketplace.tsx", "digital-products.tsx"]) {
    assert.equal(read(`../app/[locale]/${file}`).match(/"aerial"/g)?.length, 1);
  }
});

test("food photography is active in both fresh seeds and an additive, repeat-safe database migration", () => {
  const seed = read("../../../../packages/db/prisma/seed.ts");
  const migration = read(
    "../../../../packages/db/prisma/migrations/0020_food_photography_category/migration.sql",
  );
  assert.equal(seed.match(/"food"/g)?.length, 1);
  assert.match(migration, /'food',\s*'category\.food\.name',\s*true,\s*14,/);
  assert.match(migration, /ON CONFLICT \("slug"\) DO NOTHING/);
  assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|DROP|TRUNCATE)\b/i);
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
