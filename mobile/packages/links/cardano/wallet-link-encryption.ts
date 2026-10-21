import {Hex, hex} from '@yoroi/common'
import {getLogger} from '@yoroi/logger'
import {App} from '@yoroi/types'

import {Buffer} from '@craftzdog/react-native-buffer'
// @ts-ignore
import {chacha20poly1305} from '@noble/ciphers/chacha'
import 'react-native-get-random-values'
// @ts-ignore
import QuickCrypto from 'react-native-quick-crypto'

const LEGACY_SALT_SIZE = 32 // bytes; CSL EMIP-3 format
const LEGACY_NONCE_SIZE = 12 // bytes
const LEGACY_PBKDF_ITERATIONS = 19_162

// Standard ChaCha20-Poly1305 constants
const STANDARD_PBKDF_ITERATIONS = 12983
const STANDARD_SALT_SIZE = 16 // bytes
const STANDARD_NONCE_SIZE = 12 // bytes
const STANDARD_KEY_SIZE = 32 // bytes
const STANDARD_TAG_SIZE = 16 // bytes
const STANDARD_DIGEST = 'sha512'

export type WalletLinkEncryptionAlgorithm =
  | 'plain'
  | 'chacha20poly1305' // Standard format: salt + nonce + ciphertext + tag
  | 'chacha20poly1305-csl' // CSL EMIP-3 format (legacy, decryption only)

export type RandomHexStringFunction = (length: number) => Hex

export type WalletLinkEncryptionOptions = {
  randomHexString?: RandomHexStringFunction
}

/**
 * Encrypt wallet data for deeplink sharing
 * @param data - Plaintext data to encrypt (hex string)
 * @param password - Encryption password
 * @param algorithm - Encryption algorithm to use
 * @param options - Optional random-byte source for deterministic callers
 * @returns Encrypted data as hex string
 */
export const encryptWalletData = (
  data: string,
  password: string,
  algorithm: WalletLinkEncryptionAlgorithm,
  options?: WalletLinkEncryptionOptions,
): string => {
  if (algorithm === 'plain') {
    return data
  }

  if (algorithm === 'chacha20poly1305-csl') {
    throw new Error('Legacy wallet-link encryption is decrypt-only')
  }

  if (algorithm === 'chacha20poly1305') {
    // Standard ChaCha20-Poly1305 format: salt + nonce + ciphertext + tag
    // Generate random hex strings for salt and nonce
    const generateRandomHex = (length: number): string => {
      if (options?.randomHexString) {
        return options.randomHexString(length).value
      }
      // Fallback: use crypto.getRandomValues (available globally via react-native-get-random-values)
      const bytes = new Uint8Array(length / 2)
      // @ts-ignore - crypto is available globally
      crypto.getRandomValues(bytes)
      return hex.fromBytes(bytes).value
    }
    const saltHex = generateRandomHex(STANDARD_SALT_SIZE * 2) // 32 hex chars = 16 bytes
    const nonceHex = generateRandomHex(STANDARD_NONCE_SIZE * 2) // 24 hex chars = 12 bytes
    const saltBytes = Buffer.from(saltHex, 'hex')
    const nonceBytes = Buffer.from(nonceHex, 'hex')
    const dataBytes = Buffer.from(data, 'hex')
    const passwordBytes = Buffer.from(password, 'utf8')

    // Derive key using PBKDF2-SHA512
    const keyBuffer = QuickCrypto.pbkdf2Sync(
      passwordBytes,
      saltBytes,
      STANDARD_PBKDF_ITERATIONS,
      STANDARD_KEY_SIZE,
      STANDARD_DIGEST,
    )
    const key = new Uint8Array(keyBuffer)

    // Encrypt using ChaCha20-Poly1305
    const cipher = chacha20poly1305(key, new Uint8Array(nonceBytes))
    const encrypted = cipher.encrypt(new Uint8Array(dataBytes))

    // Format: salt + nonce + ciphertext (which includes tag)
    const result = Buffer.concat([
      saltBytes,
      nonceBytes,
      Buffer.from(encrypted),
    ])

    return result.toString('hex')
  }

  throw new Error(`Unsupported encryption algorithm: ${algorithm}`)
}

/**
 * Decrypt wallet data from deeplink
 * @param encryptedData - Encrypted data as hex string
 * @param password - Decryption password
 * @param algorithm - Encryption algorithm used
 * @param options - Reserved compatibility options
 * @returns Decrypted data as hex string
 */
export const decryptWalletData = (
  encryptedData: string,
  password: string,
  algorithm: WalletLinkEncryptionAlgorithm,
  _options?: WalletLinkEncryptionOptions,
): string => {
  if (algorithm === 'plain') {
    return encryptedData
  }

  if (algorithm === 'chacha20poly1305-csl') {
    try {
      const legacyBytes = Buffer.from(encryptedData, 'hex')
      const metadataSize =
        LEGACY_SALT_SIZE + LEGACY_NONCE_SIZE + STANDARD_TAG_SIZE
      if (legacyBytes.length <= metadataSize) {
        throw new Error('Legacy ciphertext is too short')
      }

      // CSL EMIP-3 wire order is salt + nonce + tag + ciphertext.
      const salt = legacyBytes.slice(0, LEGACY_SALT_SIZE)
      const nonceStart = LEGACY_SALT_SIZE
      const nonce = legacyBytes.slice(
        nonceStart,
        nonceStart + LEGACY_NONCE_SIZE,
      )
      const tagStart = nonceStart + LEGACY_NONCE_SIZE
      const tag = legacyBytes.slice(tagStart, tagStart + STANDARD_TAG_SIZE)
      const ciphertext = legacyBytes.slice(metadataSize)
      const keyBuffer = QuickCrypto.pbkdf2Sync(
        Buffer.from(password, 'utf8'),
        salt,
        LEGACY_PBKDF_ITERATIONS,
        STANDARD_KEY_SIZE,
        STANDARD_DIGEST,
      )
      const cipher = chacha20poly1305(
        new Uint8Array(keyBuffer),
        new Uint8Array(nonce),
      )
      const ciphertextWithTag = Buffer.concat([ciphertext, tag])
      return Buffer.from(
        cipher.decrypt(new Uint8Array(ciphertextWithTag)),
      ).toString('hex')
    } catch (error) {
      getLogger().debug('Legacy wallet-link decryption failed', {
        origin: 'decryptWalletData',
      })
      throw new App.Errors.WrongPassword()
    }
  }

  if (algorithm === 'chacha20poly1305') {
    // Standard format: salt (16) + nonce (12) + ciphertext + tag (16)
    const encryptedBuffer = Buffer.from(encryptedData, 'hex')
    const minSize = STANDARD_SALT_SIZE + STANDARD_NONCE_SIZE + STANDARD_TAG_SIZE

    if (encryptedBuffer.length < minSize) {
      throw new Error('Invalid encrypted data: too short')
    }

    const salt = encryptedBuffer.slice(0, STANDARD_SALT_SIZE)
    const nonce = encryptedBuffer.slice(
      STANDARD_SALT_SIZE,
      STANDARD_SALT_SIZE + STANDARD_NONCE_SIZE,
    )
    const ciphertextWithTag = encryptedBuffer.slice(
      STANDARD_SALT_SIZE + STANDARD_NONCE_SIZE,
    )
    const passwordBytes = Buffer.from(password, 'utf8')

    // Derive key using PBKDF2-SHA512
    const keyBuffer = QuickCrypto.pbkdf2Sync(
      passwordBytes,
      salt,
      STANDARD_PBKDF_ITERATIONS,
      STANDARD_KEY_SIZE,
      STANDARD_DIGEST,
    )
    const key = new Uint8Array(keyBuffer)

    // Decrypt using ChaCha20-Poly1305
    try {
      const cipher = chacha20poly1305(key, new Uint8Array(nonce))
      const decrypted = cipher.decrypt(new Uint8Array(ciphertextWithTag))
      return Buffer.from(decrypted).toString('hex')
    } catch (error) {
      getLogger().debug(
        'ChaCha20-Poly1305 (standard format) decryption failed',
        {
          origin: 'decryptWalletData',
        },
      )
      throw new App.Errors.WrongPassword()
    }
  }

  throw new Error(`Unsupported encryption algorithm: ${algorithm}`)
}
