#!/usr/bin/env bash
set -euo pipefail

: "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required}"
version="$(node -p 'require("./apps/desktop/package.json").version')"
release_dir="$(pwd)/release/github-${version}"
dmg="$release_dir/Jarvis-${version}-macos-arm64.dmg"
zip="$release_dir/Jarvis-${version}-macos-arm64.zip"

verify_app() {
  local app="$1"
  local signature
  test -d "$app"
  test "$(lipo -archs "$app/Contents/MacOS/Jarvis")" = arm64
  test "$(plutil -extract CFBundleShortVersionString raw "$app/Contents/Info.plist")" = "$version"
  test "$(plutil -extract CFBundleIdentifier raw "$app/Contents/Info.plist")" = ai.qianyuzhao.jarvis
  codesign --verify --deep --strict --verbose=2 "$app"
  signature="$(codesign --display --verbose=4 "$app" 2>&1)"
  grep -Fq 'Authority=Developer ID Application:' <<< "$signature"
  grep -Fxq "TeamIdentifier=$APPLE_TEAM_ID" <<< "$signature"
  grep -Eq 'flags=.*\(.*runtime' <<< "$signature"
  xcrun stapler validate "$app"
  spctl --assess --type execute --verbose=4 "$app"
}

verify_app "$release_dir/mac-arm64/Jarvis.app"
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
