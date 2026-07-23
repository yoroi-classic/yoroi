const path = require('node:path')

const {
  configuredFixtureMnemonics,
  scanArtifacts,
} = require('./mobile-fixture-safety.cjs')

const mobileDir = path.resolve(__dirname, '..')
const artifactPaths = process.argv.slice(2)

const main = async () => {
  if (artifactPaths.length === 0) {
    throw new Error(
      'Usage: npm run scan:mobile-fixtures -- <artifact-or-directory> [...]',
    )
  }

  const match = await scanArtifacts(
    artifactPaths,
    configuredFixtureMnemonics({mobileDir}),
  )
  if (match) {
    throw new Error(`Fixture mnemonic detected in mobile artifact: ${match}`)
  }
  console.log('No configured fixture mnemonic was found in mobile artifacts.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
