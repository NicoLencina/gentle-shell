import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import {
	loadUsagePolicy,
	parseUsagePolicyFile,
	resolveUsagePolicy,
	USAGE_POLICY_FILE,
	USAGE_POLICY_SCHEMA,
	writeUsagePolicy,
} from "../lib/usage-policy.ts";

// ---------------------------------------------------------------------------
// Usage-window policy (issue #1653).
//
// Global-only resolver: global file > env var > default on. The window is on
// by default, unlike double-esc-cancel: the switch removes an affordance and
// a query that already exist, so turning it off has to be asked for. Strict
// schema decode, and a present-but-malformed file fails closed to "off" — the
// safe direction for the one preference that decides whether anything is
// fetched at all.
// ---------------------------------------------------------------------------

const scratchRoots: string[] = [];

function makeScratch(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	scratchRoots.push(dir);
	return dir;
}

after(() => {
	for (const dir of scratchRoots) rmSync(dir, { recursive: true, force: true });
});

function writePolicyFile(dir: string, policy: string): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, USAGE_POLICY_FILE), JSON.stringify({ schema: USAGE_POLICY_SCHEMA, policy }));
}

const EMPTY_ENV = {} as Record<string, string | undefined>;

test("the global file and schema are the ones the issue names", () => {
	assert.equal(USAGE_POLICY_FILE, "usage.json");
	assert.equal(USAGE_POLICY_SCHEMA, "gentle-pi.usage/v1");
});

// --- strict decode ---------------------------------------------------------

test("strict decode accepts exactly the v1 schema with policy on|off", () => {
	assert.equal(parseUsagePolicyFile(`{"schema":"${USAGE_POLICY_SCHEMA}","policy":"on"}`), "on");
	assert.equal(parseUsagePolicyFile(`{"schema":"${USAGE_POLICY_SCHEMA}","policy":"off"}`), "off");
});

test("strict decode rejects malformed shapes", () => {
	for (const raw of [
		"not json",
		"[]",
		"null",
		'{"policy":"on"}',
		'{"schema":"gentle-pi.usage/v2","policy":"on"}',
		`{"schema":"${USAGE_POLICY_SCHEMA}","policy":"ON"}`,
		`{"schema":"${USAGE_POLICY_SCHEMA}","policy":true}`,
		`{"schema":"${USAGE_POLICY_SCHEMA}","policy":"on","extra":1}`,
	]) {
		assert.equal(parseUsagePolicyFile(raw), undefined, `must reject: ${raw}`);
	}
});

// --- cascade: global file > env > default on --------------------------------

test("default is on with no file and no env", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai");
	assert.equal(loadUsagePolicy({ gentlePiConfigHome: configHome, env: EMPTY_ENV }), "on");
});

test("the resolver reads GENTLE_PI_CONFIG_HOME from the given env, never from process.env", () => {
	const root = makeScratch("gp-usage-envhome-");
	writePolicyFile(root, "off");
	const result = resolveUsagePolicy({ env: { GENTLE_PI_CONFIG_HOME: root } });
	assert.equal(result.policy, "off");
	assert.equal(result.globalFile, join(root, USAGE_POLICY_FILE));
});

test("global file overrides env", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai");
	writePolicyFile(configHome, "off");
	assert.equal(loadUsagePolicy({ gentlePiConfigHome: configHome, env: { GENTLE_PI_USAGE: "on" } }), "off");
});

test("env var applies only when no policy file exists, and only exact on|off", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai");
	assert.equal(loadUsagePolicy({ gentlePiConfigHome: configHome, env: { GENTLE_PI_USAGE: "off" } }), "off");
	for (const invalid of ["1", "true", "ON", "yes", ""]) {
		assert.equal(
			loadUsagePolicy({ gentlePiConfigHome: configHome, env: { GENTLE_PI_USAGE: invalid } }),
			"on",
			`env value "${invalid}" is ignored, so the built-in default on decides`,
		);
	}
});

test("a malformed global file fails closed to off instead of falling through to env", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai");
	mkdirSync(configHome, { recursive: true });
	writeFileSync(join(configHome, USAGE_POLICY_FILE), "{malformed");
	assert.equal(loadUsagePolicy({ gentlePiConfigHome: configHome, env: { GENTLE_PI_USAGE: "on" } }), "off");
});

// --- resolver attribution ---------------------------------------------------

test("the resolver attributes the global file when it decides", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai");
	writePolicyFile(configHome, "off");
	const resolution = resolveUsagePolicy({ gentlePiConfigHome: configHome, env: EMPTY_ENV });
	assert.deepEqual(resolution, {
		policy: "off",
		source: "global_file",
		malformed: false,
		globalFile: join(configHome, USAGE_POLICY_FILE),
		globalFileExists: true,
		envValue: undefined,
	});
});

test("the resolver attributes the environment variable when no file exists", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai");
	const resolution = resolveUsagePolicy({ gentlePiConfigHome: configHome, env: { GENTLE_PI_USAGE: "off" } });
	assert.equal(resolution.source, "environment");
	assert.equal(resolution.policy, "off");
	assert.equal(resolution.globalFileExists, false);
});

test("the resolver attributes the built-in default when nothing else decides", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai");
	const resolution = resolveUsagePolicy({ gentlePiConfigHome: configHome, env: EMPTY_ENV });
	assert.equal(resolution.source, "default");
	assert.equal(resolution.policy, "on");
	assert.equal(resolution.malformed, false);
});

test("the resolver attributes a malformed global file to that file and does not fall through", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai");
	mkdirSync(configHome, { recursive: true });
	writeFileSync(join(configHome, USAGE_POLICY_FILE), "{malformed");
	const resolution = resolveUsagePolicy({ gentlePiConfigHome: configHome, env: { GENTLE_PI_USAGE: "on" } });
	assert.equal(resolution.source, "global_file");
	assert.equal(resolution.policy, "off");
	assert.equal(resolution.malformed, true);
});

test("loadUsagePolicy delegates to the resolver so the two can never disagree", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai");
	writePolicyFile(configHome, "off");
	assert.equal(
		loadUsagePolicy({ gentlePiConfigHome: configHome, env: EMPTY_ENV }),
		resolveUsagePolicy({ gentlePiConfigHome: configHome, env: EMPTY_ENV }).policy,
	);
});

// --- writer -----------------------------------------------------------------

test("writeUsagePolicy writes the strict v1 shape to the global file, creating the config home", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai", "nested");
	const path = writeUsagePolicy("off", { gentlePiConfigHome: configHome });
	assert.equal(path, join(configHome, USAGE_POLICY_FILE));
	assert.equal(loadUsagePolicy({ gentlePiConfigHome: configHome, env: EMPTY_ENV }), "off");
});

test("writeUsagePolicy(on) round-trips through the resolver", () => {
	const configHome = join(makeScratch("gp-usage-home-"), "gentle-ai");
	writeUsagePolicy("off", { gentlePiConfigHome: configHome });
	writeUsagePolicy("on", { gentlePiConfigHome: configHome });
	const resolution = resolveUsagePolicy({ gentlePiConfigHome: configHome, env: EMPTY_ENV });
	assert.equal(resolution.policy, "on");
	assert.equal(resolution.source, "global_file");
	assert.equal(resolution.malformed, false);
});
