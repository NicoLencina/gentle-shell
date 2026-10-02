# Usage Window: Any Provider, and a Switch

## Objective

The subscription usage window (the bar segment, the fullscreen header segment and the
`/gentle:usage` panel) should report the usage of whichever provider the session runs on,
instead of the three ids hardcoded today. Adding a provider should be one entry in one
table, and the whole window should be switchable off for anyone who does not want it.

Today the surface is closed twice over: `SUPPORTED_USAGE_PROVIDERS` is a literal list, and
the refresh path returns early unless the provider is one of three ids with a hand-written
ternary picking its fetcher. A user whose provider is not in that list gets
"no subscription usage for this provider" even when the provider publishes the numbers —
`opencode-go` does, and that is the case this change was written for.

## Constraints

- Strict behavioral TDD: a focused failing test precedes every behavior.
- The fetch stays fixed-origin, refuses redirects, and keeps no stored copy; a key is never
  logged, persisted, rendered, or included in an error path.
- Refresh stays throttled to at most every 5 minutes per provider, plus session start and an
  explicit `r`; the last valid snapshot survives a failed refresh.
- Parsing stays bounded: an unknown or malformed payload degrades to "no data", never throws.
- Codex and Anthropic behavior stays byte-identical.
- The registry carries no user-supplied URL: every entry is code reviewed in this repository,
  so a stored key can only ever be sent to an origin named here.
- No delivery actions (no push, no PR) without an explicit user decision.

## Authorized edit surfaces

- `odd/tasks/usage-window-providers.md`
- `lib/shell-usage.ts`
- `lib/usage-policy.ts` (new)
- `lib/shell-bar.ts` (only the usage segment's visibility)
- `extensions/gentle-shell.ts`
- `tests/shell-usage.test.ts`
- `tests/usage-policy.test.ts` (new)
- `tests/shell-bar.test.ts`
- `tests/gentle-shell.test.ts`
- `docs/gentle-shell.md`
- `docs/readme-reference.md`

## Source contract

`opencode-go`, verified against a live Go subscription key on 2026-09-20:

- `GET https://opencode.ai/zen/go/v1/usage` with `Authorization: Bearer <opencode-go key>`.
- Response: `{"usage":{"rolling":{"status":"ok","percent":6,"resetsAt":"2026-09-20T20:19:35.848Z"},"weekly":{...},"monthly":{...}}}`.
- Percentages are whole numbers 0–100, so `percent: 1` is one percent. A parser that treats
  a value `<= 1` as a fraction prints `100%` for a nearly untouched window.
- Windows are a rolling 5h, a weekly and a monthly one, each with the instant it resets.
- The sibling paths (`/usage/limits`, `/usage/tokens`, `/subscription`, `/plan`) return 404,
  and `/zen/go/v1/models` carries no usage, so this endpoint is the whole surface.
- The documented plan limits are dollar-based and per model, and the payload reports neither
  tokens nor dollars: percentage plus reset is everything it actually states.

## Tasks

- [x] WU-1 — One table: move the three fetchers into `lib/shell-usage.ts`, describe each
      provider with `{ id, pendingNote, fetchUsage? }`, derive `SUPPORTED_USAGE_PROVIDERS`
      and `providerNote` from it, and drive the refresh path from `usageProvider(id)`.
      `opencode-go` becomes an entry. Codex and Anthropic keep their exact behavior; the
      Anthropic entry carries no `fetchUsage` because its windows arrive in response headers.
- [x] WU-2 — The switch: `lib/usage-policy.ts` mirroring `lib/double-esc-cancel-policy.ts`
      (global file `<configHome>/usage.json` with schema `gentle-pi.usage/v1`, env
      `GENTLE_PI_USAGE`, default `on`), `/gentle:usage on|off|status` with no argument still
      opening the panel, no fetch while it is off, and no usage segment in the bar or the
      header while it is off.
- [x] WU-3 — Document the registry (how to add a provider) and the switch, and record the
      evidence.

## Acceptance criteria

- A session on `opencode-go` shows its three windows in the bar and the panel, with the reset
  each window reports.
- A provider absent from the table still renders `no subscription usage for this provider`.
- `SUPPORTED_USAGE_PROVIDERS` and `providerNote` cannot drift from the table: both are derived
  from it, and a test pins that.
- With the policy off: no fetch is issued, no usage segment appears in the bar or the header,
  and `/gentle:usage` reports the state and the command that turns it back on.
- With the policy off and a malformed policy file, the resolver fails closed and reports the
  file that decided, exactly as the double-esc-cancel policy does.
- Existing Codex, Claude and NaN tests keep passing unchanged.
- Focused tests, the full suite, and typecheck pass.

## Progress

- 2026-09-20: branch `feat/usage-window-providers` cut from `f2d9d073` in
  `/home/nicko-lencina/bench/gentle-shell`. The opencode-go parser, fetcher, table insertion
  and their tests already exist uncommitted in the working tree and are absorbed by WU-1.

## Verification evidence

- Baseline before WU-1, with the uncommitted opencode-go work in the tree:
  `node --experimental-strip-types --test tests/shell-usage.test.ts` — 31 passed, 0 failed.
- WU-1 landed as commit `31630c59` on `feat/usage-window-providers` (one commit ahead of
  `origin/main`): the single `USAGE_PROVIDERS` table drives `SUPPORTED_USAGE_PROVIDERS`,
  `providerNote(id)` and `usageProvider(id)`, with `opencode-go` as one entry and Anthropic
  carrying no `fetchUsage`.
- WU-2 wiring landed as the uncommitted working-tree changes to
  `lib/usage-policy.ts`, `lib/shell-bar.ts` and `extensions/gentle-shell.ts`, with their
  tests in `tests/usage-policy.test.ts`, `tests/shell-bar.test.ts` and
  `tests/gentle-shell.test.ts`.
- WU-3 documentation landed in `docs/gentle-shell.md` ("Adding a provider", "Turning the
  window off", both screenshots under `docs/assets/features/`) and `docs/readme-reference.md`
  ("Usage window policy" and the `/gentle:usage` command-table row).
- Focused suites, all green:
  - `node --experimental-strip-types --test tests/usage-policy.test.ts` — 14 pass, 0 fail.
  - `node --experimental-strip-types --test tests/gentle-shell.test.ts` — 100 pass, 0 fail.
  - `node --experimental-strip-types --test tests/shell-bar.test.ts` — 35 pass, 0 fail.
  - `node --experimental-strip-types --test tests/shell-usage.test.ts` — 36 pass, 0 fail.
- `pnpm typecheck` — passes; `types: 196 recorded diagnostic(s), no regressions; 3 file/code
  pair(s) improved`.
- `pnpm test` (full suite, run in full) — 2985 tests, 2937 pass, 47 skipped, 1 fail. The one
  failure is `tests/review-host-relay-routing.test.ts:282` ("a missing review-refuter routing
  model is refused typed...", `failure.kind` is `undefined` instead of
  `reviewer-config-invalid`). It is pre-existing and unrelated: the file and every module it
  imports (`extensions/gentle-ai.ts`, `lib/review-host-relay.ts`, `lib/review-integration-v2.ts`,
  `lib/native-review-cli.ts`) are byte-identical to `origin/main` (`git diff origin/main HEAD --
  <those files>` is empty), this branch never imports `gentle-shell.ts` from `gentle-ai.ts`, and
  the failure reproduces in isolation with `GENTLE_PI_CONFIG_HOME`, `GENTLE_PI_REVIEW_RELAY_CONTRACT`
  unset and `HOME` overridden. It was not introduced or touched by this change and it is outside
  the authorized edit surfaces.

## Limits

- The `opencode-go` source contract was verified against a live Go subscription key on
  2026-09-20; it is not covered by an automated live integration test. The `percent` shape that
  treats whole numbers 0–100 (not fractions) is pinned by unit tests over the documented
  payload, not by a network call.
- The full suite is not green on this base because of the unrelated
  `tests/review-host-relay-routing.test.ts:282` failure described above; that test is outside
  the authorized edit surfaces and was left untouched.

## Next step

WU-1, WU-2 and WU-3 are complete. The parent owns the commit and the pull request; no
remaining implementation work is required for this task.
