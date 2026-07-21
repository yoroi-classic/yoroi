const assert = require('node:assert/strict')
const {spawnSync} = require('node:child_process')
const {mkdirSync, mkdtempSync, rmSync, writeFileSync} = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {describe, it} = require('node:test')

const {
  assertNoProductionFixtureMnemonics,
  configuredFixtureMnemonics,
  scanArtifacts,
} = require('./mobile-fixture-safety.cjs')
const {run} = require('./verify-production-fixture-artifacts.cjs')

const fixture =
  'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu'

describe('mobile fixture safety', () => {
  it('allows fixtures in non-production builds', () => {
    assert.doesNotThrow(() =>
      assertNoProductionFixtureMnemonics({
        EXPO_PUBLIC_BUILD_VARIANT: 'NIGHTLY',
        EXPO_PUBLIC_WALLET_1_MNEMONIC: fixture,
      }),
    )
  })

  it('rejects active production fixtures without disclosing their values', () => {
    assert.throws(
      () =>
        assertNoProductionFixtureMnemonics({
          EAS_BUILD_PROFILE: 'production',
          EXPO_PUBLIC_WALLET_1_MNEMONIC: fixture,
        }),
      (error) => {
        assert.match(error.message, /EXPO_PUBLIC_WALLET_1_MNEMONIC/u)
        assert.doesNotMatch(error.message, new RegExp(fixture, 'u'))
        return true
      },
    )
  })

  it('recognizes the repository production command convention', () => {
    assert.throws(() =>
      assertNoProductionFixtureMnemonics({
        EXPO_PUBLIC_APP_CONFIG: 'app.config.production.js',
        EXPO_PUBLIC_WALLET_1_MNEMONIC: fixture,
      }),
    )
  })

  it('allows production when fixture variables are explicitly empty', () => {
    assert.doesNotThrow(() =>
      assertNoProductionFixtureMnemonics({
        EXPO_PUBLIC_BUILD_VARIANT: 'PROD',
        EXPO_PUBLIC_WALLET_1_MNEMONIC: '',
      }),
    )
  })

  it('collects and deduplicates configured fixtures without logging them', () => {
    const temporaryDir = mkdtempSync(
      path.join(os.tmpdir(), 'fixture-config-test-'),
    )
    try {
      writeFileSync(
        path.join(temporaryDir, '.env'),
        `EXPO_PUBLIC_WALLET_1_MNEMONIC=${fixture} # fixture comment\n`,
      )
      writeFileSync(
        path.join(temporaryDir, 'eas.json'),
        JSON.stringify({
          build: {preview: {env: {EXPO_PUBLIC_WALLET_2_MNEMONIC: fixture}}},
        }),
      )
      assert.deepEqual(
        configuredFixtureMnemonics({mobileDir: temporaryDir, env: {}}),
        [fixture],
      )
    } finally {
      rmSync(temporaryDir, {force: true, recursive: true})
    }
  })

  it('detects a fixture split across raw-file stream chunks', async () => {
    const temporaryDir = mkdtempSync(
      path.join(os.tmpdir(), 'fixture-raw-test-'),
    )
    try {
      const artifact = path.join(temporaryDir, 'release.hbc')
      writeFileSync(artifact, `${'x'.repeat(65530)}${fixture}${'y'.repeat(32)}`)
      assert.equal(await scanArtifacts([artifact], [fixture]), artifact)
    } finally {
      rmSync(temporaryDir, {force: true, recursive: true})
    }
  })

  it('detects a fixture inside a compressed APK entry', async () => {
    const temporaryDir = mkdtempSync(
      path.join(os.tmpdir(), 'fixture-apk-test-'),
    )
    try {
      const payloadDir = path.join(temporaryDir, 'payload')
      const artifact = path.join(temporaryDir, 'app-release.apk')
      mkdirSync(payloadDir)
      writeFileSync(path.join(payloadDir, 'index.android.bundle'), fixture)
      const zip = spawnSync('zip', ['-q', artifact, 'index.android.bundle'], {
        cwd: payloadDir,
      })
      assert.equal(zip.status, 0)
      assert.equal(await scanArtifacts([artifact], [fixture]), artifact)
    } finally {
      rmSync(temporaryDir, {force: true, recursive: true})
    }
  })

  it('does not match fixture fragments across APK entries', async () => {
    const temporaryDir = mkdtempSync(
      path.join(os.tmpdir(), 'fixture-apk-boundary-test-'),
    )
    try {
      const payloadDir = path.join(temporaryDir, 'payload')
      const artifact = path.join(temporaryDir, 'app-release.apk')
      const split = Math.floor(fixture.length / 2)
      mkdirSync(payloadDir)
      writeFileSync(path.join(payloadDir, 'first'), fixture.slice(0, split))
      writeFileSync(path.join(payloadDir, 'second'), fixture.slice(split))
      const zip = spawnSync('zip', ['-q', artifact, 'first', 'second'], {
        cwd: payloadDir,
      })
      assert.equal(zip.status, 0)
      assert.equal(await scanArtifacts([artifact], [fixture]), null)
    } finally {
      rmSync(temporaryDir, {force: true, recursive: true})
    }
  })

  it('reports captured compiler diagnostics with fixture values redacted', () => {
    assert.throws(
      () =>
        run(
          process.execPath,
          [
            '-e',
            `console.error(${JSON.stringify(`invalid source: ${fixture}`)}); process.exit(1)`,
          ],
          {capture: true, label: 'Compiler', redactValues: [fixture]},
        ),
      (error) => {
        assert.match(error.message, /invalid source: \[REDACTED\]/u)
        assert.doesNotMatch(error.message, new RegExp(fixture, 'u'))
        return true
      },
    )
  })

  it('accepts clean artifacts', async () => {
    const temporaryDir = mkdtempSync(
      path.join(os.tmpdir(), 'fixture-clean-test-'),
    )
    try {
      const artifact = path.join(temporaryDir, 'release.hbc')
      writeFileSync(artifact, 'clean production bytecode')
      assert.equal(await scanArtifacts([artifact], [fixture]), null)
    } finally {
      rmSync(temporaryDir, {force: true, recursive: true})
    }
  })
})
