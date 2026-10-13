import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gentlePiConfigHome } from "./agent-home.ts";

// ---------------------------------------------------------------------------
// Usage-window policy (issue #1653) — global file > env > default on
//
// Deliberately global-only (no project-file layer): the switch decides whether
// anything is fetched at all, so the same provider query would otherwise run
// in one repository and not in the next. Mirrors the resolution shape of
// lib/double-esc-cancel-policy.ts, with two deliberate differences: the window
// is on by default (turning it off has to be asked for), and a present-but-
// malformed file fails closed to "off" — the safe direction for the one
// preference that gates every subscription request.
// ---------------------------------------------------------------------------

export type UsagePolicy = "on" | "off";

/** Which of the three sources decided the effective policy. */
export type UsagePolicySource = "global_file" | "environment" | "default";

export interface UsagePolicyResolution {
	policy: UsagePolicy;
	source: UsagePolicySource;
	/** The deciding file was present but failed the strict decode. */
	malformed: boolean;
	globalFile: string;
	globalFileExists: boolean;
	/** The raw env value, reported even when it is unrecognized and inert. */
	envValue: string | undefined;
}

export interface LoadUsagePolicyOptions {
	/** Override the config home directory (used in tests to avoid touching ~/.pi). */
	gentlePiConfigHome?: string;
	/** Override the environment lookup (used in tests). */
	env?: Record<string, string | undefined>;
}

export const USAGE_POLICY_SCHEMA = "gentle-pi.usage/v1";
export const USAGE_POLICY_FILE = "usage.json";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict decode of {"schema":"gentle-pi.usage/v1","policy":"on"|"off"}.
 * Any malformed shape (bad JSON, wrong schema, unknown keys, invalid policy)
 * returns undefined so the caller fails closed to "off".
 */
export function parseUsagePolicyFile(raw: string): UsagePolicy | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed)) return undefined;
	if (parsed.schema !== USAGE_POLICY_SCHEMA) return undefined;
	if (parsed.policy !== "on" && parsed.policy !== "off") return undefined;
	if (Object.keys(parsed).length !== 2) return undefined;
	return parsed.policy;
}

/**
 * Resolve the usage-window policy AND the source that decided it.
 *
 * Resolution order (first hit wins):
 *   1. Global file `${configHome}/usage.json`
 *      (configHome honors GENTLE_PI_CONFIG_HOME, default ~/.pi/gentle-ai)
 *   2. Env var GENTLE_PI_USAGE ("on" | "off")
 *   3. Default "on"
 *
 * A present-but-malformed file fails closed to "off" instead of falling
 * through to the env var, and stays attributed to that file: "off decided by
 * a broken global file" and "off by default" are different situations, and
 * only the first one is a mistake to fix.
 */
export function resolveUsagePolicy(options: LoadUsagePolicyOptions = {}): UsagePolicyResolution {
	const env = options.env ?? process.env;
	const envValue = env.GENTLE_PI_USAGE;
	let globalFile = "";
	try {
		const configHome = options.gentlePiConfigHome ?? gentlePiConfigHome(env);
		globalFile = join(configHome, USAGE_POLICY_FILE);
		const globalFileExists = existsSync(globalFile);
		if (globalFileExists) {
			let decoded: UsagePolicy | undefined;
			try {
				decoded = parseUsagePolicyFile(readFileSync(globalFile, "utf8"));
			} catch {
				// Unreadable is indistinguishable from unusable at this layer, and
				// both must fail closed on the file that claimed the decision.
				decoded = undefined;
			}
			return decoded === undefined
				? { policy: "off", source: "global_file", malformed: true, globalFile, globalFileExists, envValue }
				: { policy: decoded, source: "global_file", malformed: false, globalFile, globalFileExists, envValue };
		}
		if (envValue === "on" || envValue === "off") {
			return { policy: envValue, source: "environment", malformed: false, globalFile, globalFileExists, envValue };
		}
		return { policy: "on", source: "default", malformed: false, globalFile, globalFileExists, envValue };
	} catch {
		return { policy: "on", source: "default", malformed: false, globalFile, globalFileExists: false, envValue };
	}
}

/**
 * The effective policy alone, for callers that do not report a source.
 * It delegates so the loader and the resolver can never disagree.
 */
export function loadUsagePolicy(options: LoadUsagePolicyOptions = {}): UsagePolicy {
	return resolveUsagePolicy(options).policy;
}

/**
 * Write the global policy file, creating the config home when needed.
 * Used by both `/gentle:usage on` and `/gentle:usage off`.
 */
export function writeUsagePolicy(policy: UsagePolicy, options: { gentlePiConfigHome?: string } = {}): string {
	const configHome = options.gentlePiConfigHome ?? gentlePiConfigHome();
	const path = join(configHome, USAGE_POLICY_FILE);
	mkdirSync(configHome, { recursive: true });
	writeFileSync(path, `${JSON.stringify({ schema: USAGE_POLICY_SCHEMA, policy }, null, 2)}\n`);
	return path;
}
