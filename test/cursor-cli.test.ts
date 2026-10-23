import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ACP_SPECS,
  CURSOR_AUTO_MODEL,
  CURSOR_RUN_EVERYTHING,
  acpLaunchFlags,
  acpTurnArgv,
  catalogWithDefault,
  cursorApprovalNote,
  cursorSignedIn,
} from "../server/drivers/acp.ts";

const cursor = () => {
  const spec = ACP_SPECS.find((s) => s.kind === "cursorCli");
  assert.ok(spec);
  return spec;
};

test("Cursor is an ACP engine whose placeholder is Auto", () => {
  const spec = cursor();
  assert.equal(spec.command, "agent");
  assert.deepEqual(spec.args, ["acp"]);
  assert.equal(spec.probeModels, true);
  assert.equal(spec.defaultModel, CURSOR_AUTO_MODEL);
  assert.equal(spec.replaceArgs, true);
  assert.equal(spec.models.default, "default[]");
  assert.deepEqual(spec.models.options, [{ id: "default[]", label: "Auto" }]);
});

test("a normal turn is agent acp, and full access puts --force before acp", () => {
  const spec = cursor();
  assert.deepEqual(acpTurnArgv(spec, { fullAuto: false, fullAccess: false }), ["acp"]);
  assert.deepEqual(acpTurnArgv(spec, { fullAuto: true, fullAccess: false }), ["--force", "acp"]);
  assert.deepEqual(acpTurnArgv(spec, { fullAuto: false, fullAccess: true }), ["--force", "acp"]);
});

test("engine full-auto stops at an untrusted turn, and agent full access stops in a shared room", () => {
  assert.deepEqual(acpLaunchFlags({ fullAuto: true }, { untrusted: true }), {
    fullAuto: false,
    fullAccess: false,
  });
  assert.deepEqual(acpLaunchFlags({ fullAuto: false }, { fullAccess: true, shared: true }), {
    fullAuto: false,
    fullAccess: false,
  });
  assert.deepEqual(acpLaunchFlags({ fullAuto: true }, {}), {
    fullAuto: true,
    fullAccess: false,
  });
  assert.deepEqual(acpLaunchFlags({ fullAuto: false }, { fullAccess: true }), {
    fullAuto: false,
    fullAccess: true,
  });
});

test("Auto stays the picker default when the session is on another model", () => {
  const spec = cursor();
  const pinned = catalogWithDefault(spec, {
    default: "composer-2.5[fast=true]",
    options: [
      { id: "default[]", label: "Auto" },
      { id: "composer-2.5[fast=true]", label: "composer-2.5" },
    ],
  });
  assert.equal(pinned.default, "default[]");
  assert.deepEqual(pinned.options.map((o) => o.id), ["default[]", "composer-2.5[fast=true]"]);
});

function homeWith(config: unknown): string {
  const home = mkdtempSync(join(tmpdir(), "cursor-cli-"));
  mkdirSync(join(home, ".cursor"));
  writeFileSync(join(home, ".cursor", "cli-config.json"), JSON.stringify(config));
  return home;
}

test("signed in only when authInfo.authId is a non-empty string", () => {
  assert.equal(cursorSignedIn(homeWith({ authInfo: { authId: "user_1" } })), true);
  assert.equal(cursorSignedIn(homeWith({ authInfo: { authId: "" } })), false);
  assert.equal(cursorSignedIn(homeWith({})), false);
  assert.equal(cursorSignedIn(homeWith([])), false);
  const broken = mkdtempSync(join(tmpdir(), "cursor-cli-"));
  mkdirSync(join(broken, ".cursor"));
  writeFileSync(join(broken, ".cursor", "cli-config.json"), "{");
  assert.equal(cursorSignedIn(broken), false);
  assert.equal(cursorSignedIn(mkdtempSync(join(tmpdir(), "cursor-cli-"))), false);
});

test("Run Everything is noted only for a signed-in unrestricted CLI", () => {
  const signed = { authInfo: { authId: "user_1" } };
  assert.equal(cursorApprovalNote(homeWith({ ...signed, approvalMode: "unrestricted" })), CURSOR_RUN_EVERYTHING);
  assert.equal(cursorApprovalNote(homeWith({ ...signed, approvalMode: "allowlist" })), null);
  assert.equal(cursorApprovalNote(homeWith({ ...signed, approvalMode: "auto-review" })), null);
  assert.equal(cursorApprovalNote(homeWith({ approvalMode: "unrestricted" })), null);
});
