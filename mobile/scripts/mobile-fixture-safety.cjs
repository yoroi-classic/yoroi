const {spawn} = require('node:child_process')
const {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} = require('node:fs')
const path = require('node:path')
const {createInterface} = require('node:readline')

const fixtureVariablePattern = /^EXPO_PUBLIC_WALLET_[1-9][0-9]*_MNEMONIC$/u

const isProductionBuild = (env = process.env) =>
  env.EAS_BUILD_PROFILE?.toLowerCase() === 'production' ||
  env.EXPO_PUBLIC_BUILD_VARIANT?.toUpperCase() === 'PROD' ||
  env.EXPO_PUBLIC_APP_CONFIG === 'app.config.production.js'

const activeFixtureVariableNames = (env = process.env) =>
  Object.entries(env)
    .filter(
      ([name, value]) =>
        fixtureVariablePattern.test(name) &&
        typeof value === 'string' &&
        value.trim() !== '',
    )
    .map(([name]) => name)
    .sort()

const assertNoProductionFixtureMnemonics = (env = process.env) => {
  if (!isProductionBuild(env)) return

  const activeNames = activeFixtureVariableNames(env)
  if (activeNames.length === 0) return

  throw new Error(
    `Production build refused: fixture variables must be empty (${activeNames.join(', ')}).`,
  )
}

const parseDotenvEntries = (contents) => {
  const entries = []
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u,
    )
    if (!match) continue

    let value = match[2]
    const isQuoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    if (isQuoted) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/u, '')
    }
    entries.push([match[1], value])
  }
  return entries
}

const collectJsonEntries = (value, entries) => {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonEntries(item, entries)
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [name, child] of Object.entries(value)) {
    if (fixtureVariablePattern.test(name) && typeof child === 'string') {
      entries.push([name, child])
    }
    collectJsonEntries(child, entries)
  }
}

const configuredFixtureEntries = ({mobileDir, env = process.env}) => {
  const entries = Object.entries(env).filter(([name]) =>
    fixtureVariablePattern.test(name),
  )

  const easPath = path.join(mobileDir, 'eas.json')
  if (existsSync(easPath)) {
    collectJsonEntries(JSON.parse(readFileSync(easPath, 'utf8')), entries)
  }

  for (const name of readdirSync(mobileDir)) {
    if (name !== '.env' && !name.startsWith('.env.')) continue
    const dotenvPath = path.join(mobileDir, name)
    if (!statSync(dotenvPath).isFile()) continue
    entries.push(...parseDotenvEntries(readFileSync(dotenvPath, 'utf8')))
  }

  return entries.filter(
    ([name, value]) =>
      fixtureVariablePattern.test(name) &&
      typeof value === 'string' &&
      value.trim() !== '',
  )
}

const configuredFixtureVariableNames = (options) => [
  ...new Set(configuredFixtureEntries(options).map(([name]) => name)),
]

const configuredFixtureMnemonics = (options) => [
  ...new Set(configuredFixtureEntries(options).map(([, value]) => value)),
]

const scanReadable = async (readable, values) => {
  const needles = values.map((value) => Buffer.from(value, 'utf8'))
  const overlap = Math.max(...needles.map((needle) => needle.length)) - 1
  let carry = Buffer.alloc(0)
  let found = false

  for await (const chunk of readable) {
    if (found) continue
    const data = Buffer.concat([carry, chunk])
    found = needles.some((needle) => data.includes(needle))
    carry = data.subarray(Math.max(0, data.length - overlap))
  }

  return found
}

const waitForChild = (child) =>
  new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })

const scanArchiveEntry = async (archivePath, entry, values) => {
  const unzip = spawn('unzip', ['-p', archivePath, entry], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  unzip.stderr.setEncoding('utf8')
  unzip.stderr.on('data', (chunk) => {
    if (stderr.length < 4096) stderr += chunk
  })

  const [found, exitCode] = await Promise.all([
    scanReadable(unzip.stdout, values),
    waitForChild(unzip),
  ])
  if (exitCode !== 0) {
    throw new Error(
      `Unable to inspect archive entry ${JSON.stringify(entry)}: ${stderr.trim() || `unzip exited ${exitCode}`}`,
    )
  }
  return found
}

const scanArchive = async (archivePath, values) => {
  const resolvedPath = path.resolve(archivePath)
  const unzip = spawn('unzip', ['-Z1', resolvedPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  unzip.stderr.setEncoding('utf8')
  unzip.stderr.on('data', (chunk) => {
    if (stderr.length < 4096) stderr += chunk
  })

  const exitCodePromise = waitForChild(unzip)
  const entries = createInterface({input: unzip.stdout, crlfDelay: Infinity})
  let found = false
  for await (const entry of entries) {
    if (found || entry.endsWith('/')) continue
    found = await scanArchiveEntry(resolvedPath, entry, values)
  }

  const exitCode = await exitCodePromise
  if (exitCode !== 0) {
    throw new Error(
      `Unable to list archive ${archivePath}: ${stderr.trim() || `unzip exited ${exitCode}`}`,
    )
  }
  return found
}

const scanArtifactPath = async (artifactPath, values) => {
  const metadata = statSync(artifactPath)
  if (metadata.isDirectory()) {
    for (const name of readdirSync(artifactPath)) {
      const match = await scanArtifactPath(
        path.join(artifactPath, name),
        values,
      )
      if (match) return match
    }
    return null
  }

  const extension = path.extname(artifactPath).toLowerCase()
  const found =
    extension === '.apk' || extension === '.zip'
      ? await scanArchive(artifactPath, values)
      : await scanReadable(createReadStream(artifactPath), values)
  return found ? artifactPath : null
}

const scanArtifacts = async (artifactPaths, values) => {
  if (values.length === 0) {
    throw new Error(
      'No configured fixture mnemonics are available for scanning.',
    )
  }
  for (const artifactPath of artifactPaths) {
    const match = await scanArtifactPath(artifactPath, values)
    if (match) return match
  }
  return null
}

module.exports = {
  activeFixtureVariableNames,
  assertNoProductionFixtureMnemonics,
  configuredFixtureMnemonics,
  configuredFixtureVariableNames,
  fixtureVariablePattern,
  isProductionBuild,
  scanArtifacts,
}
