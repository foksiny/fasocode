#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  cat <<'EOF'
Usage: ./build.sh [target] [bundles]

target:
  linux    Build Linux bundles (deb + appimage by default)
  windows  Build Windows bundles (run this on Windows; or use build.ps1)
  auto     Detect the host OS (default)

bundles: comma-separated list passed to --bundles
         linux:   deb,appimage,rpm
         windows: nsis,msi

Examples:
  ./build.sh                 # build for the host OS
  ./build.sh linux           # deb + appimage
  ./build.sh linux rpm       # rpm only
  ./build.sh windows         # nsis (Windows host)
EOF
  exit 1
}

TARGET="${1:-auto}"
BUNDLES="${2:-}"

case "$TARGET" in
  auto)
    case "$(uname -s)" in
      Linux) TARGET=linux ;;
      MINGW*|MSYS*|CYGWIN*) TARGET=windows ;;
      *) echo "Unsupported host OS: $(uname -s)" >&2; exit 1 ;;
    esac
    ;;
  linux|windows) ;;
  -h|--help) usage ;;
  *) usage ;;
esac

HOST="$(uname -s)"
if [ "$TARGET" = "windows" ] && [ "$HOST" = "Linux" ]; then
  echo "error: Tauri does not support cross-compiling Windows bundles from Linux." >&2
  echo "Run ./build.sh on a Windows machine (Git Bash) or use build.ps1." >&2
  exit 1
fi

for cmd in node npm npx cargo; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: '$cmd' not found in PATH" >&2; exit 1; }
done

if [ "$TARGET" = "linux" ]; then
  for lib in webkit2gtk-4.1 libappindicator3; do
    pkg-config --exists "$lib" 2>/dev/null || \
      echo "warning: '$lib' not found - Linux build may fail. Install the Tauri Linux prerequisites." >&2
  done
fi

[ -d node_modules ] || npm install

case "$TARGET" in
  linux)
    echo "==> Building Linux bundles: ${BUNDLES:-deb,appimage}"
    npx tauri build --bundles "${BUNDLES:-deb,appimage}"
    echo
    echo "Artifacts:"
    ls -lh src-tauri/target/release/bundle/
    ;;
  windows)
    echo "==> Building Windows bundles: ${BUNDLES:-nsis}"
    npx tauri build --bundles "${BUNDLES:-nsis}"
    echo
    echo "Artifacts:"
    ls -lh src-tauri/target/release/bundle/
    ;;
esac
