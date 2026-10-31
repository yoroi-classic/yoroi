import {hex} from '@yoroi/common'

import {decryptData} from './decrypt-data'
import {randomNonce, randomSalt} from './encrypt-data'
import {encryptData} from './encrypt-data'

describe('encrypted storage format', () => {
  it('writes the standard authenticated format and reads it back', () => {
    const encrypted = encryptData({
      plainData: hex('deadbeef'),
      secretKey: hex.fromUtf8('fixture-password'),
    })
    expect(encrypted.value).not.toBe('deadbeef')
    expect(
      decryptData({
        encryptedData: encrypted,
        secretKey: hex.fromUtf8('fixture-password'),
      }).value,
    ).toBe('deadbeef')
  })
})

describe('randomSalt', () => {
  it.each`
    description
    ${'generates a 32-character hex string'}
    ${'generates different salts on each call'}
  `('$description', () => {
    const salt = randomSalt()
    expect(salt.value.length).toBe(32)
    expect(salt.value).toMatch(/^[0-9a-f]+$/)
  })

  it('generates different salts on each call', () => {
    const salt1 = randomSalt()
    const salt2 = randomSalt()
    expect(salt1).not.toBe(salt2)
  })
})

describe('randomNonce', () => {
  it.each`
    description
    ${'generates a 24-character hex string'}
    ${'generates different nonces on each call'}
  `('$description', () => {
    const nonce = randomNonce()
    expect(nonce.value.length).toBe(24)
    expect(nonce.value).toMatch(/^[0-9a-f]+$/)
  })

  it('generates different nonces on each call', () => {
    const nonce1 = randomNonce()
    const nonce2 = randomNonce()
    expect(nonce1).not.toBe(nonce2)
  })
})
