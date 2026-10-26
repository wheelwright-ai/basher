# basher

A filesystem steward for a fleet of machines. Every machine converges, unattended
and observably, on a layered desired state that is edited once, anywhere. Drift
is judged, not clobbered.

basher does not re-implement the tools that already do the work. It drives
[chezmoi](https://www.chezmoi.io) (files, templates, secrets reads) and
[mise](https://mise.jdx.dev) (toolchains) as binaries, and adds what neither
carries: a fleet registry, folder contracts, drift judged by convergence, rings
with soak, and receipts.

Status: phase 1a. The engine installs its tools and prints a machine
fingerprint. Registration, keys, and the apply loop are later phases.

## Install

```sh
git clone https://github.com/wheelwright-ai/basher.git
cd basher
./install
```

That is the only manual step. `./install` puts `mise`, `node` (through mise) and
`chezmoi` (through mise, falling back to the upstream installer) in your home
directory, links `basher` into `~/.local/bin`, and ends by running `basher
doctor`. It needs no sudo. If a prerequisite cannot be had without root (a
downloader such as `curl`), it prints the exact command and stops.

## Commands

| Command | What it does |
|---|---|
| `basher doctor` | Lists each required tool (`mise`, `node`, `chezmoi`) with its version, or `MISSING`. Exits non-zero if any is missing. |
| `basher fingerprint` | Prints the machine fingerprint as JSON. |

### Fingerprint

```json
{
  "dmi_board": "B450 Pro4",
  "dmi_product": "To Be Filled By O.E.M.",
  "macs": ["00:00:5e:00:53:01"],
  "gpus": ["NVIDIA Corporation GP104 [GeForce GTX 1070]"],
  "cpu": "AMD Ryzen 7 3800X 8-Core Processor",
  "os": "omarchy",
  "os_version": null,
  "boot_target": "graphical.target"
}
```

`/etc/machine-id` changes on reinstall, so it is not used. Identity comes from
what a reinstall does not change: the DMI board and product
(`/sys/class/dmi/id`), the physical MAC addresses (`ip -o link`, virtual
interfaces dropped, a wifi adapter's permanent address preferred over its
random one), the GPUs (`lspci`), and the CPU (`/proc/cpuinfo`). `os` is the
`ID` from `/etc/os-release`.

When a source is unavailable (no DMI under WSL, no `lspci` in a container) the
field is `null` or `[]`, a warning goes to stderr, and the exit status is 0. A
missing value is reported as missing; it is never invented.

## Engine and config are separate

This repository is the **engine**: logic only. It holds no machine's
configuration, no secrets, and no personal paths. The desired state lives in a
separate **config** repository that you own (private, if you like), which the
engine reads. The engine is public and the same for everyone; the config is
yours.

## Layer model

Desired state is composed from four layers, general to specific, with the more
specific layer winning:

```
global  >  profile  >  role  >  host
```

| Layer | Scope | Example |
|---|---|---|
| `global` | every machine | shell aliases, git config |
| `profile` | a kind of environment | a WSL development box, a desktop |
| `role` | a job a machine does | a tool-specific development setup, a service host |
| `host` | one machine | a monitor layout, a hardware-specific unit |

A machine finds its place through its fingerprint. Matching a fingerprint to a
registry entry is the next phase.

## Tests

```sh
npm test
```

Runs the fingerprint test (against recorded fixtures and the unreadable-DMI
case), the install test (stub tools in a throwaway home, no network), and the
repository's own secret and personal-data scan.

## License

MIT
