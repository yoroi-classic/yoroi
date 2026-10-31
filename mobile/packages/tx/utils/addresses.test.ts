import {Address} from '@yoroi/types'

import {Addressing} from '../types'
import {
  addrContainsAccountKey,
  derivePublicByAddressing,
  filterAddressesByStakingKey,
  isByronAddress,
  normalizeAddressToHex,
  validateAndExtractAddressInfo,
} from './addresses'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn(() => ({
    hex: '00' + 'ab'.repeat(28),
    networkId: 0,
    bech32: 'addr_test1qtest',
    isValid: true,
  })),
  stakeCredentialHexFromAddress: jest.fn(() => '8200581c' + 'ab'.repeat(28)),
}))

describe('address utils', () => {
  describe('normalizeAddressToHex', () => {
    it('uses CML normalized bytes for bech32 and hex input', () => {
      const {addressInfoFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )

      expect(normalizeAddressToHex('addr_test1qpxxxxxx')).toBe(
        '00' + 'ab'.repeat(28),
      )
      expect(addressInfoFromAddress).toHaveBeenCalledWith('addr_test1qpxxxxxx')
    })

    it('returns undefined when CML rejects the address', () => {
      const {addressInfoFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      addressInfoFromAddress.mockImplementationOnce(() => {
        throw new Error('invalid address')
      })
      expect(normalizeAddressToHex('invalid')).toBeUndefined()
    })
  })

  describe('isByronAddress', () => {
    it('classifies a CML-parsed Byron address from canonical bytes', () => {
      const {addressInfoFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      addressInfoFromAddress.mockImplementationOnce(() => ({
        hex: '82d818' + '00'.repeat(29),
        networkId: 1,
        bech32: null,
        isValid: true,
      }))
      expect(isByronAddress('Ae2valid')).toBe(true)
    })

    it('rejects invalid prefix lookalikes and malformed strings', () => {
      const {addressInfoFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      addressInfoFromAddress.mockImplementationOnce(() => {
        throw new Error('not a valid address')
      })
      expect(isByronAddress('Ae2invalid')).toBe(false)
      expect(isByronAddress('')).toBe(false)
    })
  })

  describe('validateAndExtractAddressInfo', () => {
    it('extracts normalized Shelley address info through CML', async () => {
      const address =
        'addr_test1qqhchrw4umcrf90ew5ep85zefj9724c5jcfg6kp667qau789d6z307gnggrp3hgye75yzgh5q0w6unkqnvfxjfu7vxlswtaxme'
      await expect(validateAndExtractAddressInfo(address)).resolves.toEqual({
        networkId: 0,
        hex: ('00' + 'ab'.repeat(28)) as any,
        bech32: 'addr_test1qtest',
        isValid: true,
      })
    })

    it('returns undefined when CML rejects a Shelley address', async () => {
      const {addressInfoFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      addressInfoFromAddress.mockImplementationOnce(() => {
        throw new Error('invalid address')
      })
      await expect(
        validateAndExtractAddressInfo('addr_invalid'),
      ).resolves.toBeUndefined()
    })
  })

  describe('filterAddressesByStakingKey', () => {
    it('should filter addresses by staking key', async () => {
      const result = await filterAddressesByStakingKey(
        '8200581c' + 'ab'.repeat(28),
        [{receiver: 'addr_test1qpxxxxxx' as Address}],
        false,
      )
      expect(result).toHaveLength(1)
    })
  })

  describe('addrContainsAccountKey', () => {
    it('should check if address contains account key', async () => {
      const result = await addrContainsAccountKey(
        'addr_test1qpxxxxxx',
        '8200581c' + 'ab'.repeat(28),
        false,
      )

      expect(result).toBe(true)
    })

    it('should handle pointer addresses with acceptTypeMismatch', async () => {
      const {addressInfoFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      addressInfoFromAddress.mockImplementationOnce(() => ({
        hex: '40',
        networkId: 0,
        bech32: null,
        isValid: true,
      }))

      const result = await addrContainsAccountKey(
        'addr_test1qpxxxxxx',
        '8200581c' + 'ab'.repeat(28),
        true,
      )

      expect(result).toBe(true) // acceptTypeMismatch = true
    })

    it('rejects an unmatched base-address credential when type mismatches are not accepted', async () => {
      const {stakeCredentialHexFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      stakeCredentialHexFromAddress.mockImplementationOnce(
        () => 'different-credential',
      )
      await expect(
        addrContainsAccountKey(
          'addr_test1qpxxxxxx',
          '8200581c' + 'ab'.repeat(28),
          false,
        ),
      ).resolves.toBe(false)
    })

    it('rejects a parsed non-base address when type mismatches are not accepted', async () => {
      const {addressInfoFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      addressInfoFromAddress.mockImplementationOnce(() => ({
        hex: '60',
        networkId: 0,
        bech32: null,
        isValid: true,
      }))
      await expect(
        addrContainsAccountKey(
          'addr_test1qpxxxxxx',
          '8200581c' + 'ab'.repeat(28),
          false,
        ),
      ).resolves.toBe(false)
    })

    it('should throw error for invalid address', async () => {
      const {addressInfoFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      addressInfoFromAddress.mockImplementationOnce(() => {
        throw new Error('invalid address')
      })

      await expect(
        addrContainsAccountKey('invalid', 'credential', false),
      ).rejects.toThrow('invalid address')
    })
  })

  describe('derivePublicByAddressing', () => {
    it('should derive public key by addressing', () => {
      const addressing: Addressing = {
        path: [1852, 1815, 0, 0, 0],
        startLevel: 2,
      }
      // Create a chain of derive methods
      const finalKey = 'final_key'
      const key3 = {derive: jest.fn(() => finalKey)}
      const key2 = {derive: jest.fn(() => key3)}
      const key1 = {derive: jest.fn(() => key2)}
      const mockKey = {derive: jest.fn(() => key1)}
      const startingFrom = {
        key: mockKey as any,
        level: 2,
      }

      const result = derivePublicByAddressing(addressing, startingFrom)

      expect(result).toBe(finalKey)
    })

    it('should throw error when key level is less than start level', () => {
      const addressing: Addressing = {
        path: [1852, 1815, 0, 0, 0],
        startLevel: 2,
      }
      const startingFrom = {
        key: {} as any,
        level: 0, // Less than startLevel - 1
      }

      expect(() => derivePublicByAddressing(addressing, startingFrom)).toThrow(
        'keyLevel < startLevel',
      )
    })

    it('should throw error for invalid addressing path', () => {
      const addressing: Addressing = {
        path: [1852, 1815, undefined as any], // Invalid path with undefined
        startLevel: 2,
      }
      const key1: any = {derive: jest.fn(() => key1)} // Circular for simplicity
      const mockKey = {derive: jest.fn(() => key1)}
      const startingFrom = {
        key: mockKey as any,
        level: 2,
      }

      expect(() => derivePublicByAddressing(addressing, startingFrom)).toThrow(
        'Invalid addressing path',
      )
    })
  })
})
