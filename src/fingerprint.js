// Machine fingerprint: what identifies this box across a reinstall.
//
// /etc/machine-id changes on reinstall, so it is deliberately not used. The
// fingerprint is the DMI board and product, the set of physical MAC addresses,
// the GPUs and the CPU. Every source is read through an injectable reader so a
// recorded fixture can stand in for the live machine.
import fs from "node:fs";
import path from "node:path";

const VIRTUAL_IFACE = /^(lo|docker|br-|veth|virbr|vnet|tun|tap|wg|zt|tailscale|dummy|bond|vmnet)/;
const GPU_CLASS = /(VGA compatible controller|3D controller|Display controller)/;

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function readDmi(dmiDir, warnings) {
  const field = (name) => {
    const raw = readText(path.join(dmiDir, name));
    const value = raw == null ? "" : raw.trim();
    if (!value) {
      warnings.push(`dmi ${name} unreadable under ${dmiDir}`);
      return null;
    }
    return value;
  };
  return { dmi_board: field("board_name"), dmi_product: field("product_name") };
}

// `ip -o link` text -> sorted unique physical MAC addresses. A wifi adapter
// that reports a locally-administered random address also reports its
// permaddr; the permaddr is the identity. Anything still locally administered
// after that is a software interface and is dropped.
export function parseMacs(ipLinkText) {
  const macs = new Set();
  for (const line of String(ipLinkText || "").split("\n")) {
    const m = line.match(/^\d+:\s+([^:@\s]+)(?:@\S+)?:.*?link\/(\S+)\s+([0-9a-f:]{17})(?:.*?permaddr\s+([0-9a-f:]{17}))?/i);
    if (!m) continue;
    const [, iface, type, addr, perm] = m;
    if (type !== "ether" || VIRTUAL_IFACE.test(iface)) continue;
    const mac = (perm || addr).toLowerCase();
    if (parseInt(mac.slice(0, 2), 16) & 0x02) continue;
    macs.add(mac);
  }
  return [...macs].sort();
}

// `lspci` text -> GPU descriptions, bus id and revision stripped.
export function parseGpus(lspciText) {
  const gpus = [];
  for (const line of String(lspciText || "").split("\n")) {
    const m = line.match(/^\S+\s+(.*)$/);
    if (!m || !GPU_CLASS.test(m[1])) continue;
    gpus.push(m[1].replace(GPU_CLASS, "").replace(/^\s*:\s*/, "").replace(/\s*\(rev [0-9a-f]+\)\s*$/i, "").trim());
  }
  return gpus.sort();
}

export function parseCpu(cpuinfoText) {
  const m = String(cpuinfoText || "").match(/^model name\s*:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

export function parseOsRelease(text) {
  const out = {};
  for (const line of String(text || "").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return { os: out.ID || null, os_version: out.VERSION_ID || null };
}

// sources: { dmiDir, ipLink, lspci, cpuinfo, osRelease, bootTarget } -- each a
// string of the file/command output, or null/undefined when unavailable.
export function collectFingerprint(sources) {
  const warnings = [];
  const dmi = readDmi(sources.dmiDir, warnings);
  const need = (value, what) => {
    if (value == null) warnings.push(`${what} unavailable`);
    return value;
  };
  const fingerprint = {
    ...dmi,
    macs: parseMacs(need(sources.ipLink, "ip link")),
    gpus: parseGpus(need(sources.lspci, "lspci")),
    cpu: parseCpu(need(sources.cpuinfo, "cpuinfo")),
    ...parseOsRelease(need(sources.osRelease, "os-release")),
    boot_target: sources.bootTarget ? String(sources.bootTarget).trim() || null : null,
  };
  return { fingerprint, warnings };
}
