import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
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

const ownerRenderer = descendants(
  source,
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "renderProfilePage",
)[0]!;
const toggle = descendants(
  ownerRenderer,
  (node) =>
    ts.isJsxElement(node) &&
    node.openingElement.tagName.getText(source) === "button" &&
    node.openingElement.attributes.properties.some(
      (prop) =>
        ts.isJsxAttribute(prop) &&
        prop.initializer &&
        ts.isStringLiteral(prop.initializer) &&
        prop.initializer.text.includes("profile-settings-toggle"),
    ),
)[0]!;
function evaluate(code: string, values: object = {}) {
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  return runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    { exports: {}, require: () => ({ jsx, jsxs: jsx }), ...values },
  );
}
function attribute(node: ts.JsxOpeningLikeElement, name: string) {
  const value = node.attributes.properties.find(
    (prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === name,
  );
  assert(
    value &&
      ts.isJsxAttribute(value) &&
      value.initializer &&
      ts.isJsxExpression(value.initializer) &&
      value.initializer.expression,
  );
  return value.initializer.expression.getText(source);
}

test("profile settings start closed and are reset on account or page changes", () => {
  const state = descendants(
    source,
    (node) =>
      ts.isVariableDeclaration(node) &&
      ts.isArrayBindingPattern(node.name) &&
      node.name.elements[0]?.getText(source) === "profileSettingsOpen",
  )[0];
  assert(state && ts.isVariableDeclaration(state) && state.initializer);
  assert.equal(
    evaluate(state.initializer.getText(source), {
      useState: (initial: unknown) => initial,
    }),
    false,
  );
  const reset = descendants(
    source,
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "useEffect" &&
      node.arguments[0]
        ?.getText(source)
        .includes("setProfileSettingsOpen(false)"),
  )[0];
  assert(reset && ts.isCallExpression(reset));
  const dependencies = reset.arguments[1]?.getText(source) ?? "";
  assert(dependencies.includes("initialSection"));
  assert(dependencies.includes("serverUser?.id"));
});

test("the same accessible settings button opens and closes the panel without changing profile drafts", () => {
  let open = false;
  const draft = { displayName: "Unsaved name", bio: "Unsaved biography" };
  const render = () =>
    evaluate(`(${toggle.getText(source)})`, {
      profileSettingsOpen: open,
      setProfileSettingsOpen: (update: (value: boolean) => boolean) => {
        open = update(open);
      },
      profileForm: draft,
      setProfileForm: () => {
        throw new Error("Toggle must not reset profile drafts");
      },
      t: (key: string) => key,
      Settings2: "Settings2",
    });
  const closed = render();
  assert.equal(closed.props["aria-expanded"], false);
  assert.equal(closed.props["aria-controls"], "profile-settings-panel");
  assert.equal(closed.props["aria-label"], "profile.showSettings");
  closed.props.onClick();
  assert.equal(render().props["aria-expanded"], true);
  assert.equal(render().props["aria-label"], "profile.hideSettings");
  render().props.onClick();
  assert.equal(render().props["aria-expanded"], false);
  assert.deepEqual(draft, {
    displayName: "Unsaved name",
    bio: "Unsaved biography",
  });
});

test("closed owner profiles use the public full-width layout, while opening restores the existing two-column shell", () => {
  const shell = descendants(
    ownerRenderer,
    (node) =>
      ts.isJsxOpeningElement(node) &&
      node.tagName.getText(source) === "div" &&
      node.attributes.properties.some(
        (prop) =>
          ts.isJsxAttribute(prop) &&
          /profile-shell\$\{\s*profileSettingsOpen/.test(
            prop.initializer?.getText(source) ?? "",
          ),
      ),
  )[0];
  assert(shell && ts.isJsxOpeningElement(shell));
  const code = attribute(shell, "className");
  assert.equal(
    evaluate(`(${code})`, { profileSettingsOpen: false }),
    "profile-shell public-profile-shell",
  );
  assert.equal(
    evaluate(`(${code})`, { profileSettingsOpen: true }),
    "profile-shell is-editing",
  );
});

test("settings stay mounted but hidden when collapsed, preserving their form fields and callbacks", () => {
  const panel = descendants(
    ownerRenderer,
    (node) =>
      ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "aside",
  )[0];
  assert(panel && ts.isJsxOpeningElement(panel));
  assert.equal(
    evaluate(`(${attribute(panel, "hidden")})`, { profileSettingsOpen: false }),
    true,
  );
  assert.equal(
    evaluate(`(${attribute(panel, "hidden")})`, { profileSettingsOpen: true }),
    false,
  );
  let parent: ts.Node | undefined = panel.parent;
  while (parent && parent !== ownerRenderer) {
    assert(
      !ts.isConditionalExpression(parent),
      "Panel should not unmount when toggled",
    );
    parent = parent.parent;
  }
  assert(panel.parent.getText(source).includes('id="profile-bio"'));
  assert(panel.parent.getText(source).includes("onSubmit={saveProfile}"));
  const css = readFileSync(
    new URL("../app/[locale]/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.profile-edit\[hidden\]\s*\{\s*display:\s*none/);
});

test("public author profiles do not expose private settings or wallet controls", () => {
  const publicRenderer = descendants(
    source,
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "renderPublicAuthorProfile",
  )[0]!;
  assert(!publicRenderer.getText(source).includes("profile-settings-toggle"));
  assert(!publicRenderer.getText(source).includes("profile-edit"));
});
