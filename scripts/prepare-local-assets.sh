#!/bin/sh
# Run from a clone hook or by hand after cloning. Never download without consent.
set -u

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd) || exit 1
mkdir -p "$root/_3p" || exit 1
if [ -e "$root/_3p/.setup-prompted" ]; then exit 0; fi
if ! ( : </dev/tty ) 2>/dev/null; then
  printf '%s\n' 'Asset setup skipped: no interactive terminal. Run sh scripts/prepare-local-assets.sh later.'
  exit 0
fi

printf '%s' 'Download the verified RA2 installer from archive.org and prepare local assets now? [y/N] ' >/dev/tty
IFS= read -r answer </dev/tty || exit 0
case "$answer" in
  y|Y|yes|YES)
    cd "$root" || exit 1
    npm ci && npm run assets:setup || {
      printf '%s\n' 'Asset setup failed. Run sh scripts/prepare-local-assets.sh to retry.' >&2
      exit 0
    }
    : > "$root/_3p/.setup-prompted"
    ;;
  *) : > "$root/_3p/.setup-prompted" ;;
esac
