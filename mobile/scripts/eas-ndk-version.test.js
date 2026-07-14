const fs = require('node:fs')
const path = require('node:path')

const mobileRoot = path.resolve(__dirname, '..')

function readFile(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8')
}

function readNdkFallback(script) {
  const match = script.match(/NDK_VERSION="\$\{ANDROID_NDK_VERSION:-([^}]+)\}"/)
  expect(match).not.toBeNull()
  return match[1]
}

describe('EAS Android NDK baseline', () => {
  it('keeps install script fallbacks aligned with eas.json', () => {
    const easJson = JSON.parse(readFile('eas.json'))
    const ndkVersion = easJson.build?.base?.env?.ANDROID_NDK_VERSION

    expect(ndkVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(readNdkFallback(readFile('scripts/eas-pre-install.sh'))).toBe(ndkVersion)
    expect(readNdkFallback(readFile('scripts/eas-post-install.sh'))).toBe(ndkVersion)
  })
})
