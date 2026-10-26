// lug: basher-v2-engine-skeleton-installs-its-tools-and-prints-a-fingerprint
//
// Fingerprint against recorded fixtures (two real Omarchy machines measured
// 2026-10-20, MACs replaced with documentation-range addresses), plus the
// falsifiability case: an unreadable DMI directory yields null, never a value.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "src", "cli.js");
const fixtures = path.join(here, "fixtures");
const desktop = path.join(fixtures, "omarchy-two-gpu-desktop");
const thin = path.join(fixtures, "omarchy-one-gpu-thin-client");

function runCli(env) {
  return spawnSync(process.execPath, [cli, "fingerprint"], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL ${name}\n${e.message}`);
  }
}

for (const name of fs.readdirSync(fixtures)) {
  const dir = path.join(fixtures, name);
  const expected = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8"));
  check(`fixture ${name} matches expected fingerprint`, () => {
    const r = runCli({ BASHER_FIXTURE_DIR: dir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    assert.deepEqual(JSON.parse(r.stdout), expected);
  });
}

check("two-GPU desktop reports board B450 Pro4 and two GPUs", () => {
  const fp = JSON.parse(runCli({ BASHER_FIXTURE_DIR: desktop }).stdout);
  assert.equal(fp.dmi_board, "B450 Pro4");
  assert.equal(fp.gpus.length, 2);
});

check("thin client reports board 02D0WN and one Intel GPU", () => {
  const fp = JSON.parse(runCli({ BASHER_FIXTURE_DIR: thin }).stdout);
  assert.equal(fp.dmi_board, "02D0WN");
  assert.equal(fp.gpus.length, 1);
  assert.match(fp.gpus[0], /^Intel/);
});

check("missing DMI directory: dmi_board null, exit 0, warning", () => {
  const r = runCli({
    BASHER_FIXTURE_DIR: desktop,
    BASHER_DMI_DIR: path.join(os.tmpdir(), "basher-no-such-dmi-dir"),
  });
  assert.equal(r.status, 0);
  const fp = JSON.parse(r.stdout);
  assert.equal(fp.dmi_board, null);
  assert.equal(fp.dmi_product, null);
  assert.match(r.stderr, /warning: dmi board_name unreadable/);
});

check("present but unreadable DMI files: dmi_board null, exit 0, warning", () => {
  if (process.getuid && process.getuid() === 0) return; // root reads everything
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basher-dmi-"));
  try {
    for (const f of ["board_name", "product_name"]) {
      fs.writeFileSync(path.join(dir, f), "SHOULD NOT APPEAR\n", { mode: 0o000 });
    }
    const r = runCli({ BASHER_FIXTURE_DIR: desktop, BASHER_DMI_DIR: dir });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).dmi_board, null);
    assert.doesNotMatch(r.stdout, /SHOULD NOT APPEAR/);
    assert.match(r.stderr, /warning/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

check("live run on this machine exits 0 and prints the full key set", () => {
  const r = runCli({ BASHER_FIXTURE_DIR: "", BASHER_DMI_DIR: "" });
  assert.equal(r.status, 0, r.stderr);
  const fp = JSON.parse(r.stdout);
  for (const k of ["dmi_board", "dmi_product", "macs", "gpus", "cpu", "os", "boot_target"]) {
    assert.ok(k in fp, `missing key ${k}`);
  }
  assert.ok(Array.isArray(fp.macs) && Array.isArray(fp.gpus));
});

process.exit(failed ? 1 : 0);
