import {BalanceQuantity, TransactionHash} from '@yoroi/types'

import {createTransactionBuilder} from '../transaction-builder/builder'
import {addMint, addMints, createBurnAction, createMintAction} from './mint'
import type {MintAction} from './types'

describe('minting', () => {
  describe('addMint', () => {
    it('should add mint action to state', () => {
      const state = createTransactionBuilder()
      const mintAction: MintAction = {
        policyId: 'policy1',
        assets: [{assetName: 'asset1', amount: '100' as BalanceQuantity}],
        script: {type: 'native', script: 'script1'},
      }

      const newState = addMint(state, mintAction)

      expect(newState.options.mints).toHaveLength(1)
      expect(newState.options.mints?.[0]).toEqual(mintAction)
    })

    it('should merge mint actions for same policy', () => {
      const state = createTransactionBuilder()
      const mintAction1: MintAction = {
        policyId: 'policy1',
        assets: [{assetName: 'asset1', amount: '100' as BalanceQuantity}],
        script: {type: 'native', script: 'script1'},
      }
      const mintAction2: MintAction = {
        policyId: 'policy1',
        assets: [{assetName: 'asset2', amount: '200' as BalanceQuantity}],
        script: {type: 'native', script: 'script1'},
      }

      const state1 = addMint(state, mintAction1)
      const state2 = addMint(state1, mintAction2)

      expect(state2.options.mints).toHaveLength(1)
      expect(state2.options.mints?.[0]?.assets).toHaveLength(2)
      expect(state2.options.mints?.[0]?.assets[0]?.assetName).toBe('asset1')
      expect(state2.options.mints?.[0]?.assets[1]?.assetName).toBe('asset2')
    })

    it('should use redeemer from new action if provided', () => {
      const state = createTransactionBuilder()
      const mintAction1: MintAction = {
        policyId: 'policy1',
        assets: [{assetName: 'asset1', amount: '100' as BalanceQuantity}],
        script: {type: 'plutus', script: 'script1', plutusVersion: 'plutusV3'},
        redeemer: 'old_redeemer',
        redeemerExUnits: {mem: '1', steps: '2'},
      }
      const mintAction2: MintAction = {
        policyId: 'policy1',
        assets: [{assetName: 'asset2', amount: '200' as BalanceQuantity}],
        script: {type: 'plutus', script: 'script1', plutusVersion: 'plutusV3'},
        redeemer: 'new_redeemer',
        redeemerExUnits: {mem: '9', steps: '10'},
      }

      const state1 = addMint(state, mintAction1)
      const state2 = addMint(state1, mintAction2)

      expect(state2.options.mints?.[0]?.redeemer).toBe('new_redeemer')
      expect(state2.options.mints?.[0]?.redeemerExUnits).toEqual({
        mem: '9',
        steps: '10',
      })
    })

    it('rejects merging different script types for the same policy', () => {
      const state = addMint(createTransactionBuilder(), {
        policyId: 'policy1',
        assets: [{assetName: 'asset1', amount: '1' as BalanceQuantity}],
        script: {type: 'native', script: 'script1'},
      })

      expect(() =>
        addMint(state, {
          policyId: 'policy1',
          assets: [{assetName: 'asset2', amount: '1' as BalanceQuantity}],
          script: {
            type: 'plutus',
            script: 'script2',
            plutusVersion: 'plutusV3',
          },
          redeemer: '00',
          redeemerExUnits: {mem: '1', steps: '2'},
        }),
      ).toThrow('Cannot merge mint actions with different script types')
    })

    it('does not permit an incomplete Plutus mint action', () => {
      expect(() =>
        createMintAction('policy1', 'asset1', '100', {
          type: 'plutus',
          script: 'script1',
          plutusVersion: 'plutusV3',
        }),
      ).toThrow('Plutus mint creation requires redeemer and execution units')
    })

    it('does not permit Plutus redeemer data on native mint actions', () => {
      expect(() =>
        createMintAction(
          'policy1',
          'asset1',
          '100',
          {
            type: 'native',
            script: 'script1',
          },
          '00',
        ),
      ).toThrow('Native mint creation cannot include Plutus redeemer data')
    })
  })

  describe('addMints', () => {
    it('should add multiple mint actions', () => {
      const state = createTransactionBuilder()
      const mintActions: MintAction[] = [
        {
          policyId: 'policy1',
          assets: [{assetName: 'asset1', amount: '100' as BalanceQuantity}],
          script: {type: 'native', script: 'script1'},
        },
        {
          policyId: 'policy2',
          assets: [{assetName: 'asset2', amount: '200' as BalanceQuantity}],
          script: {type: 'native', script: 'script2'},
        },
      ]

      const newState = addMints(state, mintActions)

      expect(newState.options.mints?.length).toBe(2)
    })
  })

  describe('createMintAction', () => {
    it('should create mint action', () => {
      const result = createMintAction('policy1', 'asset1', '100', {
        type: 'native',
        script: 'script1',
      })

      expect(result).toEqual({
        policyId: 'policy1',
        assets: [{assetName: 'asset1', amount: '100' as BalanceQuantity}],
        script: {type: 'native', script: 'script1'},
        redeemer: undefined,
        referenceScript: undefined,
      })
    })

    it('should include redeemer and reference script when provided', () => {
      const result = createMintAction(
        'policy1',
        'asset1',
        '100',
        {type: 'plutus', script: 'script1', plutusVersion: 'plutusV3'},
        'redeemer1',
        {
          txHash: 'hash1' as TransactionHash,
          txIndex: 0,
          output: {
            address: 'addr_test1',
            lovelace: '1000000',
            assets: [],
            scriptCborHex: 'script1',
          },
        },
        {mem: '1', steps: '2'},
      )

      expect(result.redeemer).toBe('redeemer1')
      expect(result.referenceScript).toEqual({
        txHash: 'hash1' as TransactionHash,
        txIndex: 0,
        output: {
          address: 'addr_test1',
          lovelace: '1000000',
          assets: [],
          scriptCborHex: 'script1',
        },
      })
    })
  })

  describe('createBurnAction', () => {
    it('should create burn action with negative amount', () => {
      const result = createBurnAction('policy1', 'asset1', '100', {
        type: 'native',
        script: 'script1',
      })

      expect(result.assets[0]?.amount).toBe('-100')
    })

    it('should keep negative amount as-is', () => {
      const result = createBurnAction('policy1', 'asset1', '-100', {
        type: 'native',
        script: 'script1',
      })

      expect(result.assets[0]?.amount).toBe('-100')
    })
  })
})
