#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly DOCKERFILE="${SCRIPT_DIR}/hermesc-arm64.Dockerfile"
readonly INSTALLER="${SCRIPT_DIR}/install-hermesc-arm64.sh"

docker_arg() {
  sed -n "s/^ARG $1=//p" "${DOCKERFILE}"
}

installer_pin() {
  sed -n "s/^readonly $1=\"\(.*\)\"$/\1/p" "${INSTALLER}"
}

for name in HERMES_COMMIT HERMES_TREE_SHA1 HERMES_ARCHIVE_SHA256; do
  docker_value="$(docker_arg "${name}")"
  installer_value="$(installer_pin "${name}")"
  [[ -n "${docker_value}" && "${docker_value}" == "${installer_value}" ]] || {
    echo "${name} must be set identically in the Dockerfile and installer." >&2
    exit 1
  }
done

[[ "$(docker_arg HERMES_COMMIT)" =~ ^[0-9a-f]{40}$ ]]
[[ "$(docker_arg HERMES_TREE_SHA1)" =~ ^[0-9a-f]{40}$ ]]
[[ "$(docker_arg HERMES_ARCHIVE_SHA256)" =~ ^[0-9a-f]{64}$ ]]
[[ "$(docker_arg DEBIAN_SNAPSHOT)" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]

grep -Eq '^FROM debian:bookworm-slim@sha256:[0-9a-f]{64} AS build$' "${DOCKERFILE}"
grep -Fq "snapshot.debian.org/archive/debian/\${DEBIAN_SNAPSHOT}" "${DOCKERFILE}"
grep -Fq "snapshot.debian.org/archive/debian-security/\${DEBIAN_SNAPSHOT}" "${DOCKERFILE}"

for package in build-essential ca-certificates clang-14 cmake git libicu-dev ninja-build python3; do
  grep -Eq "^[[:space:]]+${package}=[^[:space:]\\\\]+[[:space:]]*\\\\$" "${DOCKERFILE}" || {
    echo "${package} must have an exact version in the ARM64 build image." >&2
    exit 1
  }
done

if grep -Fq 'github.com/facebook/hermes/archive/' "${DOCKERFILE}"; then
  echo "GitHub-generated source archives are not byte-stable build inputs." >&2
  exit 1
fi

grep -Fq "rev-parse FETCH_HEAD)\" = \"\${HERMES_COMMIT}" "${DOCKERFILE}"
grep -Fq "rev-parse 'FETCH_HEAD^{tree}')\" = \"\${HERMES_TREE_SHA1}" "${DOCKERFILE}"
grep -Fq 'git -C source-repo archive --format=tar FETCH_HEAD' "${DOCKERFILE}"
grep -Fq "\${HERMES_ARCHIVE_SHA256}  source.tar" "${DOCKERFILE}"
grep -Fq '! readelf --program-headers build/bin/hermesc | grep --quiet INTERP' "${DOCKERFILE}"

echo "ARM64 Hermes build inputs are pinned and fail closed."
