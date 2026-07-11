#!/usr/bin/env node
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'

const mobileRoot = process.cwd()
const scriptRequire = createRequire(__filename)

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

const additionalSmokeInputs = ['packages/cardano-wallet/mocks/mocks/wallet.ts']

const urlPattern = /https?:\/\/[^'"`\s)]+/gi
const forbiddenHostPattern = /(?:yoroiwallet|emurgo)/i

function hostedFixtureUrls(source: string) {
  return [...source.matchAll(urlPattern)]
    .map(([url]) => url)
    .filter((url) => {
      try {
        return forbiddenHostPattern.test(new URL(url).hostname)
      } catch {
        return false
      }
    })
}

function validateSmokeInputs() {
  const failures: Array<string> = []

  for (const inputPath of [...smokeTests, ...additionalSmokeInputs]) {
    const absolutePath = path.join(mobileRoot, inputPath)

    if (!fs.existsSync(absolutePath)) {
      failures.push(`missing smoke input: ${inputPath}`)
      continue
    }

    const inputSource = fs.readFileSync(absolutePath, 'utf8')
    const hostedUrls = hostedFixtureUrls(inputSource)

    if (hostedUrls.length > 0) {
      failures.push(
        `${inputPath} references owned-host smoke fixture URL(s): ${[
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

function resolveJestBin() {
  try {
    return scriptRequire.resolve('jest/bin/jest')
  } catch {
    console.error('jest not found - did you run `npm ci` in mobile/?')
    process.exit(1)
  }
}

function runJestSmokeTests() {
  const jestBin = resolveJestBin()
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
