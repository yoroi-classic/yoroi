#!/usr/bin/env bash
set -euo pipefail

readonly HERMES_COMMIT="7f9a871eefeb2c3852365ee80f0b6733ec12ac3b"
readonly HERMES_SOURCE_SHA256="439d47add0d646b632a61b6b48515314be459c01e6c14bcab5e7e29223f420c2"
readonly HERMES_RELEASE_VERSION="0.12.0"
readonly HERMES_BYTECODE_VERSION="96"
readonly RN_HERMES_VERSION="hermes-2025-06-04-RNv0.79.3-${HERMES_COMMIT}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
MOBILE_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly MOBILE_DIR
readonly DOCKERFILE="${SCRIPT_DIR}/hermesc-arm64.Dockerfile"
readonly IMAGE="yoroi-hermesc-arm64:${HERMES_COMMIT}"
readonly TARGET="${MOBILE_DIR}/node_modules/react-native/sdks/hermes/build/bin/hermesc"
readonly RN_HERMES_VERSION_FILE="${MOBILE_DIR}/node_modules/react-native/sdks/.hermesversion"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "aarch64" ]]; then
  echo "The native Hermes installer requires an ARM64 Linux host." >&2
  exit 1
fi

if [[ ! -d "${MOBILE_DIR}/node_modules/react-native" ]]; then
  echo "React Native is not installed; run npm ci before npm run install:hermesc:arm64." >&2
  exit 1
fi

if [[ ! -f "${RN_HERMES_VERSION_FILE}" ]] ||
  [[ "$(tr -d '\r\n' <"${RN_HERMES_VERSION_FILE}")" != "${RN_HERMES_VERSION}" ]]; then
  echo "Installed React Native does not pin ${RN_HERMES_VERSION}." >&2
  echo "Update the pinned Hermes commit, checksum, release, and HBC version before using this installer with a newer React Native." >&2
  exit 1
fi

command -v docker >/dev/null || {
  echo "Docker is required to build the pinned Hermes source." >&2
  exit 1
}

docker build \
  --platform linux/arm64 \
  --file "${DOCKERFILE}" \
  --build-arg "HERMES_COMMIT=${HERMES_COMMIT}" \
  --build-arg "HERMES_SOURCE_SHA256=${HERMES_SOURCE_SHA256}" \
  --tag "${IMAGE}" \
  "${SCRIPT_DIR}"

container="$(docker create --platform linux/arm64 "${IMAGE}")"
tmp_dir="$(mktemp -d)"
cleanup() {
  docker rm --force "${container}" >/dev/null 2>&1 || true
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

docker cp "${container}:/hermesc" "${tmp_dir}/hermesc"
chmod 0755 "${tmp_dir}/hermesc"

version_output="$("${tmp_dir}/hermesc" -version 2>&1)"
grep -Fq "Hermes release version: ${HERMES_RELEASE_VERSION}" <<<"${version_output}" || {
  echo "Built hermesc does not report Hermes ${HERMES_RELEASE_VERSION}." >&2
  exit 1
}
grep -Fq "HBC bytecode version: ${HERMES_BYTECODE_VERSION}" <<<"${version_output}" || {
  echo "Built hermesc does not report HBC ${HERMES_BYTECODE_VERSION}." >&2
  exit 1
}

mkdir -p "$(dirname -- "${TARGET}")"
install -m 0755 "${tmp_dir}/hermesc" "${TARGET}.new"
mv -f "${TARGET}.new" "${TARGET}"

npm run check:hermesc
printf 'globalThis.__yoroiHermesArm64Smoke = 96;\n' >"${tmp_dir}/smoke.js"
"${TARGET}" -O -emit-binary -out "${tmp_dir}/smoke.hbc" "${tmp_dir}/smoke.js"
test -s "${tmp_dir}/smoke.hbc"
node -e '
  const bytecode = require("node:fs").readFileSync(process.argv[1])
  if (
    bytecode.subarray(0, 8).toString("hex") !== "c61fbc03c103191f" ||
    bytecode.readUInt32LE(8) !== Number(process.argv[2])
  ) {
    throw new Error("hermesc did not generate the expected HBC bytecode")
  }
' "${tmp_dir}/smoke.hbc" "${HERMES_BYTECODE_VERSION}"

echo "Installed native Hermes ${HERMES_RELEASE_VERSION} (HBC ${HERMES_BYTECODE_VERSION}) at ${TARGET}."
echo "Generated ARM64 Hermes bytecode successfully."
