// basher engine entry. `bin/basher` dispatches here for the verbs that need
// node; `doctor` stays in shell so it can report node itself as MISSING.
//
// Live sources by default. BASHER_FIXTURE_DIR points every source at a
// recorded fixture directory; BASHER_DMI_DIR overrides only the DMI directory.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { collectFingerprint } from "./fingerprint.js";

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function fixtureText(dir, name) {
  try {
    return fs.readFileSync(path.join(dir, name), "utf8");
  } catch {
    return null;
  }
}

export function gatherSources(env = process.env) {
  const fx = env.BASHER_FIXTURE_DIR;
  if (fx) {
    return {
      dmiDir: env.BASHER_DMI_DIR || path.join(fx, "dmi"),
      ipLink: fixtureText(fx, "ip-link.txt"),
      lspci: fixtureText(fx, "lspci.txt"),
      cpuinfo: fixtureText(fx, "cpuinfo"),
      osRelease: fixtureText(fx, "os-release"),
      bootTarget: fixtureText(fx, "boot-target"),
    };
  }
  return {
    dmiDir: env.BASHER_DMI_DIR || "/sys/class/dmi/id",
    ipLink: run("ip", ["-o", "link"]),
    lspci: run("lspci", []),
    cpuinfo: fixtureText("/proc", "cpuinfo"),
    osRelease: fixtureText("/etc", "os-release"),
    bootTarget: run("systemctl", ["get-default"]),
  };
}

function fingerprintVerb() {
  const { fingerprint, warnings } = collectFingerprint(gatherSources());
  for (const w of warnings) process.stderr.write(`basher: warning: ${w}\n`);
  process.stdout.write(`${JSON.stringify(fingerprint, null, 2)}\n`);
  return 0;
}

const VERBS = { fingerprint: fingerprintVerb };

export function main(argv) {
  const verb = argv[0];
  if (!verb || !VERBS[verb]) {
    process.stderr.write(`usage: basher <fingerprint|doctor>\n`);
    return verb ? 2 : 0;
  }
  return VERBS[verb](argv.slice(1));
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
