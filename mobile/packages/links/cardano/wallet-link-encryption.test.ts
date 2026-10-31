import {Hex, hex} from '@yoroi/common'
import {App} from '@yoroi/types'

import {
  type RandomHexStringFunction,
  type WalletLinkEncryptionAlgorithm,
  decryptWalletData,
  encryptWalletData,
} from './wallet-link-encryption'

describe('wallet-link-encryption', () => {
  const testData = 'deadbeef1234567890abcdef'
  const testPassword = 'test-password-123'
  // Frozen synthetic output from CSL `encrypt_with_password`.
  const legacyCslCiphertext =
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f' +
    '202122232425262728292a2b' +
    'a1b6cada95bf66b98602589946b5aa082086cfbb40188cb257b7542a'
  const legacyCslPassword = 'migration-test-passphrase'
  const legacyCslPlaintext = 'deadbeef1234567890abcdef'

  describe('encryptWalletData', () => {
    describe('plain algorithm', () => {
      it('should return data unchanged', () => {
        const result = encryptWalletData(testData, testPassword, 'plain')
        expect(result).toBe(testData)
      })
    })

    describe('chacha20poly1305 algorithm', () => {
      it('should encrypt data successfully', () => {
        const encrypted = encryptWalletData(
          testData,
          testPassword,
          'chacha20poly1305',
        )
        expect(encrypted).toBeDefined()
        expect(encrypted).not.toBe(testData)
        expect(encrypted.length).toBeGreaterThan(0)
        // Should be hex string
        expect(/^[0-9a-f]+$/i.test(encrypted)).toBe(true)
      })

      it('should produce different output for same input (nonce randomness)', () => {
        const encrypted1 = encryptWalletData(
          testData,
          testPassword,
          'chacha20poly1305',
        )
        const encrypted2 = encryptWalletData(
          testData,
          testPassword,
          'chacha20poly1305',
        )
        expect(encrypted1).not.toBe(encrypted2)
      })

      it('should use custom randomHexString when provided', () => {
        const mockRandomHex: RandomHexStringFunction = jest.fn((length) => {
          // Return predictable hex string for testing
          return hex.fromUtf8('0'.repeat(length / 2)) as Hex
        })

        encryptWalletData(testData, testPassword, 'chacha20poly1305', {
          randomHexString: mockRandomHex,
        })

        // Should be called for salt (32 hex chars = 16 bytes) and nonce (24 hex chars = 12 bytes)
        expect(mockRandomHex).toHaveBeenCalledWith(32) // salt
        expect(mockRandomHex).toHaveBeenCalledWith(24) // nonce
      })
    })

    describe('chacha20poly1305-csl algorithm', () => {
      it('does not create new legacy-format ciphertext', () => {
        expect(() =>
          encryptWalletData(testData, testPassword, 'chacha20poly1305-csl'),
        ).toThrow('Legacy wallet-link encryption is decrypt-only')
      })
    })

    describe('unsupported algorithm', () => {
      it('should throw error for unsupported algorithm', () => {
        expect(() =>
          encryptWalletData(
            testData,
            testPassword,
            'unsupported' as WalletLinkEncryptionAlgorithm,
          ),
        ).toThrow('Unsupported encryption algorithm')
      })
    })
  })

  describe('decryptWalletData', () => {
    describe('plain algorithm', () => {
      it('should return data unchanged', () => {
        const result = decryptWalletData(testData, testPassword, 'plain')
        expect(result).toBe(testData)
      })
    })

    describe('chacha20poly1305 algorithm', () => {
      it('should decrypt encrypted data successfully', () => {
        const encrypted = encryptWalletData(
          testData,
          testPassword,
          'chacha20poly1305',
        )
        const decrypted = decryptWalletData(
          encrypted,
          testPassword,
          'chacha20poly1305',
        )
        expect(decrypted).toBe(testData)
      })

      it('should throw WrongPassword error for wrong password', () => {
        const encrypted = encryptWalletData(
          testData,
          testPassword,
          'chacha20poly1305',
        )
        expect(() =>
          decryptWalletData(encrypted, 'wrong-password', 'chacha20poly1305'),
        ).toThrow(App.Errors.WrongPassword)
      })

      it('should throw error for invalid encrypted data (too short)', () => {
        const invalidData = 'deadbeef' // Too short
        expect(() =>
          decryptWalletData(invalidData, testPassword, 'chacha20poly1305'),
        ).toThrow('Invalid encrypted data: too short')
      })

      it('should throw WrongPassword error for corrupted data', () => {
        // Create valid-length but corrupted data
        const corruptedData = '0'.repeat(100) // Valid length but wrong format
        expect(() =>
          decryptWalletData(corruptedData, testPassword, 'chacha20poly1305'),
        ).toThrow(App.Errors.WrongPassword)
      })
    })

    describe('chacha20poly1305-csl algorithm', () => {
      it('decrypts a frozen CSL-produced legacy fixture without CSL', () => {
        expect(
          decryptWalletData(
            legacyCslCiphertext,
            legacyCslPassword,
            'chacha20poly1305-csl',
          ),
        ).toBe(legacyCslPlaintext)
      })

      it('maps a wrong password to WrongPassword for legacy data', () => {
        expect(() =>
          decryptWalletData(
            legacyCslCiphertext,
            'incorrect-password',
            'chacha20poly1305-csl',
          ),
        ).toThrow(App.Errors.WrongPassword)
      })

      it('rejects a modified authentication tag', () => {
        const tampered = `${legacyCslCiphertext.slice(0, 96)}ff${legacyCslCiphertext.slice(98)}`
        expect(() =>
          decryptWalletData(
            tampered,
            legacyCslPassword,
            'chacha20poly1305-csl',
          ),
        ).toThrow(App.Errors.WrongPassword)
      })

      it('rejects truncated legacy payloads as WrongPassword', () => {
        expect(() =>
          decryptWalletData('deadbeef', testPassword, 'chacha20poly1305-csl'),
        ).toThrow(App.Errors.WrongPassword)
      })
    })

    describe('unsupported algorithm', () => {
      it('should throw error for unsupported algorithm', () => {
        expect(() =>
          decryptWalletData(
            testData,
            testPassword,
            'unsupported' as WalletLinkEncryptionAlgorithm,
          ),
        ).toThrow('Unsupported encryption algorithm')
      })
    })
  })

  describe('roundtrip encryption/decryption', () => {
    it('should successfully encrypt and decrypt with chacha20poly1305', () => {
      const originalData = 'deadbeef1234567890abcdef'
      const password = 'my-secure-password'

      const encrypted = encryptWalletData(
        originalData,
        password,
        'chacha20poly1305',
      )
      const decrypted = decryptWalletData(
        encrypted,
        password,
        'chacha20poly1305',
      )

      expect(decrypted).toBe(originalData)
    })

    it('should decrypt a real legacy-format fixture', () => {
      expect(
        decryptWalletData(
          legacyCslCiphertext,
          legacyCslPassword,
          'chacha20poly1305-csl',
        ),
      ).toBe(legacyCslPlaintext)
    })
  })
})
