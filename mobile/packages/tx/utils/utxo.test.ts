import {primaryTokenId} from '@yoroi/portfolio'
import {BalanceQuantity, Portfolio, TokenId} from '@yoroi/types'

import {transactionUnspentOutputHex} from '@yoroi-classic/cml-mobile-bridge'

import {rawUtxoToModernUtxo} from './utxo'
import type {RawUtxo} from './utxo'

describe('utxo utils', () => {
  it('serializes a ModernUtxo through CML without numeric coercion', () => {
    const txHashHex = 'aa'.repeat(32)
    const address =
      'addr1qynqc23tpx4dqps6xgqy9s2l3xz5fxu734wwmzj9uddn0h2z6epfcukqmswgwwfruxh7gaddv9x0d5awccwahnhwleqqc4zkh4'
    jest.mocked(transactionUnspentOutputHex).mockReturnValue('8200')

    const utxo = rawUtxoToModernUtxo(
      {
        amount: '900719925474099312345',
        receiver: address,
        tx_hash: txHashHex,
        tx_index: 3,
        utxo_id: `${txHashHex}:3`,
        assets: [
          {
            amount: '900719925474099399999',
            tokenId:
              `${'11'.repeat(28)}.${'ff'.repeat(3)}` as Portfolio.Token.Id,
            policyId: '11'.repeat(28),
            name: 'ffff',
          },
        ],
      },
      undefined,
      undefined,
      primaryTokenId,
    )

    expect(utxo.toTransactionUnspentOutputHex()).toBe('8200')
    expect(transactionUnspentOutputHex).toHaveBeenCalledWith({
      txHashHex,
      index: '3',
      address,
      lovelace: '900719925474099312345',
      assets: [
        {
          policyIdHex: '11'.repeat(28),
          assetNameHex: 'ff'.repeat(3),
          quantity: '900719925474099399999',
        },
      ],
    })
  })

  describe('rawUtxoToModernUtxo', () => {
    it('should convert RawUtxo to ModernUtxo', () => {
      const rawUtxo: RawUtxo = {
        amount: '1000000' as BalanceQuantity,
        receiver: 'addr_test1',
        tx_hash: 'hash1',
        tx_index: 0,
        utxo_id: 'hash1:0',
        assets: [],
      }

      const result = rawUtxoToModernUtxo(rawUtxo)
      const emptyTokenId = '' as TokenId

      expect(result.receiver).toBe('addr_test1')
      expect(result.txHash).toBe('hash1')
      expect(result.txIndex).toBe(0)
      expect(result.balance[emptyTokenId]).toBe('1000000')
    })

    it('should include assets in balance', () => {
      const tokenId = 'policy1.asset1' as TokenId
      const rawUtxo: RawUtxo = {
        amount: '1000000' as BalanceQuantity,
        receiver: 'addr_test1',
        tx_hash: 'hash1',
        tx_index: 0,
        utxo_id: 'hash1:0',
        assets: [
          {
            amount: '100' as BalanceQuantity,
            tokenId: tokenId as Portfolio.Token.Id,
            policyId: 'policy1',
            name: 'asset1',
          },
        ],
      }

      const result = rawUtxoToModernUtxo(rawUtxo)

      expect(result.balance[tokenId]).toBe('100')
    })

    it('should use custom primaryTokenId', () => {
      const primaryTokenId = '.' as TokenId
      const rawUtxo: RawUtxo = {
        amount: '1000000' as BalanceQuantity,
        receiver: 'addr_test1',
        tx_hash: 'hash1',
        tx_index: 0,
        utxo_id: 'hash1:0',
        assets: [],
      }

      const result = rawUtxoToModernUtxo(rawUtxo, undefined, undefined, '.')

      expect(result.balance[primaryTokenId]).toBe('1000000')
    })

    it('should include addressing when provided', () => {
      const rawUtxo: RawUtxo = {
        amount: '1000000' as BalanceQuantity,
        receiver: 'addr_test1',
        tx_hash: 'hash1',
        tx_index: 0,
        utxo_id: 'hash1:0',
        assets: [],
      }
      const addressing = {path: [1852, 1815, 0, 0, 0], startLevel: 2}

      const result = rawUtxoToModernUtxo(rawUtxo, addressing)

      expect(result.addressing).toBe(addressing)
    })

    it('should include derivationPath when provided', () => {
      const rawUtxo: RawUtxo = {
        amount: '1000000' as BalanceQuantity,
        receiver: 'addr_test1',
        tx_hash: 'hash1',
        tx_index: 0,
        utxo_id: 'hash1:0',
        assets: [],
      }

      const result = rawUtxoToModernUtxo(
        rawUtxo,
        undefined,
        "m/1852'/1815'/0'/0/0",
      )

      expect(result.derivationPath).toBe("m/1852'/1815'/0'/0/0")
    })

    it('should handle zero amount', () => {
      const rawUtxo: RawUtxo = {
        amount: '0' as BalanceQuantity,
        receiver: 'addr_test1',
        tx_hash: 'hash1',
        tx_index: 0,
        utxo_id: 'hash1:0',
        assets: [],
      }

      const result = rawUtxoToModernUtxo(rawUtxo)
      const emptyTokenId = '' as TokenId

      expect(result.balance[emptyTokenId]).toBeUndefined()
    })

    it('should reject an invalid output index before CML serialization', () => {
      const rawUtxo: RawUtxo = {
        amount: '1000000' as BalanceQuantity,
        receiver: 'addr_test1',
        tx_hash: 'hash1',
        tx_index: -1,
        utxo_id: 'hash1:0',
        assets: [],
      }

      const result = rawUtxoToModernUtxo(rawUtxo)

      expect(() => result.toTransactionUnspentOutputHex()).toThrow(
        'Invalid UTxO output index',
      )
    })
  })
})
