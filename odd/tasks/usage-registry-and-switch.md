# Usage Registry and Switch

Re-do of the `/uso` contribution (issue #1653) from scratch on the current `main`,
replacing the stale `feat/usage-window-providers` branch: one provider table for the
subscription usage window, and a global on/off switch for the whole window.

## Specs

S1. Issue #1653 title (verbatim): `feat(shell): any provider in the usage window, and a switch to turn it off`.

S2. Issue #1653, "Proposed outcome" (verbatim, three bullets):

- "**One registry table** in `lib/shell-usage.ts`: each provider is described by `{ id, pendingNote, fetchUsage? }`, and `SUPPORTED_USAGE_PROVIDERS` / `providerNote` are derived from it, so adding a provider is one entry and no per-provider branching lives outside the table. Codex and Anthropic keep byte-identical behavior (the Anthropic entry carries no `fetchUsage` because its windows arrive in response headers)."
- "**A global-only switch**: global file `<configHome>/usage.json` with schema `gentle-pi.usage/v1`, env `GENTLE_PI_USAGE`, default **on**; `/gentle:usage on|off|status` where no argument still opens the panel; while it is off nothing is fetched at all (not on session start, not on the shortcut, not on a refresh) and no usage segment is drawn in the bar or in the header; a malformed file fails closed to off instead of falling through to the env var, and keeps the decision attributed to that file."
- "**Docs**: how to add a provider, and how the switch resolves, with the collapsed and expanded views of the card."

S3. Issue #1653, "Alternatives considered" (verbatim, the two rejections that bind the shape):

- "Letting the switch be overridden per project: rejected. It decides whether anything is fetched at all, so the same provider query would happen in one repository and not in the next."
- "Drawing an empty but present segment while off: rejected. The point of the switch is that the affordance and the query both disappear."

S4. User decisions (2026-10-12, verbatim): "no, hagamos todo de cero , en español, siguiendo este flujo que prometes", answered as "Inglés + traducción para vos" (public artifacts in English; a Spanish translation reaches the user before anything is published), "Nativo: registry + switch" (fresh native implementation on current `main`), and "Reusar #1653 y pedir el label" (the PR waits for `status:approved`).

S5. House constraints carried by the issue (verbatim): "Per-provider requests exist for some of these providers; this asks for the general mechanism they would all use and does not close any of them by itself."

## Tasks

| ID  | Specs                | Route                          | Commit |
| --- | -------------------- | ------------------------------ | ------ |
| T1  | S1, S2 (table)       | Inline, test-first: move the two fetchers into `lib/shell-usage.ts`, add `UsageProviderAdapter` + `USAGE_PROVIDERS`, derive `SUPPORTED_USAGE_PROVIDERS`, `usageProvider`, `providerNote`, and dispatch from the extension through the table | |
| T2  | S2 (switch), S3, S4  | Inline, test-first: `lib/usage-policy.ts`, `/gentle:usage on|off|status`, no fetch and no segment while off, `usageEnabled` on the bar/header model | |
| T3  | S2 (docs), S5        | Inline: document the table and the switch in `docs/gentle-shell.md` (and the command reference it lives in) | |

## Log

L1 (user, 2026-10-12, verbatim): "no, hagamos todo de cero , en español, siguiendo este flujo que prometes"

L2 (decisions, 2026-10-12): public texts in English with a Spanish translation for the user; native registry + switch, written from scratch on current `main`; reuse issue #1653 and request `status:approved` before any PR.

L3 (evidence, 2026-10-12): fresh branch `feat/usage-registry-and-switch` created from `origin/main` (`d3d826c08`) in `/home/nicko-lencina/bench/gentle-shell`; the previous branch `feat/usage-window-providers` stays untouched as reference. On current `main` the closed surface is `SUPPORTED_USAGE_PROVIDERS` (literal, `lib/shell-usage.ts:120`) plus the ternary in `refreshProvider` (`extensions/gentle-shell.ts`), and the two fetchers live in the extension, not the lib.
