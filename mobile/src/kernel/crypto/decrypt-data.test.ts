import {hex} from '@yoroi/common'

import {decryptData} from './decrypt-data'

describe('decryptData', () => {
  it('can decrypt data', () => {
    const salt =
      '50515253c0c1c2c3c4c5c6c750515253c0c1c2c3c4c5c6c750515253c0c1c2c3'
    const nonce = '50515253c0c1c2c3c4c5c6c7'
    const payload = '308f9977d04e7f3a45abd148905c628e2bb2621360a585f352'
    const password = 'password'
    const ciphertextHex = ''.concat(salt, nonce, payload)

    const decryptedHex = decryptData({
      encryptedData: hex(ciphertextHex),
      secretKey: hex.fromUtf8(password),
    })
    expect(decryptedHex.utf8).toBe('masterkey')
  })

  it('decrypts a frozen CSL EMIP-3 ciphertext after the runtime migration', () => {
    const legacyCiphertext =
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f' +
      '202122232425262728292a2b' +
      'a1b6cada95bf66b98602589946b5aa082086cfbb40188cb257b7542a'
    expect(
      decryptData({
        encryptedData: hex(legacyCiphertext),
        secretKey: hex.fromUtf8('migration-test-passphrase'),
      }).value,
    ).toBe('deadbeef1234567890abcdef')
  })

  it('rejects tampering and incorrect passwords', () => {
    const ciphertext =
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f' +
      '202122232425262728292a2b' +
      'a1b6cada95bf66b98602589946b5aa082086cfbb40188cb257b7542a'
    const tampered = `${ciphertext.slice(0, -2)}${ciphertext.endsWith('00') ? '01' : '00'}`
    expect(() =>
      decryptData({
        encryptedData: hex(tampered),
        secretKey: hex.fromUtf8('migration-test-passphrase'),
      }),
    ).toThrow()
    expect(() =>
      decryptData({
        encryptedData: hex(ciphertext),
        secretKey: hex.fromUtf8('wrong-password'),
      }),
    ).toThrow()
  })
})
