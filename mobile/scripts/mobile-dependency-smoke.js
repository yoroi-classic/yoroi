#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const {spawnSync} = require('child_process')

const mobileRoot = path.resolve(__dirname, '..')

const smokeTests = [
  'packages/wallet-manager/creation/wallet-creation.test.ts',
  'packages/wallet-manager/sync/sync-manager.test.ts',
  'packages/api/cardano/api/protocol-params.test.ts',
  'packages/api/cardano/api/best-block.test.ts',
  'packages/api/cardano/api/utxo-data.test.ts',
  'packages/cardano-wallet/cip30/cip30.test.ts',
  'packages/tx/utils/signing.test.ts',
  'packages/dapp-connector/dapp-connector.test.ts',
]

const hostedFixtureUrlPattern =
  /https?:\/\/[^'"`\s)]+(?:yoroiwallet|emurgo)[^'"`\s)]*/gi

function validateSmokeInputs() {
  const failures = []

  for (const testPath of smokeTests) {
    const absolutePath = path.join(mobileRoot, testPath)

    if (!fs.existsSync(absolutePath)) {
      failures.push(`missing smoke test: ${testPath}`)
      continue
    }

    const testSource = fs.readFileSync(absolutePath, 'utf8')
    const hostedUrls = testSource.match(hostedFixtureUrlPattern) ?? []

    if (hostedUrls.length > 0) {
      failures.push(
        `${testPath} references hosted smoke fixture URL(s): ${[
          ...new Set(hostedUrls),
        ].join(', ')}`,
      )
    }
  }

  if (failures.length > 0) {
    console.error('Mobile dependency smoke preflight failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
}

function runJestSmokeTests() {
  const jestBin = require.resolve('jest/bin/jest')
  const args = [
    jestBin,
    '--config',
    'jest.config.js',
    '--runInBand',
    '--coverage=false',
    '--runTestsByPath',
    ...smokeTests,
  ]

  console.log('Running mobile dependency smoke tests:')
  for (const testPath of smokeTests) console.log(`- ${testPath}`)

  const result = spawnSync(process.execPath, args, {
    cwd: mobileRoot,
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (result.signal) {
    console.error(`Jest exited with signal ${result.signal}`)
    process.exit(1)
  }

  process.exit(result.status ?? 1)
}

validateSmokeInputs()
runJestSmokeTests()
