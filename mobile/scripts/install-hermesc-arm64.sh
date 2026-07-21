#!/usr/bin/env bash
set -euo pipefail

readonly HERMES_COMMIT="7f9a871eefeb2c3852365ee80f0b6733ec12ac3b"
readonly HERMES_TREE_SHA1="28a5c9aac4e67850a428724db6faad9f7aed27bf"
readonly HERMES_ARCHIVE_SHA256="5e5de1a86e02c8f839dbb3c6fcf65f06a62650f9c4dec2f9078ce904daf85ddd"
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
  --build-arg "HERMES_TREE_SHA1=${HERMES_TREE_SHA1}" \
  --build-arg "HERMES_ARCHIVE_SHA256=${HERMES_ARCHIVE_SHA256}" \
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
readonly CANDIDATE="${tmp_dir}/hermesc"

version_output="$("${CANDIDATE}" -version 2>&1)"
grep -Fq "Hermes release version: ${HERMES_RELEASE_VERSION}" <<<"${version_output}" || {
  echo "Built hermesc does not report Hermes ${HERMES_RELEASE_VERSION}." >&2
  exit 1
}
grep -Fq "HBC bytecode version: ${HERMES_BYTECODE_VERSION}" <<<"${version_output}" || {
  echo "Built hermesc does not report HBC ${HERMES_BYTECODE_VERSION}." >&2
  exit 1
}

printf 'globalThis.__yoroiHermesArm64Smoke = 96;\n' >"${tmp_dir}/smoke.js"
"${CANDIDATE}" -O -emit-binary -out "${tmp_dir}/smoke.hbc" "${tmp_dir}/smoke.js"
test -s "${tmp_dir}/smoke.hbc"

# Exercise the optimizer with the same unminified production-sized input that
# React Native's Gradle plugin passes to Hermes. A one-line smoke program did
# not catch an ARM64 GCC miscompile in InstSimplify.
expo_cli="$(
  cd -- "${MOBILE_DIR}"
  node -e "console.log(require.resolve('@expo/cli', {paths: [require.resolve('expo/package.json')]}))"
)"
entry_file="$(
  cd -- "${MOBILE_DIR}"
  node -e "require('expo/scripts/resolveAppEntry')" "${MOBILE_DIR}" android absolute
)"
mkdir -p "${tmp_dir}/assets"
(
  cd -- "${MOBILE_DIR}"
  EXPO_NO_DOTENV=1 EXPO_PUBLIC_BUILD_VARIANT=DEV node "${expo_cli}" export:embed \
    --platform android \
    --dev false \
    --reset-cache \
    --entry-file "${entry_file}" \
    --bundle-output "${tmp_dir}/release.js" \
    --assets-dest "${tmp_dir}/assets" \
    --sourcemap-output "${tmp_dir}/release.js.map" \
    --minify false
)
"${CANDIDATE}" \
  -w \
  -emit-binary \
  -max-diagnostic-width=80 \
  -out "${tmp_dir}/release.hbc" \
  "${tmp_dir}/release.js" \
  -O \
  -output-source-map
test -s "${tmp_dir}/release.hbc"
test -s "${tmp_dir}/release.hbc.map"
node -e '
  const bytecode = require("node:fs").readFileSync(process.argv[1])
  if (
    bytecode.subarray(0, 8).toString("hex") !== "c61fbc03c103191f" ||
    bytecode.readUInt32LE(8) !== Number(process.argv[2])
  ) {
    throw new Error("hermesc did not generate the expected HBC bytecode")
  }
' "${tmp_dir}/smoke.hbc" "${HERMES_BYTECODE_VERSION}"
node -e '
  const bytecode = require("node:fs").readFileSync(process.argv[1])
  if (
    bytecode.subarray(0, 8).toString("hex") !== "c61fbc03c103191f" ||
    bytecode.readUInt32LE(8) !== Number(process.argv[2])
  ) {
    throw new Error("hermesc did not generate the expected release HBC bytecode")
  }
' "${tmp_dir}/release.hbc" "${HERMES_BYTECODE_VERSION}"

# Do not replace React Native's active compiler until every validation has
# passed. Keep a backup for the final architecture preflight so an unexpected
# install/copy failure cannot leave a compiler that this installer rejected.
mkdir -p "$(dirname -- "${TARGET}")"
previous_target="${tmp_dir}/hermesc.previous"
target_existed=false
if [[ -e "${TARGET}" ]]; then
  cp -p -- "${TARGET}" "${previous_target}"
  target_existed=true
fi
install -m 0755 "${CANDIDATE}" "${TARGET}.new"
mv -f "${TARGET}.new" "${TARGET}"

if ! npm run check:hermesc; then
  if [[ "${target_existed}" == true ]]; then
    install -m 0755 "${previous_target}" "${TARGET}.new"
    mv -f "${TARGET}.new" "${TARGET}"
  else
    rm -f -- "${TARGET}"
  fi
  exit 1
fi

echo "Installed native Hermes ${HERMES_RELEASE_VERSION} (HBC ${HERMES_BYTECODE_VERSION}) at ${TARGET}."
echo "Generated smoke and production-sized ARM64 Hermes bytecode successfully."
