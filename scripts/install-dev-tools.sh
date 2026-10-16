#!/usr/bin/env bash
set -euo pipefail
# Installs only a verified development linter outside the checkout.
version=1.7.12
case "$(uname -m)" in x86_64) arch=amd64;; aarch64|arm64) arch=arm64;; *) echo 'Unsupported architecture'; exit 1;; esac
[[ "$(uname -s)" == Linux ]] || { echo 'Linux required'; exit 1; }
base="${WMS_TOOLS_DIR:-/workspace/.wms-tools}"
mkdir -p "$base"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
asset="actionlint_${version}_linux_${arch}.tar.gz"
url="https://github.com/rhysd/actionlint/releases/download/v${version}"
curl --fail --silent --show-error --location "$url/$asset" -o "$tmp/$asset"
curl --fail --silent --show-error --location "$url/actionlint_${version}_checksums.txt" -o "$tmp/checksums.txt"
(cd "$tmp"; grep -E "^[a-f0-9]{64}  ${asset}$" checksums.txt > selected.sha256; test -s selected.sha256; sha256sum --check selected.sha256)
tar -xzf "$tmp/$asset" -C "$tmp" actionlint
install -m 755 "$tmp/actionlint" "$base/actionlint"
"$base/actionlint" -version
