import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ApiRequestError } from "./auth-client.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
test("collapsed admin categories expose pending counts in their summary, without empty badges", () => {
  const community = ts.createSourceFile(
    "community.tsx",
    readFileSync(
      new URL("../app/[locale]/community.tsx", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const functions = community.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      ["AdminFold", "AdminQueueCount"].includes(node.name?.text ?? ""),
  );
  assert.equal(functions.length, 2);
  const exports: {
    AdminFold?: React.ComponentType<{
      title: string;
      count?: number;
      children: React.ReactNode;
    }>;
  } = {};
  const compiled = ts.transpileModule(
    functions.map((node) => node.getText(community)).join("\n"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(compiled, {
    exports,
    React,
    ChevronDown: () => null,
    useWords: () => (ru: string) => ru,
  });
  const Fold = exports.AdminFold!;
  const html = renderToStaticMarkup(
    React.createElement(Fold, {
      title: "Portfolio",
      count: 103,
      children: "Queue content",
    }),
  );
  assert.match(html, /<summary>.*Awaiting|<summary>.*community-admin-count/);
  assert.match(html, />103<\/span>.*<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]+open/);
  const empty = renderToStaticMarkup(
    React.createElement(Fold, {
      title: "Portfolio",
      count: 0,
      children: "Empty",
    }),
  );
  assert.doesNotMatch(empty, /community-admin-count/);
});
function findFunction(name: string): ts.FunctionDeclaration {
  let result: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      result = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert(result);
  return result;
}

for (const [handler, item, id] of [
  ["moderateAdminPhoto", { id: "photo-1" }, "photo-1"],
  [
    "moderateAdminSubmission",
    { entryId: "entry-1", kind: "battle" },
    "entry-1",
  ],
] as const) {
  function fixture(reason: string, failure?: Error) {
    const errors: Record<string, string> = {};
    const requests: { path: string; init: RequestInit }[] = [];
    let focused = false;
    let refreshed = false;
    const context = {
      ApiRequestError,
      AbortSignal,
      adminModerationDrafts: { [id]: { categorySlug: "documentary", reason } },
      adminBusyPhotoId: null,
      adminBusySubmissionId: null,
      adminReasonInputs: {
        current: {
          [id]: {
            focus() {
              focused = true;
            },
          },
        },
      },
      t: (key: string) => key,
      setAdminModerationErrors: (
        updater: (current: Record<string, string>) => Record<string, string>,
      ) => Object.assign(errors, updater(errors)),
      setAdminBusyPhotoId() {},
      setAdminBusySubmissionId() {},
      setAdminFeedback() {},
      async apiRequest(path: string, init: RequestInit) {
        requests.push({ path, init });
        if (failure) throw failure;
      },
      async loadAdminData() {
        refreshed = true;
      },
      async refreshServerBattles() {},
      async refreshServerChallenges() {},
    };
    const compiled = ts.transpileModule(findFunction(handler).getText(source), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const run = runInNewContext(compiled + `\n${handler}`, context) as (
      item: unknown,
      status: string,
    ) => Promise<void>;
    return {
      run: (status: string) => run(item, status),
      errors,
      requests,
      focused: () => focused,
      refreshed: () => refreshed,
    };
  }
  test(`${handler}: empty rejection reason is shown at the card and focused`, async () => {
    const f = fixture("  ");
    await f.run("REJECTED");
    assert.equal(f.requests.length, 0);
    assert.equal(f.errors[id], "admin.reasonRequired");
    assert.equal(f.focused(), true);
  });
  test(`${handler}: valid rejection sends trimmed reason and refreshes queues`, async () => {
    const f = fixture("  Needs correction  ");
    await f.run("REJECTED");
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0]!.init.method, "PATCH");
    assert.deepEqual(JSON.parse(String(f.requests[0]!.init.body)), {
      categorySlug: "documentary",
      moderationStatus: "REJECTED",
      reason: "Needs correction",
    });
    assert.equal(f.refreshed(), true);
  });
  test(`${handler}: API failure remains visible on the affected card`, async () => {
    const f = fixture("A reason", new ApiRequestError(503));
    await f.run("REJECTED");
    assert.equal(f.errors[id], "admin.actionFailed");
    assert.equal(f.refreshed(), false);
  });
  test(`${handler}: approval does not require a rejection reason`, async () => {
    const f = fixture("");
    await f.run("APPROVED");
    assert.equal(f.requests.length, 1);
    assert.equal(f.refreshed(), true);
  });
}
