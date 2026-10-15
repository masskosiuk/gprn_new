import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

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
let renderer: ts.FunctionDeclaration | undefined;
function visit(node: ts.Node) {
  if (
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "renderPhotoMasonry"
  )
    renderer = node;
  ts.forEachChild(node, visit);
}
visit(source);
assert(renderer);

interface Element {
  type: unknown;
  props: Record<string, any>;
  children: any[];
}
const criteria = [
  "composition",
  "lighting",
  "technicalQuality",
  "storytelling",
  "originality",
  "color",
  "emotionalImpact",
];
function fixture(scores: Record<string, number> | null) {
  const actions: unknown[] = [];
  const render = runInNewContext(
    ts.transpileModule(`${renderer!.getText(source)}\nrenderPhotoMasonry;`, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
      },
    }).outputText,
    {
      React: {
        createElement: (
          type: unknown,
          props: unknown,
          ...children: unknown[]
        ) => ({ type, props: props ?? {}, children: children.flat() }),
      },
      getPhotoTitle: () => "Work",
      likedPhotoIds: [],
      locale: "ru",
      getPhotoCriterionScores: () => scores,
      battleCriteria: criteria.map((id) => ({ id, labelKey: id, Icon: id })),
      isVideoWork: () => false,
      compactNumberFormatter: new Intl.NumberFormat("ru", {
        notation: "compact",
      }),
      t: (key: string) => key,
      Heart: "heart-icon",
      Star: "star-icon",
      Video: "video-icon",
      CommentButton: "comment-button",
      toggleLikePhoto: () => {},
      openPhotoPreview: (photo: unknown) => actions.push(photo),
    },
  );
  const photo = {
    id: "photo",
    src: "image.jpg",
    votes: 12,
    commentCount: 3,
    serverBacked: true,
    published: true,
  };
  return { render, photo, actions };
}
function find(node: Element, className: string): Element | undefined {
  if (node.props?.className?.split(" ").includes(className)) return node;
  for (const child of node.children ?? []) {
    if (child && typeof child === "object") {
      const result = find(child, className);
      if (result) return result;
    }
  }
}

test("tiles show only likes, comments and the overall star without detailed criteria", () => {
  const { render, photo } = fixture(
    Object.fromEntries(criteria.map((id) => [id, 8])),
  );
  const tree = render([photo]);
  const actions = find(tree, "photo-tile-actions")!;
  assert.deepEqual(
    actions.children.map((child: Element) => child.type),
    ["button", "comment-button", "button"],
  );
  assert.equal(find(tree, "photo-tile-criteria"), undefined);
  const star = find(tree, "photo-tile-details")!;
  assert.equal(star.props["aria-label"], "battles.overallScore: 8,0");
  assert.equal(star.children[1].children[0], "8,0");
});

test("the overall star uses all criterion scores rather than likes or a stale score", () => {
  const { render, photo } = fixture(
    Object.fromEntries(criteria.map((id, i) => [id, i + 3])),
  );
  const tree = render([{ ...photo, score: 99, votes: 123456 }]);
  assert.equal(
    find(tree, "photo-tile-details")!.children[1].children[0],
    "6,0",
  );
});

test("unrated work omits both the star and the score placeholder", () => {
  const { render, photo } = fixture(null);
  const tree = render([photo]);
  assert.equal(find(tree, "photo-tile-details"), undefined);
  assert.deepEqual(
    find(tree, "photo-tile-actions")!
      .children.filter(Boolean)
      .map((child: Element) => child.type),
    ["button", "comment-button"],
  );
});

test("the overall star still opens the original work for detailed scores", () => {
  const { render, photo, actions } = fixture(
    Object.fromEntries(criteria.map((id) => [id, 8])),
  );
  find(render([photo]), "photo-tile-details")!.props.onClick();
  assert.equal(actions[0], photo);
});

test("unpublished work retains the compact overlay without an empty comments slot", () => {
  const { render, photo } = fixture(null);
  const tree = render([{ ...photo, published: false }]);
  assert.equal(find(tree, "photo-tile-criteria"), undefined);
  assert.equal(tree.props.className, "photo-masonry");
  assert.equal(
    find(tree, "photo-tile-actions")!.children.filter(Boolean).length,
    1,
  );
});
