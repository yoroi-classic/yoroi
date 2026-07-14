#!/usr/bin/env node
const {execFileSync} = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const mobileRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(mobileRoot, '..')
const packageJsonPath = path.join(mobileRoot, 'package.json')
const toolVersionsPath = path.join(repoRoot, '.tool-versions')

function parseVersion(version) {
  const match = String(version)
    .trim()
    .match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/)

  if (!match) throw new Error(`Unsupported version: ${version}`)

  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

function compareVersions(left, right) {
  const parsedLeft = parseVersion(left)
  const parsedRight = parseVersion(right)

  for (let index = 0; index < 3; index += 1) {
    if (parsedLeft[index] > parsedRight[index]) return 1
    if (parsedLeft[index] < parsedRight[index]) return -1
  }

  return 0
}

function satisfies(version, range) {
  return range.split(/\s+/).every((part) => {
    const match = part.match(/^(>=|>|<=|<|=)?(.+)$/)
    if (!match) return false

    const operator = match[1] ?? '='
    const expected = match[2]
    const comparison = compareVersions(version, expected)

    switch (operator) {
      case '>=':
        return comparison >= 0
      case '>':
        return comparison > 0
      case '<=':
        return comparison <= 0
      case '<':
        return comparison < 0
      case '=':
        return comparison === 0
      default:
        return false
    }
  })
}

function readToolVersion(toolName) {
  const toolVersions = fs.readFileSync(toolVersionsPath, 'utf8')
  const line = toolVersions
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${toolName} `))

  return line?.trim().split(/\s+/)[1]
}

function checkRange(failures, label, version, range) {
  if (!version) {
    failures.push(`${label} is not declared`)
    return
  }

  if (!range) {
    failures.push(`${label} has no engine range to validate against`)
    return
  }

  if (!satisfies(version, range)) {
    failures.push(`${label} ${version} does not satisfy ${range}`)
  }
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const failures = []
const nodeEngine = packageJson.engines?.node
const npmEngine = packageJson.engines?.npm
const packageManager = packageJson.packageManager ?? ''
const packageManagerMatch = packageManager.match(/^npm@(.+)$/)
const packageManagerVersion = packageManagerMatch?.[1]
const toolVersionsNode = readToolVersion('nodejs')
const npmVersion = execFileSync('npm', ['--version'], {encoding: 'utf8'}).trim()
const engineStrict = execFileSync('npm', ['config', 'get', 'engine-strict'], {
  cwd: mobileRoot,
  encoding: 'utf8',
}).trim()

checkRange(failures, 'Active Node', process.version, nodeEngine)
checkRange(failures, 'Active npm', npmVersion, npmEngine)
checkRange(failures, '.tool-versions nodejs', toolVersionsNode, nodeEngine)

if (packageManagerMatch) {
  checkRange(failures, 'packageManager npm', packageManagerVersion, npmEngine)
} else {
  failures.push(`packageManager must be npm-based, found: ${packageManager || '(missing)'}`)
}

if (engineStrict !== 'true') {
  failures.push(`npm engine-strict must resolve to true in mobile/, found: ${engineStrict}`)
}

if (failures.length > 0) {
  console.error('Mobile toolchain check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Mobile toolchain check passed: Node ${process.version}, npm ${npmVersion}, engine-strict=${engineStrict}`,
)
