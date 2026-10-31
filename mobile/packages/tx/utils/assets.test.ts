import {primaryTokenId} from '@yoroi/portfolio'
import {Address, Balance, TokenId, TransactionHash, UtxoId} from '@yoroi/types'

import {BigNumber} from 'bignumber.js'

import {RemoteUnspentOutput} from '../types'
import type {SendToken} from '../types'
import {
  ASCII_ASSET_NAME_BLACKLIST,
  amountsFromCardanoValue,
  amountsFromRemote,
  buildSendTokenList,
  cardanoAssetToIdentifier,
  cardanoValueFromAmounts,
  identifierToCardanoAsset,
  parseTokenList,
  resolveCip67Tag,
} from './assets'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  valueFromAmountsHex: jest.fn(() => '82182aa0'),
  valueFromHexInfoJson: jest.fn(() => JSON.stringify({coin: '0', assets: []})),
}))

describe('assets utils', () => {
  describe('serialized CML values', () => {
    it('encodes asset quantities as decimal strings through the CML bridge', () => {
      const {valueFromAmountsHex} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      const amounts = {
        '.': '900719925474099312345',
        [`${'ab'.repeat(28)}.00ff`]: '900719925474099312346',
      } as unknown as Balance.Amounts

      expect(cardanoValueFromAmounts(amounts, '.' as TokenId)).toBe('82182aa0')
      expect(valueFromAmountsHex).toHaveBeenCalledWith({
        coin: '900719925474099312345',
        assets: [
          {
            policyIdHex: 'ab'.repeat(28),
            assetNameHex: '00ff',
            quantity: '900719925474099312346',
          },
        ],
      })
    })

    it('decodes asset and lovelace amounts without Number conversion', () => {
      const {valueFromHexInfoJson} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      valueFromHexInfoJson.mockReturnValue(
        JSON.stringify({
          coin: '900719925474099312345',
          assets: [
            {
              policyIdHex: 'ab'.repeat(28),
              assetNameHex: '00ff',
              quantity: '900719925474099312346',
            },
          ],
        }),
      )
      expect(amountsFromCardanoValue('82182aa0', '.' as TokenId)).toEqual({
        '.': '900719925474099312345',
        [`${'ab'.repeat(28)}.00ff`]: '900719925474099312346',
      })
    })
  })

  describe('amountsFromRemote', () => {
    it('should return balance from RemoteUnspentOutput', () => {
      const token1 = 'token1' as TokenId
      const utxo: RemoteUnspentOutput = {
        receiver: 'addr_test1' as Address,
        txHash: 'hash1' as TransactionHash,
        txIndex: 0,
        utxoId: 'hash1:0' as UtxoId,
        balance: {
          [primaryTokenId]: '1000000',
          [token1]: '100',
        } as Balance.Amounts,
      }

      const result = amountsFromRemote(utxo, '.')

      expect(result).toEqual(utxo.balance)
    })
  })

  describe('buildSendTokenList', () => {
    it('should build token list with specific amounts', () => {
      const token1 = 'token1' as TokenId
      const token2 = 'token2' as TokenId
      const tokens: SendToken[] = [
        {
          amount: new BigNumber('100'),
          token: {identifier: token1, isDefault: false},
          shouldSendAll: false,
        },
        {
          amount: new BigNumber('200'),
          token: {identifier: token2, isDefault: false},
          shouldSendAll: false,
        },
      ]

      const result = buildSendTokenList('.', tokens, [])

      expect(result[token1]).toBe('100')
      expect(result[token2]).toBe('200')
    })

    it('should sum amounts when sending all from UTXOs', () => {
      const token1 = 'token1' as TokenId
      const tokens: SendToken[] = [
        {
          amount: null as any,
          token: {identifier: token1, isDefault: false},
          shouldSendAll: true,
        },
      ]
      const utxos: Balance.Amounts[] = [
        {[token1]: '100'} as Balance.Amounts,
        {[token1]: '200'} as Balance.Amounts,
        {[primaryTokenId]: '1000000' as Balance.Quantity},
      ]

      const result = buildSendTokenList('.', tokens, utxos)

      expect(result[token1]).toBe('300')
    })

    it('should handle tokens with no amount in UTXOs', () => {
      const token1 = 'token1' as TokenId
      const tokens: SendToken[] = [
        {
          amount: null as any,
          token: {identifier: token1, isDefault: false},
          shouldSendAll: true,
        },
      ]
      const utxos: Balance.Amounts[] = [
        {[primaryTokenId]: '1000000' as Balance.Quantity},
      ]

      const result = buildSendTokenList('.', tokens, utxos)

      expect(result[token1]).toBe('0')
    })
  })

  describe('cardanoAssetToIdentifier', () => {
    it('should convert Cardano asset to identifier', () => {
      expect(cardanoAssetToIdentifier('ab'.repeat(28), '00ff')).toBe(
        `${'ab'.repeat(28)}.00ff`,
      )
    })
  })

  describe('identifierToCardanoAsset', () => {
    it('should convert identifier to Cardano asset', () => {
      expect(identifierToCardanoAsset(`${'ab'.repeat(28)}.00ff`)).toEqual({
        policyIdHex: 'ab'.repeat(28),
        assetNameHex: '00ff',
      })
    })
  })

  describe('parseTokenList', () => {
    it('parses token list from serialized CML Value without numeric coercion', () => {
      const {valueFromHexInfoJson} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      valueFromHexInfoJson.mockReturnValue(
        JSON.stringify({
          coin: '42',
          assets: [
            {
              policyIdHex: 'ab'.repeat(28),
              assetNameHex: '00ff',
              quantity: '900719925474099312346',
            },
          ],
        }),
      )
      expect(parseTokenList('82182aa0')).toEqual([
        {
          assetId: `${'ab'.repeat(28)}.00ff`,
          amount: '900719925474099312346',
        },
      ])
    })
  })

  describe('resolveCip67Tag', () => {
    it('should resolve CIP-67 tag from asset name hex', () => {
      // CIP-67 format: 000643b0 + hex name
      // The function extracts first 8 hex chars (4 bytes) as tag
      const assetNameHex = '000643b0' + Buffer.from('test').toString('hex')

      const result = resolveCip67Tag(assetNameHex)

      expect(result.tag).toBe('000643b0') // First 8 hex chars (4 bytes)
      expect(result.hexName).toBe(Buffer.from('test').toString('hex'))
    })

    it('should return null tag for short hex', () => {
      const result = resolveCip67Tag('ab')

      expect(result.tag).toBeNull()
      expect(result.hexName).toBe('ab')
    })

    it('should extract tag from any hex string >= 8 chars', () => {
      // Function extracts first 8 hex chars (4 bytes) as tag if remaining is valid ASCII
      const assetNameHex = 'abcd1234' + Buffer.from('test').toString('hex')

      const result = resolveCip67Tag(assetNameHex)

      expect(result.tag).toBe('abcd1234') // First 8 hex chars (4 bytes)
      expect(result.hexName).toBe(Buffer.from('test').toString('hex'))
    })
  })

  describe('ASCII_ASSET_NAME_BLACKLIST', () => {
    it('should contain expected blacklisted names', () => {
      expect(ASCII_ASSET_NAME_BLACKLIST).toContain('ADA')
      expect(ASCII_ASSET_NAME_BLACKLIST).toContain('ADAF')
      expect(ASCII_ASSET_NAME_BLACKLIST.length).toBeGreaterThan(0)
    })
  })
})
