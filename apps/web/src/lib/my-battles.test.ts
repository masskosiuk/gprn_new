import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const text = readFileSync(
  new URL("../app/[locale]/my-battles.tsx", import.meta.url),
  "utf8",
);
const source = ts.createSourceFile(
  "my-battles.tsx",
  text,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let load: ts.FunctionDeclaration | undefined;
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "loadMore")
    load = node;
  ts.forEachChild(node, visit);
}
visit(source);
assert(load);

function pageLoader(request: (path: string) => unknown) {
  const state = {
    works: [{ id: "first" }],
    cursor: "next" as string | null,
    error: false,
    busy: false,
  };
  const generation = { current: 1 };
  const context = {
    cursor: "next",
    loadingMore: false,
    generation,
    api: { current: request },
    setWorks: (update: (old: any[]) => any[]) => {
      state.works = update(state.works);
    },
    setCursor: (cursor: string | null) => {
      state.cursor = cursor;
    },
    setLoadingMore: (busy: boolean) => {
      state.busy = busy;
    },
    setError: (error: boolean) => {
      state.error = error;
    },
  };
  const run = runInNewContext(
    ts.transpileModule(`${load!.getText(source)}; loadMore`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return { state, generation, run };
}

test("my battles append and deduplicate private pages without relying on the public voting deck", async () => {
  const loader = pageLoader(async (path) => {
    assert.equal(path, "/battles/mine?cursor=next");
    return { works: [{ id: "first" }, { id: "second" }], nextCursor: "next" };
  });
  await loader.run();
  assert.deepEqual(
    Array.from(loader.state.works, (work) => work.id),
    ["first", "second"],
  );
  assert.equal(loader.state.cursor, null);
  assert.equal(loader.state.busy, false);
});

test("a failed page preserves existing photographs and offers an explicit retry", async () => {
  const loader = pageLoader(async () => {
    throw new Error("Offline");
  });
  await loader.run();
  assert.equal(loader.state.error, true);
  assert.equal(loader.state.works[0]!.id, "first");
  assert.equal(loader.state.cursor, "next");
  assert.equal(loader.state.busy, false);
});

test("a late response cannot expose a previous account's photographs after logout", async () => {
  let resolve!: (value: unknown) => void;
  const loader = pageLoader(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = loader.run();
  loader.generation.current++;
  resolve({ works: [{ id: "private" }], nextCursor: null });
  await pending;
  assert.equal(loader.state.works.length, 1);
  assert.equal(loader.state.works[0]!.id, "first");
});

test("the top switch exposes my battles and the photo cards include actual season and round counts", () => {
  const home = readFileSync(
    new URL("../app/[locale]/home-client.tsx", import.meta.url),
    "utf8",
  );
  assert.match(home, /battle-view-switch/);
  assert.match(home, /setBattleView\("mine"\)/);
  assert.match(home, /<MyBattles/);
  for (const field of [
    "work.votes",
    "work.round",
    "work.roundVotes",
    "work.votesToAdvance",
  ])
    assert(text.includes(field));
  assert(text.includes("/battles/mine"));
  assert(!text.includes("/battles/open"));
});
