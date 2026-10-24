# Cursor CLI

Cursor's `agent` CLI joins the other local engines. It speaks the Agent Client Protocol, so it is one entry in `ACP_SPECS`, the same shape as Gemini CLI, OpenCode, Grok CLI, and Pi. A new driver is not part of this.

Checked against Cursor Agent `2026.10.01-e373342`. `agent acp` is an ACP server. A new session lists its models and a `model` config option, resumes with `session/load`, and asks with `session/request_permission`.

## What the person gets

The engine is named Cursor. Its driver kind is `cursorCli`. The built-in instance id is `cursor`.

The model picker lists every model that session reports. The default is Auto. In the protocol that id is `default[]` and its label is `Auto`. The CLI's own selected model does not become the default. Choosing another model still switches the session to that id.

Install from the app runs `curl -fsSL https://cursor.com/install | bash`. Sign-in is `agent login`, opened in Terminal the way the other CLIs sign in. There is no update badge: Cursor's version is not an npm release, and `engineUpdates` only knows npm packages.

## Launch

The catalog probe launches `agent` with args `["acp"]`. `agent --version` is the install check, and the version line is whatever that prints. The check is only that `agent --version` exits 0, so a different program named `agent` on PATH would be reported as Cursor.

A turn's argv is built on its own, because `--force` has to come before the `acp` subcommand. `AcpSpec` gains `replaceArgs`. When it is set, the turn launches `turnArgs(...)` and does not prepend `args`. The probe still uses `args`.

`turnArgs` is called with the flags the turn is already allowed to use:

- `fullAuto`: the engine's full-auto setting, and the turn is one the owner vouched for
- `fullAccess`: this agent is in full access, and the turn is not a shared room

Cursor's `turnArgs` returns `["--force", "acp"]` when either flag is set, and `["acp"]` otherwise. The model is not a command-line flag. The driver already switches it with `session/set_config_option` when the session's current id differs from the one the agent selected.

`--force` is this process only. Nothing writes `~/.cursor/cli-config.json`.

Grok's `turnArgs` keeps today's meaning. It does not set `replaceArgs`, and it ignores `fullAccess`.

## Models

Until the probe answers, the catalog is Auto alone: `{ id: "default[]", label: "Auto" }`. `probeModels` is set. `defaultModel` is `"default[]"`.

After a probe or a turn reports a catalog, the options are that list, in the CLI's order. If `default[]` is one of them, it stays the engine default. If it is absent, the session's own current model stays the default.

`isModelId` in `server/limits.ts` is the grammar for a saved model id:

`/^[\w.:@/\[\]+,=-]+$/`

`default[]` and `composer-2.5[fast=true]` pass. A space, a quote, `$`, a backtick, and a newline do not. The agent patch and the new-agent default both use it. The check in `ModelPicker` is that same expression.

## Sign-in

The access token lives in the keychain. The CLI also records who is signed in at `~/.cursor/cli-config.json` under `authInfo`. The snapshot treats the CLI as signed in when that file parses as JSON and `authInfo.authId` is a non-empty string. Otherwise an installed CLI is signed out, and the existing banner applies. The auth id is not logged and not sent to the client.

`AcpSpec.signedIn(home)` is that check for Cursor. Engines that still use `authFiles` are unchanged.

## Run Everything

Cursor's `approvalMode` is read from the same file. The only value that matters here is `unrestricted`. In that mode the CLI does not send `session/request_permission`, and Bloks can only ask when a request arrives. There is no flag that forces the allowlist for one run.

When the CLI is signed in and the mode is `unrestricted`, the snapshot carries

`note`: `Cursor is set to Run Everything, so this agent will not ask before it acts. Change that in the Cursor CLI if you want Bloks to ask.`

The engine stays available. A signed-out CLI gets the signed-out banner and no note. `allowlist` and `auto-review` set no note. A missing or unreadable mode sets no note. A request that still arrives becomes the approval card ACP already shows, and an engine set to full auto still auto-answers that card. Full access still passes `--force`, including when the CLI is already on Run Everything.

The chat banner shows `snapshot.note` for an agent on that engine. It uses the warning tone. Dismissing it is stored apart from the signed-out banner, and it does not block sending. On the engines list, a connected Cursor row keeps "Connected" and adds the same sentence under it.

## Where it is registered

- `ACP_SPECS` entry, as above. Display name `Cursor`. Command `agent`. Install and sign-in text as above. No `keyEnv`, no `scrubEnv`, no `authFiles`.
- `CLI_PROVIDERS`: auth `cli`, the install line, `agent login`, docs `https://cursor.com/docs/cli`.
- `BUILT_IN_CLI_INSTANCES`: `cursor` → `cursorCli`.
- `ENGINE_SETUP`: the install script and `agent login`.
- `CLI_DRIVERS`: `cursorCli`, so a turn can hand the agent its workspace credential through the process environment.
- Settings inspection groups `cursorCli` with the other CLIs that expose `cli` and `fullAuto`.
- Onboarding lists it as optional, with the same install command.
- The mark is a black tile with a white C, in `ProviderIcons`.
- No `ENGINE_PACKAGES` entry. No `BY_DRIVER` family. Auto's id matches no family, so a family pause does not hold an agent left on Auto. A pause on the driver or on a model id still holds. `sharedSafe` stays as it is, so a shared room does not run Cursor.

`docs/ARCHITECTURE.md` stays as it is. Adding an ACP engine is already described there.

## Tests

No test starts the real CLI.

- The spec's command, args, `probeModels`, `defaultModel`, and placeholder catalog.
- Turn argv is `["acp"]`, or `["--force", "acp"]` when `fullAuto` or `fullAccess` is set.
- A catalog whose current model is not Auto, and which includes `default[]`, keeps every option and defaults to `default[]`.
- `isModelId` accepts `default[]` and `composer-2.5[fast=true]`, and rejects a space, a double quote, and `$(whoami)`.
- Signed in only when `authInfo.authId` is a non-empty string. Missing file, invalid JSON, and no `authInfo` are signed out.
- The Run Everything sentence is returned only for `approvalMode: "unrestricted"`.
- `runsAProcess("cursorCli")` is true.
- The settings projection for `cursorCli` includes `cli` and `fullAuto`.
