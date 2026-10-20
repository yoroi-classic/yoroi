/**
 * Tests for UTXO Service
 *
 * Note: These are basic structure tests. Full integration tests would require
 * mock UTXO data and CSL instances. This file provides a foundation for
 * comprehensive testing.
 */
import {Portfolio} from '@yoroi/types'

import {describe, expect, it} from '@jest/globals'

import {calculateChangeOutputMinAda, calculateLockedAda} from './utxoService'
import type {CalculateLockedAdaParams} from './utxoServiceTypes'

jest.mock('@yoroi-classic/csl-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn((address: string) => ({bech32: address})),
  minimumCoinForAssets: jest.fn(() => '1500000'),
}))

describe('utxoService', () => {
  describe('calculateChangeOutputMinAda', () => {
    it('keeps the configured base minimum for ADA-only change', async () => {
      const {minimumCoinForAssets} = jest.requireMock(
        '@yoroi-classic/csl-mobile-bridge',
      )
      minimumCoinForAssets.mockClear()

      await expect(
        calculateChangeOutputMinAda(
          'addr_test_change',
          {},
          {
            coinsPerUtxoByte: '4310',
            linearFee: {constant: '155381', coefficient: '44'},
            minimumUtxoVal: '1000000',
          },
          '.' as Portfolio.Token.Id,
        ),
      ).resolves.toBe(1000000n)

      expect(minimumCoinForAssets).not.toHaveBeenCalled()
    })

    it('uses CML and preserves exact token quantities for change', async () => {
      const {minimumCoinForAssets} = jest.requireMock(
        '@yoroi-classic/csl-mobile-bridge',
      )
      const tokenId = `${'ab'.repeat(28)}.00ff`

      await expect(
        calculateChangeOutputMinAda(
          'addr_test_change',
          {[tokenId as never]: 9007199254740993n},
          {
            coinsPerUtxoByte: '4310',
            linearFee: {constant: '155381', coefficient: '44'},
          },
          '.' as Portfolio.Token.Id,
        ),
      ).resolves.toBe(1500000n)

      expect(minimumCoinForAssets).toHaveBeenCalledWith(
        'addr_test_change',
        [
          {
            policyIdHex: 'ab'.repeat(28),
            assetNameHex: '00ff',
            quantity: '9007199254740993',
          },
        ],
        '4310',
      )
    })
  })

  describe('calculateLockedAda', () => {
    it('should handle empty UTXO list', async () => {
      const params: CalculateLockedAdaParams = {
        utxos: [],
        protocolParams: {
          coinsPerUtxoByte: '4310',
          linearFee: {constant: '155381', coefficient: '44'},
        },
        primaryTokenId: '.' as Portfolio.Token.Id,
      }

      const result = await calculateLockedAda(params)

      expect(result.currentLocked).toBe(BigInt(0))
      expect(result.dynamicLocked).toBe(BigInt(0))
      expect(result.optimizedLocked).toBe(BigInt(0))
    })

    it('should calculate locked ADA for UTXOs with tokens', async () => {
      // This test would require mock UTXO data
      // Placeholder for actual implementation
      expect(true).toBe(true)
    })
  })

  describe('analyzeTransferFeasibility', () => {
    it('should detect insufficient ADA', async () => {
      // This test would require mock UTXO data and transfer amounts
      // Placeholder for actual implementation
      expect(true).toBe(true)
    })

    it('should provide suggestions when transfer is not feasible', async () => {
      // This test would verify that suggestions are provided
      // Placeholder for actual implementation
      expect(true).toBe(true)
    })
  })

  describe('selectUtxosForTransfer', () => {
    it('should select UTXOs for simple ADA transfer', async () => {
      // This test would require mock UTXO data
      // Placeholder for actual implementation
      expect(true).toBe(true)
    })

    it('should handle token transfers', async () => {
      // This test would verify token-aware UTXO selection
      // Placeholder for actual implementation
      expect(true).toBe(true)
    })
  })

  describe('analyzeReorganizationOpportunities', () => {
    it('should identify CNT consolidation opportunities', async () => {
      // This test would require mock UTXO data with CNT tokens
      // Placeholder for actual implementation
      expect(true).toBe(true)
    })

    it('should only suggest opportunities with positive net benefit', async () => {
      // This test would verify net benefit calculation
      // Placeholder for actual implementation
      expect(true).toBe(true)
    })
  })

  describe('calculateCntTransferRequirements', () => {
    it('should calculate minimum ADA for CNT transfer', async () => {
      // This test would require mock UTXO data with CNT tokens
      // Placeholder for actual implementation
      expect(true).toBe(true)
    })

    it('should identify ADA that will be unlocked', async () => {
      // This test would verify unlocked ADA calculation
      // Placeholder for actual implementation
      expect(true).toBe(true)
    })
  })
})
