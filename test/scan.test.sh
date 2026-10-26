#!/bin/sh
# The engine's own secret/personal scan over every tracked or to-be-tracked
# file, fixtures included. Flags credential shapes, private keys, absolute home
# paths, and any MAC address outside the documentation range 00:00:5e:00:53:xx
# (fixtures may spoof the first octet of that range, as a random wifi address does).
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 2
files=$(git ls-files --cached --others --exclude-standard | grep -v '^test/scan.test.sh$')
bad=0
hit() { echo "SCAN HIT ($1):"; echo "$2"; bad=1; }

r=$(echo "$files" | xargs grep -nEI 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|xox[bap]-[A-Za-z0-9-]{10,}|ops_[A-Za-z0-9]{30,}') && hit "token shape" "$r"
r=$(echo "$files" | xargs grep -nEI -e '-----BEGIN [A-Z ]*PRIVATE KEY-----') && hit "private key" "$r"
r=$(echo "$files" | xargs grep -nEI '/(home|Users)/[A-Za-z0-9._-]+/') && hit "absolute home path" "$r"
r=$(echo "$files" | xargs grep -nEI '(password|secret|token|api_key)[[:space:]]*[:=][[:space:]]*["'\'']?[A-Za-z0-9/+_-]{12,}') && hit "assigned credential" "$r"
r=$(echo "$files" | xargs grep -noEI '([0-9a-f]{2}:){5}[0-9a-f]{2}' \
  | grep -viE ':(00:00:5e:00:53:[0-9a-f]{2}|[0-9a-f]{2}:00:5e:00:53:[0-9a-f]{2}|00:00:00:00:00:00|ff:ff:ff:ff:ff:ff)$') && hit "MAC address outside the documentation range" "$r"

[ "$bad" -eq 0 ] && echo "ok   scan found nothing"
exit "$bad"
