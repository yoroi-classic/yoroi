const {spawnSync} = require('node:child_process')
const {existsSync, mkdtempSync, rmSync, writeFileSync} = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  assertNoProductionFixtureMnemonics,
  configuredFixtureMnemonics,
  configuredFixtureVariableNames,
  scanArtifacts,
} = require('./mobile-fixture-safety.cjs')

const mobileDir = path.resolve(__dirname, '..')

const redact = (output, values = []) =>
  values.reduce(
    (sanitized, value) => sanitized.split(value).join('[REDACTED]'),
    output,
  )

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: mobileDir,
    env: options.env,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const diagnostics = options.capture
      ? redact(
          [result.stderr, result.stdout].filter(Boolean).join('\n').trim(),
          options.redactValues,
        )
      : ''
    throw new Error(
      `${options.label || command} exited with status ${result.status}.${diagnostics ? `\n${diagnostics}` : ''}`,
    )
  }
  return options.capture ? result.stdout.trim() : ''
}

const resolveHermesc = () => {
  const candidates = [
    process.env.HERMESC_PATH,
    path.join(
      mobileDir,
      'node_modules/react-native/sdks/hermes/build/bin/hermesc',
    ),
    path.join(
      mobileDir,
      'node_modules/react-native/sdks/hermesc',
      process.platform === 'darwin' ? 'osx-bin' : 'linux64-bin',
      'hermesc',
    ),
  ].filter(Boolean)
  const hermesc = candidates.find(existsSync)
  if (!hermesc) {
    throw new Error(
      'No Hermes compiler is installed; run npm ci or install the native compiler first.',
    )
  }
  return hermesc
}

const main = async () => {
  const fixtureMnemonics = configuredFixtureMnemonics({mobileDir})
  const sanitizedEnv = {
    ...process.env,
    EAS_BUILD_PROFILE: 'production',
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_BUILD_VARIANT: 'PROD',
  }
  for (const name of configuredFixtureVariableNames({mobileDir})) {
    sanitizedEnv[name] = ''
  }
  assertNoProductionFixtureMnemonics(sanitizedEnv)

  const temporaryDir = mkdtempSync(
    path.join(os.tmpdir(), 'yoroi-production-fixture-scan-'),
  )
  try {
    const bundlePath = path.join(temporaryDir, 'release.js')
    const bytecodePath = path.join(temporaryDir, 'release.hbc')
    const canarySourcePath = path.join(temporaryDir, 'fixture-canary.js')
    const canaryBytecodePath = path.join(temporaryDir, 'fixture-canary.hbc')
    const sourceMapPath = path.join(temporaryDir, 'release.js.map')
    const assetsPath = path.join(temporaryDir, 'assets')
    const entryFile = run(
      process.execPath,
      [
        '-e',
        "require('expo/scripts/resolveAppEntry')",
        mobileDir,
        'android',
        'absolute',
      ],
      {capture: true, env: sanitizedEnv, label: 'Expo entry resolution'},
    )
    const expoCli = require.resolve('@expo/cli', {
      paths: [require.resolve('expo/package.json')],
    })

    run(
      process.execPath,
      [
        expoCli,
        'export:embed',
        '--platform',
        'android',
        '--dev',
        'false',
        '--reset-cache',
        '--entry-file',
        entryFile,
        '--bundle-output',
        bundlePath,
        '--assets-dest',
        assetsPath,
        '--sourcemap-output',
        sourceMapPath,
        '--minify',
        'false',
      ],
      {env: sanitizedEnv, label: 'Production Android export'},
    )
    const hermesc = resolveHermesc()
    run(hermesc, ['-O', '-emit-binary', '-out', bytecodePath, bundlePath], {
      capture: true,
      env: sanitizedEnv,
      label: 'Hermes bytecode generation',
      redactValues: fixtureMnemonics,
    })

    writeFileSync(
      canarySourcePath,
      `globalThis.__fixtureCanary = ${JSON.stringify(fixtureMnemonics[0])};\n`,
      {mode: 0o600},
    )
    run(
      hermesc,
      ['-emit-binary', '-out', canaryBytecodePath, canarySourcePath],
      {
        capture: true,
        env: sanitizedEnv,
        label: 'Hermes fixture scanner canary',
        redactValues: fixtureMnemonics,
      },
    )
    const canaryMatch = await scanArtifacts(
      [canaryBytecodePath],
      fixtureMnemonics,
    )
    if (!canaryMatch) {
      throw new Error(
        'Fixture scanner failed to detect its generated Hermes bytecode canary.',
      )
    }

    const match = await scanArtifacts(
      [bundlePath, bytecodePath],
      fixtureMnemonics,
    )
    if (match) {
      throw new Error(
        `Fixture mnemonic detected in generated production artifact: ${path.basename(match)}`,
      )
    }
    console.log(
      'Generated production JavaScript and Hermes bytecode contain no configured fixture mnemonic.',
    )
  } finally {
    rmSync(temporaryDir, {force: true, recursive: true})
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = {run}
