#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/apple-network-retry.sh"

: "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required}"
arch="${1:-arm64}"
case "$arch" in
  arm64) app_directory=mac-arm64; binary_arch=arm64 ;;
  x64) app_directory=mac; binary_arch=x86_64 ;;
  *) echo "Unsupported macOS architecture: $arch" >&2; exit 1 ;;
esac
version="$(node -p 'require("./apps/desktop/package.json").version')"
release_dir="$(pwd)/release/github-${version}"
dmg="$release_dir/Jarvis-${version}-macos-${arch}.dmg"
zip="$release_dir/Jarvis-${version}-macos-${arch}.zip"

verify_app() {
  local app="$1"
  local signature
  test -d "$app"
  test "$(lipo -archs "$app/Contents/MacOS/Jarvis")" = "$binary_arch"
  test "$(plutil -extract CFBundleShortVersionString raw "$app/Contents/Info.plist")" = "$version"
  test "$(plutil -extract CFBundleIdentifier raw "$app/Contents/Info.plist")" = ai.qianyuzhao.jarvis
  test "$(plutil -extract LSMinimumSystemVersion raw "$app/Contents/Info.plist")" = "${MACOS_MINIMUM_VERSION:-13.0}"
  codesign --verify --deep --strict --verbose=2 "$app"
  signature="$(codesign --display --verbose=4 "$app" 2>&1)"
  grep -Fq 'Authority=Developer ID Application:' <<< "$signature"
  grep -Fxq "TeamIdentifier=$APPLE_TEAM_ID" <<< "$signature"
  grep -Eq 'flags=.*\(.*runtime' <<< "$signature"
  retry_apple_network xcrun stapler validate "$app"
  retry_apple_network spctl --assess --type execute --verbose=4 "$app"
}

verify_app "$release_dir/$app_directory/Jarvis.app"
test -s "$dmg"
test -s "$zip"
hdiutil verify "$dmg"
unzip -tqq "$zip"

inspection_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/jarvis-release-check.XXXXXX")"
ditto -x -k "$zip" "$inspection_dir/zip"
verify_app "$inspection_dir/zip/Jarvis.app"

mkdir "$inspection_dir/dmg"
hdiutil attach "$dmg" -readonly -nobrowse -mountpoint "$inspection_dir/dmg"
trap 'hdiutil detach "$inspection_dir/dmg"' EXIT
verify_app "$inspection_dir/dmg/Jarvis.app"
hdiutil detach "$inspection_dir/dmg"
trap - EXIT
