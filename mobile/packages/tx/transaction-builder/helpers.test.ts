import {primaryTokenId} from '@yoroi/portfolio'
import {
  Address,
  Balance,
  Chain,
  TokenId,
  TransactionHash,
  Wallet,
} from '@yoroi/types'

import {BigNumber} from 'bignumber.js'

import {ModernUtxo} from '../utxo/models'
import {
  createCIP15VotingMetadata,
  createCIP36VotingMetadata,
  createCardanoHaskellConfig,
  createMetadataEntry,
  createRecipeContext,
  createStakeDelegationCertificate,
  createStakeDeregistrationCertificate,
  createStakeRegistrationCertificate,
  createVoteDelegationCertificate,
  selectUtxosForAmounts,
  sortUtxosByAda,
} from './helpers'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({}))

describe('transaction builder helpers', () => {
  const createMockUtxo = (
    balance: Balance.Amounts,
    txHash = 'hash1',
    txIndex = 0,
  ): ModernUtxo => ({
    receiver: 'addr_test1' as Address,
    txHash: txHash as TransactionHash,
    txIndex,
    balance,
    toTransactionUnspentOutputHex: jest.fn(() => 'hex'),
  })

  describe('createMetadataEntry', () => {
    it('should create metadata entry', () => {
      const result = createMetadataEntry(674, {msg: 'test'})

      expect(result).toEqual({
        label: 674,
        data: {msg: 'test'},
      })
    })
  })

  describe('createCIP15VotingMetadata', () => {
    it('should create CIP-15 voting metadata', () => {
      const result = createCIP15VotingMetadata(
        'voting_key',
        'staking_key',
        'reward_addr',
        123,
      )

      expect(result.label).toBe(61284)
      expect(result.data).toEqual({
        1: '0xvoting_key',
        2: '0xstaking_key',
        3: '0xreward_addr',
        4: 123,
      })
    })
  })

  describe('createCIP36VotingMetadata', () => {
    it('should create CIP-36 voting metadata without payment address', () => {
      const result = createCIP36VotingMetadata(
        'voting_key',
        'staking_key',
        'reward_addr',
        123,
      )

      expect(result.label).toBe(61284)
      expect(result.data).toEqual({
        1: [['0xvoting_key', 1]],
        2: '0xstaking_key',
        3: '0xreward_addr',
        4: 123,
        5: 0,
      })
    })

    it('should create CIP-36 voting metadata with payment address', () => {
      const result = createCIP36VotingMetadata(
        'voting_key',
        'staking_key',
        'reward_addr',
        123,
        'payment_addr',
      )

      expect(result.label).toBe(61284)
      expect(result.data).toEqual({
        1: [['0xvoting_key', 1]],
        2: '0xstaking_key',
        3: '0xpayment_addr',
        4: 123,
        5: 0,
      })
    })
  })

  describe('createCardanoHaskellConfig', () => {
    it('should create CardanoHaskellConfig from protocol params', () => {
      const protocolParams: Pick<
        Chain.Cardano.ProtocolParams,
        | 'keyDeposit'
        | 'linearFee'
        | 'coinsPerUtxoByte'
        | 'poolDeposit'
        | 'scriptExecutionPrices'
      > = {
        keyDeposit: '2000000',
        linearFee: {coefficient: '44', constant: '155381'},
        coinsPerUtxoByte: '4310',
        poolDeposit: '500000000',
        scriptExecutionPrices: {
          memory: {numerator: '577', denominator: '10000'},
          cpu: {numerator: '721', denominator: '10000000'},
        },
      }

      const result = createCardanoHaskellConfig(protocolParams, 0)

      expect(result.keyDeposit).toBe('2000000')
      expect(result.linearFee).toEqual(protocolParams.linearFee)
      expect(result.coinsPerUtxoByte).toBe('4310')
      expect(result.poolDeposit).toBe('500000000')
      expect(result.networkId).toBe(0)
      expect(result.scriptExecutionPrices).toEqual(
        protocolParams.scriptExecutionPrices,
      )
    })
  })

  describe('createRecipeContext', () => {
    it('should create recipe context', async () => {
      const protocolParams: Chain.Cardano.ProtocolParams = {
        keyDeposit: '2000000',
        linearFee: {coefficient: '44', constant: '155381'},
        coinsPerUtxoByte: '4310',
        poolDeposit: '500000000',
        minUtxoValue: '1000000',
      } as any

      const params = {
        getAbsoluteSlotNumber: jest.fn(() =>
          Promise.resolve(new BigNumber(1000000)),
        ),
        getChangeAddress: jest.fn(() => 'addr_test1'),
        protocolParams,
        networkId: 0,
        addressMode: 'single' as Wallet.AddressMode,
      }

      const result = await createRecipeContext(params)

      expect(result.absSlotNumber).toEqual(new BigNumber(1000000))
      expect(result.changeAddress).toBe('addr_test1')
      expect(result.protocolConfig.networkId).toBe(0)
    })
  })

  describe('sortUtxosByAda', () => {
    it('should sort UTXOs by ADA amount descending', () => {
      const utxos = [
        createMockUtxo(
          {[primaryTokenId]: '1000000' as Balance.Quantity},
          'hash1',
          0,
        ),
        createMockUtxo(
          {[primaryTokenId]: '5000000' as Balance.Quantity},
          'hash2',
          1,
        ),
        createMockUtxo(
          {[primaryTokenId]: '2000000' as Balance.Quantity},
          'hash3',
          2,
        ),
      ]

      const result = sortUtxosByAda(utxos, primaryTokenId)

      expect(result[0]?.txHash).toBe('hash2') // Largest first
      expect(result[1]?.txHash).toBe('hash3')
      expect(result[2]?.txHash).toBe('hash1')
    })

    it('should handle empty array', () => {
      const result = sortUtxosByAda([], primaryTokenId)

      expect(result).toEqual([])
    })
  })

  describe('selectUtxosForAmounts', () => {
    it('should select UTXOs with required tokens', () => {
      const utxos = [
        createMockUtxo(
          {
            [primaryTokenId]: '1000000' as Balance.Quantity,
            ['token1' as TokenId]: '100' as Balance.Quantity,
          },
          'hash1',
          0,
        ),
        createMockUtxo(
          {[primaryTokenId]: '5000000' as Balance.Quantity},
          'hash2',
          1,
        ),
      ]
      const requiredAmounts: Record<TokenId, Balance.Quantity> = {
        ['token1' as TokenId]: '50' as Balance.Quantity,
      }

      const result = selectUtxosForAmounts(
        utxos,
        requiredAmounts,
        primaryTokenId,
      )

      expect(result.some((u) => u.txHash === 'hash1')).toBe(true)
    })

    it('should select additional UTXOs for ADA requirements', () => {
      const utxos = [
        createMockUtxo(
          {
            [primaryTokenId]: '1000000' as Balance.Quantity,
            ['token1' as TokenId]: '100' as Balance.Quantity,
          },
          'hash1',
          0,
        ),
        createMockUtxo(
          {[primaryTokenId]: '5000000' as Balance.Quantity},
          'hash2',
          1,
        ),
      ]
      const requiredAmounts: Record<TokenId, Balance.Quantity> = {
        [primaryTokenId]: '3000000' as Balance.Quantity,
        ['token1' as TokenId]: '50' as Balance.Quantity,
      }

      const result = selectUtxosForAmounts(
        utxos,
        requiredAmounts,
        primaryTokenId,
        '200000',
      )

      expect(result.length).toBeGreaterThan(1)
    })

    it('should handle estimated fee', () => {
      const utxos = [
        createMockUtxo(
          {[primaryTokenId]: '1000000' as Balance.Quantity},
          'hash1',
          0,
        ),
        createMockUtxo(
          {[primaryTokenId]: '5000000' as Balance.Quantity},
          'hash2',
          1,
        ),
      ]
      const requiredAmounts: Record<TokenId, Balance.Quantity> = {
        [primaryTokenId]: '2000000' as Balance.Quantity,
      }

      const result = selectUtxosForAmounts(
        utxos,
        requiredAmounts,
        primaryTokenId,
        '500000',
      )

      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('plain-data certificate constructors', () => {
    it('constructs registration and delegation certificates without CSL objects', () => {
      const stakeHash = '11'.repeat(28) as never
      const poolHash = '22'.repeat(28) as never
      expect(createStakeRegistrationCertificate(stakeHash)).toEqual({
        kind: 'StakeRegistration',
        stakeCredentialKeyHashHex: stakeHash,
      })
      expect(createStakeDeregistrationCertificate(stakeHash)).toEqual({
        kind: 'StakeDeregistration',
        stakeCredentialKeyHashHex: stakeHash,
      })
      expect(createStakeDelegationCertificate(stakeHash, poolHash)).toEqual({
        kind: 'StakeDelegation',
        stakeCredentialKeyHashHex: stakeHash,
        poolKeyHash: poolHash,
      })
      expect(createVoteDelegationCertificate(stakeHash, poolHash)).toEqual({
        kind: 'VoteDelegation',
        stakeCredentialKeyHashHex: stakeHash,
        drep: {KeyHash: poolHash},
      })
    })

    it('rejects unsupported bech32 DRep identifiers explicitly', () => {
      expect(() =>
        createVoteDelegationCertificate('11'.repeat(28), 'drep1unsupported'),
      ).toThrow('Bech32 DRep ID format not yet supported')
    })
  })
})
