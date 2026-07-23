const {
  assertNoProductionFixtureMnemonics,
} = require('./mobile-fixture-safety.cjs')

try {
  assertNoProductionFixtureMnemonics(process.env)
  console.log('Production fixture environment check passed.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
