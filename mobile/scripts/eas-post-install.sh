#!/usr/bin/env bash
set -euo pipefail

# Inject Firebase production configs if this is a production build
if [[ "${EAS_BUILD_PROFILE:-}" == "production" ]]; then
  echo "Running Firebase config injection for production build..."
  bash ./scripts/eas-firebase-config.sh || {
    echo "ERROR: Firebase config injection failed"
    echo "Production builds require Firebase config secrets. Build cannot continue."
    exit 1
  }
fi

echo "EAS post-install: Android Rust setup/build"

# Only run on Android builds
if [[ "${EAS_BUILD_PLATFORM:-}" != "android" ]]; then
  echo "Skipping Android post-install (platform: ${EAS_BUILD_PLATFORM:-unknown})"
  exit 0
fi

# Ensure Android NDK is installed and exported before Gradle runs (rust-android-gradle checks very early)
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-${HOME}/Android/Sdk}}"
NDK_VERSION="${ANDROID_NDK_VERSION:-27.0.12077973}"

# Resolve sdkmanager path
SDKMANAGER="${SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager"
if [[ ! -x "${SDKMANAGER}" ]]; then
  SDKMANAGER="$(command -v sdkmanager || true)"
fi

if [[ -z "${SDKMANAGER}" ]]; then
  echo "sdkmanager not found; cannot proactively install NDK. Gradle may attempt to install it."
else
  # Accept licenses just in case
  yes | "${SDKMANAGER}" --sdk_root="${SDK_ROOT}" --licenses >/dev/null 2>&1 || true

  if [[ ! -d "${SDK_ROOT}/ndk/${NDK_VERSION}" ]]; then
    echo "Installing Android NDK ${NDK_VERSION} into ${SDK_ROOT}/ndk/${NDK_VERSION}"
    "${SDKMANAGER}" --sdk_root="${SDK_ROOT}" --install "ndk;${NDK_VERSION}"
  else
    echo "Android NDK ${NDK_VERSION} already present at ${SDK_ROOT}/ndk/${NDK_VERSION}"
  fi
fi

# Use the requested (or latest) side-by-side NDK and export common env vars
if [[ -d "${SDK_ROOT}/ndk/${NDK_VERSION}" ]]; then
  SELECTED_NDK_DIR="${SDK_ROOT}/ndk/${NDK_VERSION}"
else
  SELECTED_NDK_DIR="$(ls -1d "${SDK_ROOT}/ndk"/* 2>/dev/null | sort -V | tail -n1 || true)"
fi

if [[ -z "${SELECTED_NDK_DIR}" || ! -d "${SELECTED_NDK_DIR}" ]]; then
  echo "Android NDK directory not found after installation attempt; skipping Rust prebuild"
  exit 0
fi

export ANDROID_NDK_ROOT="${SELECTED_NDK_DIR}"
export ANDROID_NDK_HOME="${SELECTED_NDK_DIR}"
export ANDROID_NDK="${SELECTED_NDK_DIR}"
if command -v set-env >/dev/null 2>&1; then
  set-env ANDROID_NDK_ROOT "${ANDROID_NDK_ROOT}"
  set-env ANDROID_NDK_HOME "${ANDROID_NDK_HOME}"
  set-env ANDROID_NDK "${ANDROID_NDK}"
  # Also provide as JVM system properties for Gradle plugins that only read from system props
  set-env JAVA_TOOL_OPTIONS "-DANDROID_NDK_HOME=${ANDROID_NDK_ROOT} -DANDROID_NDK_ROOT=${ANDROID_NDK_ROOT} -DANDROID_NDK=${ANDROID_NDK_ROOT} ${JAVA_TOOL_OPTIONS:-}"
fi
echo "Using NDK at ${SELECTED_NDK_DIR}"

# Ensure Gradle recognizes the selected NDK version without ndk.dir (deprecated)
PROJECT_ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
GRADLE_PROPERTIES="${PROJECT_ROOT}/android/gradle.properties"
mkdir -p "${PROJECT_ROOT}/android"
if [[ -f "${GRADLE_PROPERTIES}" ]]; then
  if grep -q '^android.ndkVersion=' "${GRADLE_PROPERTIES}"; then
    sed -i.bak -E "s|^android.ndkVersion=.*$|android.ndkVersion=${NDK_VERSION}|" "${GRADLE_PROPERTIES}" || true
  else
    # Ensure file ends with a newline before appending to avoid concatenating with previous property
    if [[ -n "$(tail -c1 "${GRADLE_PROPERTIES}" 2>/dev/null || true)" ]]; then
      printf "\n" >> "${GRADLE_PROPERTIES}"
    fi
    printf "android.ndkVersion=%s\n" "${NDK_VERSION}" >> "${GRADLE_PROPERTIES}"
    printf "org.gradle.project.android.ndkVersion=%s\n" "${NDK_VERSION}" >> "${GRADLE_PROPERTIES}"
  fi
else
  {
    printf "android.ndkVersion=%s\n" "${NDK_VERSION}"
    printf "org.gradle.project.android.ndkVersion=%s\n" "${NDK_VERSION}"
  } > "${GRADLE_PROPERTIES}"
fi
echo "Ensured android.ndkVersion=${NDK_VERSION} in ${GRADLE_PROPERTIES}"

# Ensure Python interpreter is available to linker wrapper
if command -v set-env >/dev/null 2>&1; then
  set-env RUST_ANDROID_GRADLE_PYTHON_COMMAND python3
else
  export RUST_ANDROID_GRADLE_PYTHON_COMMAND=python3
fi

# Patch CML and MSL bridge modules to use the correct NDK version
CML_BRIDGE_GRADLE_PROPS="${PROJECT_ROOT}/node_modules/@yoroi-classic/cml-mobile-bridge/android/gradle.properties"
MSL_BRIDGE_GRADLE_PROPS="${PROJECT_ROOT}/node_modules/@emurgo/msl-mobile-bridge-jsi/android/gradle.properties"

patch_bridge_ndk_version() {
  local properties_file="$1"
  local property_prefix="$2"
  [[ -f "${properties_file}" ]] || return 0
  echo "Patching NDK version in ${properties_file}"
  if grep -q '^.*_ndkversion=' "${properties_file}"; then
    sed -i.bak -E "s|^.*_ndkversion=.*$|${property_prefix}_ndkversion=${NDK_VERSION}|" "${properties_file}"
  else
    printf "%s_ndkversion=%s\n" "${property_prefix}" "${NDK_VERSION}" >> "${properties_file}"
  fi
  if ! grep -q '^android.ndkVersion=' "${properties_file}"; then
    printf "android.ndkVersion=%s\n" "${NDK_VERSION}" >> "${properties_file}"
  fi
}

patch_bridge_ndk_version "${CML_BRIDGE_GRADLE_PROPS}" "CmlMobileBridge"
patch_bridge_ndk_version "${MSL_BRIDGE_GRADLE_PROPS}" "MslMobileBridge"

# Prebuild Rust JNI libraries for Emurgo bridges (arm64)
cd android
./gradlew \
  :yoroi-classic_cml-mobile-bridge:cargoBuildArm \
  :yoroi-classic_cml-mobile-bridge:cargoBuildArm64 \
  :yoroi-classic_cml-mobile-bridge:cargoBuildX86 \
  :yoroi-classic_cml-mobile-bridge:cargoBuildX86_64 \
  :emurgo_msl-mobile-bridge-jsi:cargoBuildArm \
  :emurgo_msl-mobile-bridge-jsi:cargoBuildArm64 \
  :emurgo_msl-mobile-bridge-jsi:cargoBuildX86 \
  :emurgo_msl-mobile-bridge-jsi:cargoBuildX86_64
