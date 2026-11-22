#!/bin/sh
# Writes manifest.json: a short content hash for every game file. index.html reads it (never cached) and
# loads each file as "file?h=<hash>", so after an update the browser fetches exactly the changed files
# and never mixes old and new ones. Runs automatically from the git pre-commit hook (tools/install-hooks.sh).
cd "$(dirname "$0")/.." || exit 1
{
  printf '{\n  "files": {\n'
  first=1
  for f in $(git ls-files --cached --others --exclude-standard -- 'js/*.js' 'js/**/*.js' 'css/*.css' | sort -u); do
    [ -f "$f" ] || continue
    h=$(git hash-object "$f" | cut -c1-10)
    [ $first -eq 1 ] || printf ',\n'
    printf '    "%s": "%s"' "$f" "$h"
    first=0
  done
  printf '\n  }\n}\n'
} > manifest.json
