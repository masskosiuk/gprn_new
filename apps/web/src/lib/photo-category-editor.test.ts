import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PHOTOGRAPHY_CATEGORY_SLUGS } from "@gprn/domain";

const source = readFileSync(
  new URL("../app/[locale]/photo-category-editor.tsx", import.meta.url),
  "utf8",
);
const home = readFileSync(
  new URL("../app/[locale]/home-client.tsx", import.meta.url),
  "utf8",
);
function editor(
  onLoad = async () => [{ slug: "documentary" }, { slug: "portrait" }],
  onSave = async (_slug: string) => {},
) {
  const slots: any[] = [];
  let cursor = 0;
  const hook = (initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return index;
  };
  const exports: any = {};
  const jsx = (type: any, props: any) => ({ type, props });
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (name: string) => {
        if (name === "react")
          return {
            useState: (initial: any) => {
              const index = hook(initial);
              return [
                slots[index],
                (value: any) => {
                  slots[index] =
                    typeof value === "function" ? value(slots[index]) : value;
                },
              ];
            },
            useRef: (initial: any) => slots[hook({ current: initial })],
            useEffect: () => {},
          };
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "lucide-react")
          return {
            Pencil: "Pencil",
            Check: "Check",
            X: "X",
            RotateCw: "RotateCw",
          };
        if (name === "@gprn/i18n")
          return { getMessage: (_locale: string, key: string) => key };
        throw new Error(name);
      },
    },
  );
  const props = {
    slug: "documentary",
    locale: "ru",
    editable: true,
    onLoad,
    onSave,
    onBrowse: () => {},
  };
  const render = () => {
    cursor = 0;
    return exports.PhotoCategoryEditor(props);
  };
  function find(node: any, predicate: (node: any) => boolean): any {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const result = find(child, predicate);
      if (result) return result;
    }
    return null;
  }
  const button = (name: string) =>
    find(render(), (n) => n.props?.["aria-label"] === name);
  const submit = () => render().props.onSubmit({ preventDefault() {} });
  const choose = (slug: string) =>
    find(render(), (n) => n.type === "select").props.onChange({
      target: { value: slug },
    });
  return { render, find, button, props, submit, choose };
}

test("only editable works expose the genre pencil, while the existing genre filter stays available", () => {
  const ui = editor();
  assert(ui.button("photo.changeGenre"));
  ui.props.editable = false;
  assert.equal(ui.button("photo.changeGenre"), null);
  assert(ui.find(ui.render(), (n) => n.props?.onClick === ui.props.onBrowse));
});

test("genre choices come from the server, and successful saving closes only the editor", async () => {
  const saved: string[] = [];
  const ui = editor(undefined, async (slug) => {
    saved.push(slug);
  });
  await ui.button("photo.changeGenre").props.onClick();
  const options = ui
    .find(ui.render(), (n) => n.type === "select")
    .props.children.flat()
    .filter(Boolean);
  assert.deepEqual(
    Array.from(options, (o: any) => o.props.value),
    ["documentary", "portrait"],
  );
  ui.choose("portrait");
  await ui.submit();
  assert.deepEqual(saved, ["portrait"]);
  assert(ui.button("photo.changeGenre"));
});

test("all synchronized genres are selectable and an unknown server genre has a readable fallback", async () => {
  const categories = [
    ...PHOTOGRAPHY_CATEGORY_SLUGS.map((slug) => ({ slug })),
    { slug: "future-genre" },
  ];
  const saved: string[] = [];
  const ui = editor(
    async () => categories,
    async (slug) => {
      saved.push(slug);
    },
  );
  await ui.button("photo.changeGenre").props.onClick();
  const options = ui
    .find(ui.render(), (node) => node.type === "select")
    .props.children.flat()
    .filter(Boolean);
  assert.deepEqual(
    Array.from(options, (option: any) => option.props.value),
    categories.map((category) => category.slug),
  );
  assert.equal(options.at(-1).props.children, "future-genre");
  ui.choose("still-life");
  await ui.submit();
  assert.deepEqual(saved, ["still-life"]);
});

test("failed saving keeps the selected genre and allows retry or cancellation", async () => {
  const ui = editor(undefined, async () => {
    throw new Error("Offline");
  });
  await ui.button("photo.changeGenre").props.onClick();
  ui.choose("portrait");
  await ui.submit();
  assert(ui.find(ui.render(), (n) => n.props?.role === "alert"));
  assert.equal(
    ui.find(ui.render(), (n) => n.type === "select").props.value,
    "portrait",
  );
  ui.button("common.cancel").props.onClick();
  assert(ui.button("photo.changeGenre"));
});

test("catalog failure can be retried, and a late result after cancelling cannot reopen the editor", async () => {
  let calls = 0;
  let finish!: (rows: { slug: string }[]) => void;
  const ui = editor(async () => {
    if (++calls === 1) throw new Error("Offline");
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  await ui.button("photo.changeGenre").props.onClick();
  const pending = ui.button("photo.retryGenres").props.onClick();
  ui.button("common.cancel").props.onClick();
  finish([{ slug: "portrait" }]);
  await pending;
  assert(ui.button("photo.changeGenre"));
  assert.equal(
    ui.find(ui.render(), (n) => n.type === "select"),
    null,
  );
});

test("saving an unchanged genre avoids an unnecessary request", async () => {
  let writes = 0;
  const ui = editor(undefined, async () => {
    writes++;
  });
  await ui.button("photo.changeGenre").props.onClick();
  await ui.submit();
  assert.equal(writes, 0);
});

test("the original work is updated in feed, own and public portfolios without replacing engagement or closing the lightbox", () => {
  const start = home.indexOf("async function changeWorkCategory");
  const body = home.slice(
    start,
    home.indexOf("function toggleSavePhoto", start),
  );
  assert(body.includes("/category`"));
  for (const setter of [
    "setServerPhotos",
    "setUploadedPhotos",
    "setServerPublicPhotos",
  ])
    assert(body.includes(setter));
  assert.match(body, /\.\.\.photo,[\s\S]*?categoryId:/);
  assert(!body.includes("setImagePreview"));
  assert(home.includes('"/categories"'));
});

test("saving patches the original photo and merges its genre into every existing gallery without losing counters", async () => {
  const start = home.indexOf("async function changeWorkCategory");
  const method = home.slice(
    start,
    home.indexOf("function toggleSavePhoto", start),
  );
  const state: Record<string, any[]> = Object.fromEntries(
    ["own", "feed", "public"].map((name) => [
      name,
      [
        { id: "work", categoryId: "documentary", votes: 42, commentCount: 7 },
        { id: "other", categoryId: "street", votes: 9 },
      ],
    ]),
  );
  const requests: any[] = [];
  const run = runInNewContext(
    ts.transpileModule(`${method}; changeWorkCategory`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      apiRequest: async (path: string, options: any) => {
        requests.push({ path, ...options });
        return {
          photo: {
            category: { slug: "portrait", nameKey: "category.portrait.name" },
          },
        };
      },
      normalizeServerCategory: (slug: string) => slug,
      setUploadedPhotos: (fn: any) => {
        state.own = fn(state.own);
      },
      setServerPhotos: (fn: any) => {
        state.feed = fn(state.feed);
      },
      setServerPublicPhotos: (fn: any) => {
        state.public = fn(state.public);
      },
      setAdminModerationPhotos: (fn: any) => fn([]),
      setAdminModerationDrafts: (fn: any) => fn({}),
      refreshServerChallenges: async () => {},
      refreshServerBattles: async () => {},
    },
  );
  await run("work", "portrait");
  assert.equal(requests[0].path, "/photos/work/category");
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(JSON.parse(requests[0].body), { categorySlug: "portrait" });
  for (const rows of Object.values(state)) {
    assert.equal(rows[0].categoryId, "portrait");
    assert.equal(rows[0].categorySlug, "portrait");
    assert.equal(rows[0].votes, 42);
    assert.equal(rows[0].commentCount, 7);
    assert.equal(rows[1].categoryId, "street");
  }
});
