import {addressCredentialKindFromHex} from './address-kind'

describe('addressCredentialKindFromHex', () => {
  it.each([
    ['00', 0],
    ['12', 1],
    ['24', 0],
    ['36', 1],
    ['48', 0],
    ['5a', 1],
    ['6c', 0],
    ['7e', 1],
    ['e0', 0],
    ['f0', 1],
  ])('classifies address type %s', (header, kind) => {
    expect(addressCredentialKindFromHex(header)).toBe(kind)
  })

  it.each(['', '8a', 'aa', 'not-hex', '0'])('rejects unsupported %s', (hex) => {
    expect(addressCredentialKindFromHex(hex)).toBeNull()
  })
})
