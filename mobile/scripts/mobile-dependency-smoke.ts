#!/usr/bin/env node
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'
import ts from 'typescript'

const mobileRoot = process.cwd()
const scriptRequire = createRequire(__filename)

const smokeTests = [
  'packages/wallet-manager/creation/wallet-creation.test.ts',
  'packages/wallet-manager/sync/sync-manager.test.ts',
  'packages/api/cardano/api/protocol-params.test.ts',
  'packages/api/cardano/api/best-block.test.ts',
  'packages/api/cardano/api/utxo-data.test.ts',
  'packages/cardano-wallet/cip30/cip30.test.ts',
  'packages/cardano-wallet/common/signatureUtils.test.ts',
  'packages/dapp-connector/dapp-connector.test.ts',
]

const additionalSmokeInputs = ['packages/cardano-wallet/mocks/mocks/wallet.ts']

const pinnedDependencySmokeInputs = [
  '@cardano-foundation/ledgerjs-hw-app-cardano',
  '@yoroi-classic/cml-mobile-bridge',
  '@ledgerhq/hw-transport-web-ble',
  '@ledgerhq/hw-transport-webhid',
  '@ledgerhq/react-native-hid',
  '@ledgerhq/react-native-hw-transport-ble',
]

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

function readJsonFile(filePath: string) {
  return JSON.parse(fs.readFileSync(path.join(mobileRoot, filePath), 'utf8'))
}

function getPackageVersion(
  packageJson: Record<string, unknown>,
  dependencyName: string,
) {
  const dependencyGroups = [
    packageJson.dependencies,
    packageJson.devDependencies,
  ] as Array<Record<string, string> | undefined>

  for (const dependencies of dependencyGroups) {
    const version = dependencies?.[dependencyName]
    if (version) return version
  }

  return undefined
}

function validatePinnedDependencyLock() {
  const packageJson = readJsonFile('package.json')
  const packageLock = readJsonFile('package-lock.json')
  const bunLockSource = fs.readFileSync(
    path.join(mobileRoot, 'bun.lock'),
    'utf8',
  )
  const bunLockParseResult = ts.parseConfigFileTextToJson(
    'bun.lock',
    bunLockSource,
  )
  const bunLock = bunLockParseResult.config ?? {}
  const bunLockRootWorkspace = bunLock.workspaces?.['']
  const bunLockRootDependencyGroups = [
    bunLockRootWorkspace?.dependencies,
    bunLockRootWorkspace?.devDependencies,
  ] as Array<Record<string, string> | undefined>
  const rootLockPackage = packageLock.packages?.[''] ?? {}
  const rootLockDependencyGroups = [
    rootLockPackage.dependencies,
    rootLockPackage.devDependencies,
  ] as Array<Record<string, string> | undefined>
  const failures: Array<string> = []
  if (bunLockParseResult.error || !bunLockRootWorkspace) {
    failures.push('bun.lock is invalid or missing the root workspace')
  }
  const forbiddenCslDependencies = [
    '@emurgo/cardano-serialization-lib-browser',
    '@emurgo/cardano-serialization-lib-nodejs',
    '@emurgo/cross-csl-core',
    '@emurgo/cross-csl-mobile',
    '@emurgo/cross-csl-nodejs',
    '@emurgo/csl-mobile-bridge-jsi',
  ]

  const sdkPackageRoot = path.join(mobileRoot, '../scripts/packages')
  const sdkPackageManifests = fs
    .readdirSync(sdkPackageRoot, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      path.join('../scripts/packages', entry.name, 'package.json'),
    )

  for (const manifestPath of sdkPackageManifests) {
    if (!fs.existsSync(path.join(mobileRoot, manifestPath))) continue
    const manifest = readJsonFile(manifestPath)
    const dependencyGroups = [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.peerDependencies,
      manifest.optionalDependencies,
    ] as Array<Record<string, string> | undefined>

    for (const dependencyName of forbiddenCslDependencies) {
      if (
        dependencyGroups.some((dependencies) => dependencies?.[dependencyName])
      ) {
        failures.push(`${manifestPath} still declares ${dependencyName}`)
      }
    }
  }

  for (const entry of fs.readdirSync(sdkPackageRoot, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue
    const lockPath = path.join(sdkPackageRoot, entry.name, 'package-lock.json')
    if (!fs.existsSync(lockPath)) continue
    const lockSource = fs.readFileSync(lockPath, 'utf8')
    for (const dependencyName of forbiddenCslDependencies) {
      if (lockSource.includes(dependencyName)) {
        failures.push(
          `${path.relative(mobileRoot, lockPath)} still references ${dependencyName}`,
        )
      }
    }
  }

  for (const dependencyName of forbiddenCslDependencies) {
    if (getPackageVersion(packageJson, dependencyName)) {
      failures.push(`${dependencyName} remains in package.json`)
    }
    if (packageLock.packages?.[`node_modules/${dependencyName}`]) {
      failures.push(`${dependencyName} remains in package-lock.json`)
    }
    if (bunLockSource.includes(dependencyName)) {
      failures.push(`${dependencyName} remains in bun.lock`)
    }
  }

  for (const dependencyName of pinnedDependencySmokeInputs) {
    const packageJsonVersion = getPackageVersion(packageJson, dependencyName)

    if (!packageJsonVersion) {
      failures.push(`${dependencyName} is missing from package.json`)
      continue
    }

    const lockRootVersion = rootLockDependencyGroups
      .map((dependencies) => dependencies?.[dependencyName])
      .find(Boolean)
    const resolvedPackage =
      packageLock.packages?.[`node_modules/${dependencyName}`]
    const resolvedVersion = resolvedPackage?.version

    if (lockRootVersion !== packageJsonVersion) {
      failures.push(
        `${dependencyName} package-lock root version ${lockRootVersion ?? '<missing>'} does not match package.json ${packageJsonVersion}`,
      )
    }

    const bunLockRootVersion = bunLockRootDependencyGroups
      .map((dependencies) => dependencies?.[dependencyName])
      .find(Boolean)

    if (bunLockRootVersion !== packageJsonVersion) {
      failures.push(
        `${dependencyName} bun.lock root version does not match package.json ${packageJsonVersion}`,
      )
    }

    if (
      dependencyName !== '@yoroi-classic/cml-mobile-bridge' &&
      resolvedVersion !== packageJsonVersion
    ) {
      failures.push(
        `${dependencyName} package-lock resolved version ${resolvedVersion ?? '<missing>'} does not match package.json ${packageJsonVersion}`,
      )
    }
    if (
      dependencyName === '@yoroi-classic/cml-mobile-bridge' &&
      !resolvedPackage
    ) {
      failures.push(`${dependencyName} has no package-lock entry`)
    }

    if (dependencyName === '@yoroi-classic/cml-mobile-bridge') {
      const expectedCommit = packageJsonVersion.split('#')[1]

      if (
        typeof expectedCommit !== 'string' ||
        !bunLockSource.includes(
          `${dependencyName}@github:yoroi-classic/csl-mobile-bridge#${expectedCommit.slice(0, 7)}`,
        )
      ) {
        failures.push(
          `${dependencyName} bun.lock resolution does not match package.json ${packageJsonVersion}`,
        )
      }
    }
  }

  if (failures.length > 0) {
    console.error('Mobile dependency lock preflight failed:')
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
validatePinnedDependencyLock()
runJestSmokeTests()
