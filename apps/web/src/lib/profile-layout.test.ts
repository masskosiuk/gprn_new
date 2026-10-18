import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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

function descendants(
  node: ts.Node,
  predicate: (node: ts.Node) => boolean,
): ts.Node[] {
  const found: ts.Node[] = [];
  function visit(child: ts.Node) {
    if (predicate(child)) found.push(child);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

for (const name of ["renderPublicAuthorProfile", "renderProfilePage"])
  test(`${name} keeps metrics in the discussion row, not a separate bottom strip`, () => {
    const renderer = descendants(
      source,
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
    )[0]!;
    assert(renderer);
    const metrics = descendants(
      renderer,
      (node) =>
        ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(source) === "ProfileStats",
    );
    assert.equal(metrics.length, 1);
    const row = metrics[0]!.parent;
    assert(ts.isJsxElement(row));
    const className = row.openingElement.attributes.properties.find(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        attribute.name.getText(source) === "className",
    );
    assert(
      className &&
        ts.isJsxAttribute(className) &&
        className.initializer &&
        ts.isStringLiteral(className.initializer),
    );
    assert(
      className.initializer.text.split(" ").includes("profile-summary-actions"),
    );
    assert.equal(
      descendants(
        row,
        (node) =>
          ts.isJsxSelfClosingElement(node) &&
          node.tagName.getText(source) === "DiscussionButton",
      ).length,
      1,
    );
    assert.equal(
      descendants(
        row,
        (node) =>
          ts.isJsxAttribute(node) && node.name.getText(source) === "rating",
      ).length,
      1,
    );
  });
