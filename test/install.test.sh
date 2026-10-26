#!/bin/sh
# install + doctor against stub tools in a throwaway HOME. No network, no sudo.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
fails=0
pass() { echo "ok   $1"; }
fail() { echo "FAIL $1"; fails=$((fails + 1)); }

TMP=$(mktemp -d)
trap 'rm -r "$TMP"' EXIT

# A PATH holding only the base utilities install needs, so a test controls
# exactly which of mise/node/chezmoi/curl exist.
base_bin() {
  d="$1"; mkdir -p "$d"
  for u in sh dirname readlink mkdir ln cat head printf env uname tr chmod; do
    p=$(command -v "$u") && ln -sf "$p" "$d/$u"
  done
}
stub() { # stub <dir> <name> <version>
  printf '#!/bin/sh\necho "%s"\n' "$3" > "$1/$2"; chmod +x "$1/$2"
}

# 1. mise, node, chezmoi all present: install links basher, doctor exits 0.
H="$TMP/h1"; B="$TMP/b1"; mkdir -p "$H"; base_bin "$B"
stub "$B" mise "2026.1.0 linux-x64"; stub "$B" node "v22.0.0"; stub "$B" chezmoi "chezmoi version v2.72.1"
out=$(HOME="$H" PATH="$B" "$ROOT/install" 2>&1); rc=$?
[ $rc -eq 0 ] && pass "install exits 0 when all tools present" || fail "install rc=$rc: $out"
for t in mise node chezmoi; do
  if echo "$out" | grep -q "^$t  *[^ ]" && ! echo "$out" | grep -q "^$t  *MISSING"; then
    pass "doctor reports $t present"
  else
    fail "doctor did not report $t present: $out"
  fi
done
[ -L "$H/.local/bin/basher" ] && pass "basher linked into ~/.local/bin" || fail "basher not linked"

# 2. chezmoi missing, mise provides it: install fills the gap through mise.
H="$TMP/h2"; B="$TMP/b2"; mkdir -p "$H"; base_bin "$B"
stub "$B" node "v22.0.0"
cat > "$B/mise" <<'M'
#!/bin/sh
case "$1" in
  --version) echo "2026.1.0 linux-x64" ;;
  use) tool=${3%@*}; printf '#!/bin/sh\necho "%s 1.0"\n' "$tool" > "$HOME/.local/bin/$tool"; chmod +x "$HOME/.local/bin/$tool" ;;
  reshim) : ;;
esac
M
chmod +x "$B/mise"
out=$(HOME="$H" PATH="$B" "$ROOT/install" 2>&1); rc=$?
if [ $rc -eq 0 ] && echo "$out" | grep -q "^chezmoi  *chezmoi 1.0"; then
  pass "missing chezmoi installed through mise"
else
  fail "chezmoi via mise: rc=$rc $out"
fi

# 3. falsifiability: no mise and no curl/wget -> names the sudo step, non-zero, links nothing.
H="$TMP/h3"; B="$TMP/b3"; mkdir -p "$H"; base_bin "$B"
stub "$B" apt-get "x"
out=$(HOME="$H" PATH="$B" "$ROOT/install" 2>&1); rc=$?
if [ $rc -ne 0 ] && echo "$out" | grep -q "sudo apt-get install -y curl"; then
  pass "no downloader: names the sudo step and stops"
else
  fail "sudo step: rc=$rc $out"
fi
[ ! -e "$H/.local/bin/basher" ] && pass "nothing linked after refused install" || fail "linked despite refusal"

# 4. falsifiability: doctor with nothing installed prints MISSING three times and exits non-zero.
H="$TMP/h4"; B="$TMP/b4"; mkdir -p "$H"; base_bin "$B"
out=$(HOME="$H" PATH="$B" "$ROOT/bin/basher" doctor 2>&1); rc=$?
if [ $rc -ne 0 ] && [ "$(echo "$out" | grep -c MISSING)" -eq 3 ]; then
  pass "doctor reports MISSING for all three and exits non-zero"
else
  fail "doctor on empty box: rc=$rc $out"
fi

[ "$fails" -eq 0 ]
