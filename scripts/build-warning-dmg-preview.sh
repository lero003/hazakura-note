#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This warning-expected DMG preview script must be run on macOS." >&2
  exit 1
fi

require_command node
require_command npm
require_command hdiutil
require_command shasum

version="$(node -p "require('./package.json').version")"
machine_arch="$(uname -m)"
case "$machine_arch" in
  arm64)
    arch="aarch64"
    ;;
  x86_64)
    arch="x64"
    ;;
  *)
    arch="$machine_arch"
    ;;
esac
product_name="hazakura-note"
app_path="src-tauri/target/release/bundle/macos/${product_name}.app"
dmg_dir="src-tauri/target/release/bundle/dmg"
dmg_path="${dmg_dir}/${product_name}_${version}_${arch}-warning-expected.dmg"
checksum_path="${dmg_path}.sha256"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  npm run build
fi

if [[ ! -d "$app_path" ]]; then
  echo "Missing built app: $app_path" >&2
  echo "Run npm run build before setting SKIP_BUILD=1." >&2
  exit 1
fi

mkdir -p "$dmg_dir"
staging_root="$(mktemp -d "${dmg_dir}/${product_name}-dmg-root.XXXXXX")"
cleanup() {
  rm -rf "$staging_root"
}
trap cleanup EXIT

cp -a "$app_path" "$staging_root/"
ln -s /Applications "$staging_root/Applications"

hdiutil create \
  -volname "${product_name} ${version}" \
  -srcfolder "$staging_root" \
  -ov \
  -format UDZO \
  "$dmg_path"

hdiutil verify "$dmg_path"
(
  cd "$dmg_dir"
  dmg_name="$(basename "$dmg_path")"
  checksum_name="$(basename "$checksum_path")"
  shasum -a 256 "$dmg_name" > "$checksum_name"
  shasum -c "$checksum_name"
)

echo "DMG: $dmg_path"
echo "SHA256: $(awk '{print $1}' "$checksum_path")"
echo "Checksum file: $checksum_path"
