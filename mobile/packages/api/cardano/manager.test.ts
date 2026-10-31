import {getLogger} from '@yoroi/logger'
import {StakePoolInfoRequest, StakePoolInfosAndHistories} from '@yoroi/staking'
import {Branded, TransactionCborBase64, WalletTransaction} from '@yoroi/types'

import {CardanoWalletBackendNetworkMismatchError} from './adapters/cardano-wallet-backend/api-maker'
import {cardanoWalletBackendV1Maker} from './adapters/cardano-wallet-backend/api-maker'
import {legacyApiMaker} from './adapters/legacy/api-maker'
import {
  AccountStateResponse,
  TipStatusResponse,
  TxStatusResponse,
} from './api-types'
import {cardanoApiManagerMaker} from './manager'
import {
  Addresses,
  CardanoApiAdapter,
  CardanoBackend,
  EndpointPreference,
  WalletContext,
} from './types'
import * as legacyFetch from './utils/fetch'

describe('cardanoApiManagerMaker', () => {
  const mockWalletContext: WalletContext = {
    walletId: 'test-wallet-id',
    publicKeyHex: Branded.asPublicKeyHex('test-public-key'),
    accountPubKeyHex: Branded.asPublicKeyHex('test-account-key'),
    paymentKeyHashes: [Branded.asKeyHash('hash1'), Branded.asKeyHash('hash2')],
    rewardAddresses: [Branded.asAddress('addr1')],
  }

  const createMockAdapter = (name: string): CardanoApiAdapter => ({
    async getTipStatus(): Promise<TipStatusResponse> {
      return {
        bestBlock: {
          hash: Branded.asBlockHash(`${name}-tip`),
          height: 100,
          epoch: null,
          slot: null,
          globalSlot: null,
        },
        safeBlock: {
          hash: Branded.asBlockHash(`${name}-safe`),
          height: 99,
          epoch: null,
          slot: null,
          globalSlot: null,
        },
      }
    },

    async fetchNewTxHistory(): Promise<{
      isLast: boolean
      transactions: Array<WalletTransaction>
    }> {
      return {
        isLast: true,
        transactions: [
          {
            id: Branded.asTransactionHash(`${name}-tx`),
            type: 'shelley',
            status: 'Successful',
            inputs: [],
            outputs: [],
            lastUpdatedAt: new Date().toISOString(),
            submittedAt: null,
            blockNum: null,
            blockHash: null,
            txOrdinal: null,
            epoch: null,
            slot: null,
            withdrawals: [],
            certificates: [],
            memo: null,
          },
        ],
      }
    },

    async filterUsedAddresses(): Promise<Addresses> {
      return [Branded.asAddress(`${name}-used-addr`)]
    },

    async submitTransaction(): Promise<void> {
      // Mock implementation
    },

    async getAccountState(): Promise<AccountStateResponse> {
      return {[`${name}-addr`]: null}
    },

    async bulkGetAccountState(): Promise<AccountStateResponse> {
      return {[`${name}-bulk-addr`]: null}
    },

    async getPoolInfo(
      _request: StakePoolInfoRequest,
    ): Promise<StakePoolInfosAndHistories> {
      return {[`${name}-pool`]: null} as StakePoolInfosAndHistories
    },

    async fetchTxStatus(): Promise<TxStatusResponse> {
      return {submissionStatus: {[`${name}-tx`]: {status: 'SUCCESS'}}}
    },

    async checkServerStatus() {
      return {isServerOk: true, serverTime: Date.now()}
    },

    async getFundInfo() {
      return {
        currentFund: null,
        nextFund: null,
      }
    },
  })

  describe('adapter selection', () => {
    it('should use cardano-wallet-backend for configured transaction submission', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')
      const cardanoWalletBackendAdapter = {
        filterUsedAddresses: jest.fn().mockResolvedValue([]),
        submitTransaction: jest.fn().mockResolvedValue(undefined),
      }
      const preferences: EndpointPreference = {
        getTipStatus: 'legacy',
        fetchNewTxHistory: 'legacy',
        filterUsedAddresses: 'legacy',
        submitTransaction: 'cardano-wallet-backend',
        getAccountState: 'legacy',
        bulkGetAccountState: 'legacy',
        getPoolInfo: 'legacy',
        fetchTxStatus: 'legacy',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }
      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        cardanoWalletBackendAdapter,
        legacyAdapter,
        preferences,
      })
      const signedTx = 'signed-tx' as TransactionCborBase64

      await expect(api.submitTransaction(signedTx)).resolves.toBeUndefined()
      expect(
        cardanoWalletBackendAdapter.submitTransaction,
      ).toHaveBeenCalledWith(signedTx)
    })

    it('uses cardano-wallet-backend for used-address filtering when configured', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')
      const legacyFilter = jest.spyOn(legacyAdapter, 'filterUsedAddresses')
      const cwbFilter = jest
        .fn()
        .mockResolvedValue([Branded.asAddress('cwb-used-addr')])
      const cardanoWalletBackendAdapter = {
        filterUsedAddresses: cwbFilter,
        submitTransaction: jest.fn().mockResolvedValue(undefined),
      }
      const preferences: EndpointPreference = {
        getTipStatus: 'legacy',
        fetchNewTxHistory: 'legacy',
        filterUsedAddresses: 'cardano-wallet-backend',
        submitTransaction: 'legacy',
        getAccountState: 'legacy',
        bulkGetAccountState: 'legacy',
        getPoolInfo: 'legacy',
        fetchTxStatus: 'legacy',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }
      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        cardanoWalletBackendAdapter,
        legacyAdapter,
        preferences,
      })
      const addresses = [Branded.asAddress('addr1')]

      await expect(api.filterUsedAddresses(addresses)).resolves.toEqual([
        Branded.asAddress('cwb-used-addr'),
      ])
      expect(cwbFilter).toHaveBeenCalledWith(addresses, undefined)
      expect(legacyFilter).not.toHaveBeenCalled()
    })

    it('keeps used-address filtering on legacy without a CWB preference', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')
      const legacyFilter = jest.spyOn(legacyAdapter, 'filterUsedAddresses')
      const preferences: EndpointPreference = {
        getTipStatus: 'legacy',
        fetchNewTxHistory: 'legacy',
        filterUsedAddresses: 'legacy',
        submitTransaction: 'legacy',
        getAccountState: 'legacy',
        bulkGetAccountState: 'legacy',
        getPoolInfo: 'legacy',
        fetchTxStatus: 'legacy',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }
      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter,
        preferences,
      })
      const addresses = [Branded.asAddress('addr1')]

      await api.filterUsedAddresses(addresses)
      expect(legacyFilter).toHaveBeenCalledWith(addresses, undefined)
    })

    it('keeps address discovery on legacy when the CWB network does not match', async () => {
      const loggerWarn = jest.spyOn(getLogger(), 'warn')
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')
      const legacyFilter = jest.spyOn(legacyAdapter, 'filterUsedAddresses')
      const cwbFilter = jest
        .fn()
        .mockRejectedValue(new CardanoWalletBackendNetworkMismatchError())
      const cardanoWalletBackendAdapter = {
        filterUsedAddresses: cwbFilter,
        submitTransaction: jest.fn().mockResolvedValue(undefined),
      }
      const preferences: EndpointPreference = {
        getTipStatus: 'legacy',
        fetchNewTxHistory: 'legacy',
        filterUsedAddresses: 'cardano-wallet-backend',
        submitTransaction: 'legacy',
        getAccountState: 'legacy',
        bulkGetAccountState: 'legacy',
        getPoolInfo: 'legacy',
        fetchTxStatus: 'legacy',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }
      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        cardanoWalletBackendAdapter,
        legacyAdapter,
        preferences,
      })
      const addresses = [Branded.asAddress('addr1')]

      try {
        await expect(api.filterUsedAddresses(addresses)).resolves.toEqual([
          Branded.asAddress('legacy-used-addr'),
        ])
        expect(cwbFilter).toHaveBeenCalledWith(addresses, undefined)
        expect(legacyFilter).toHaveBeenCalledWith(addresses, undefined)
        expect(loggerWarn).toHaveBeenCalledWith(
          'cardano-wallet-backend network mismatch; using legacy used-address filtering',
        )
      } finally {
        loggerWarn.mockRestore()
      }
    })

    it('falls back to legacy v2 POST when mainnet wallet sees preprod CWB status', async () => {
      const mainnetAddress = Branded.asAddress(
        'addr1qxxvt9rzpdxxysmqp50d7f5a3gdescgrejsu7zsdxqjy8yun4cngaq46gr8c9qyz4td9ddajzqhjnrqvfh0gspzv9xnsmq6nqx',
      )
      const cwbRequest = jest.fn().mockResolvedValue({network: 'preprod'})
      const cwbAdapter = cardanoWalletBackendV1Maker({
        config: {
          baseUrl: 'https://wallet-backend.example.com',
          submitExpectedNetwork: 'mainnet',
        },
        request: cwbRequest,
      })
      const fetchDefault = jest
        .spyOn(legacyFetch, 'fetchDefault')
        .mockResolvedValue([mainnetAddress] as never)
      const legacyAdapter = legacyApiMaker({
        baseApiUrl: 'https://legacy.example.com/api',
      })
      const api = cardanoApiManagerMaker({
        backendZeroAdapter: createMockAdapter('backend-zero'),
        cardanoWalletBackendAdapter: cwbAdapter,
        legacyAdapter,
        preferences: {
          getTipStatus: 'legacy',
          fetchNewTxHistory: 'legacy',
          filterUsedAddresses: 'cardano-wallet-backend',
          submitTransaction: 'legacy',
          getAccountState: 'legacy',
          bulkGetAccountState: 'legacy',
          getPoolInfo: 'legacy',
          fetchTxStatus: 'legacy',
          checkServerStatus: 'legacy',
          getFundInfo: 'legacy',
        },
      })

      try {
        await expect(
          api.filterUsedAddresses([mainnetAddress]),
        ).resolves.toEqual([mainnetAddress])
        expect(cwbRequest).toHaveBeenCalledTimes(1)
        expect(cwbRequest).toHaveBeenCalledWith({
          url: 'https://wallet-backend.example.com/v1/status',
          method: 'GET',
          headers: {Accept: 'application/json'},
        })
        expect(fetchDefault).toHaveBeenCalledTimes(1)
        expect(fetchDefault).toHaveBeenCalledWith(
          'v2/addresses/filterUsed',
          {addresses: [mainnetAddress]},
          'https://legacy.example.com/api',
        )
      } finally {
        fetchDefault.mockRestore()
      }
    })

    it('should keep transaction submission on legacy without a backend preference', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')
      const legacySubmit = jest.spyOn(legacyAdapter, 'submitTransaction')
      const preferences: EndpointPreference = {
        getTipStatus: 'legacy',
        fetchNewTxHistory: 'legacy',
        filterUsedAddresses: 'legacy',
        submitTransaction: 'legacy',
        getAccountState: 'legacy',
        bulkGetAccountState: 'legacy',
        getPoolInfo: 'legacy',
        fetchTxStatus: 'legacy',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }
      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter,
        preferences,
      })
      const signedTx = 'signed-tx' as TransactionCborBase64

      await expect(api.submitTransaction(signedTx)).resolves.toBeUndefined()
      expect(legacySubmit).toHaveBeenCalledWith(signedTx)
    })

    it('should use backend-zero adapter when preference is backend-zero', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')

      const preferences: EndpointPreference = {
        getTipStatus: 'backend-zero',
        fetchNewTxHistory: 'backend-zero',
        filterUsedAddresses: 'backend-zero',
        submitTransaction: 'backend-zero',
        getAccountState: 'backend-zero',
        bulkGetAccountState: 'backend-zero',
        getPoolInfo: 'backend-zero',
        fetchTxStatus: 'backend-zero',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }

      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter,
        preferences,
      })

      const result = await api.getTipStatus()
      expect(result.bestBlock.hash).toBe('backend-zero-tip')
    })

    it('should use legacy adapter when preference is legacy', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')

      const preferences: EndpointPreference = {
        getTipStatus: 'legacy',
        fetchNewTxHistory: 'legacy',
        filterUsedAddresses: 'legacy',
        submitTransaction: 'legacy',
        getAccountState: 'legacy',
        bulkGetAccountState: 'legacy',
        getPoolInfo: 'legacy',
        fetchTxStatus: 'legacy',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }

      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter,
        preferences,
      })

      const result = await api.getTipStatus()
      expect(result.bestBlock.hash).toBe('legacy-tip')
    })
  })

  describe('wallet context validation', () => {
    it('should require wallet context for backend-zero endpoints that need it', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')

      const preferences: EndpointPreference = {
        getTipStatus: 'backend-zero',
        fetchNewTxHistory: 'backend-zero',
        filterUsedAddresses: 'backend-zero',
        submitTransaction: 'backend-zero',
        getAccountState: 'backend-zero',
        bulkGetAccountState: 'backend-zero',
        getPoolInfo: 'backend-zero',
        fetchTxStatus: 'backend-zero',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }

      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter,
        preferences,
      })

      // Should throw when context is missing for endpoints that require it
      await expect(
        api.fetchNewTxHistory({
          addresses: [],
          untilBlock: Branded.asBlockHash('block-hash'),
        }),
      ).rejects.toThrow(
        'Backend-zero endpoint fetchNewTxHistory requires wallet context',
      )

      await expect(
        api.filterUsedAddresses([Branded.asAddress('addr1')]),
      ).rejects.toThrow(
        'Backend-zero endpoint filterUsedAddresses requires wallet context',
      )

      await expect(
        api.getAccountState({addresses: [Branded.asAddress('addr1')]}),
      ).rejects.toThrow(
        'Backend-zero endpoint getAccountState requires wallet context',
      )

      await expect(
        api.bulkGetAccountState([Branded.asAddress('addr1')]),
      ).rejects.toThrow(
        'Backend-zero endpoint bulkGetAccountState requires wallet context',
      )
    })

    it('should not require wallet context for endpoints that do not need it', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')

      const preferences: EndpointPreference = {
        getTipStatus: 'backend-zero',
        fetchNewTxHistory: 'backend-zero',
        filterUsedAddresses: 'backend-zero',
        submitTransaction: 'backend-zero',
        getAccountState: 'backend-zero',
        bulkGetAccountState: 'backend-zero',
        getPoolInfo: 'backend-zero',
        fetchTxStatus: 'backend-zero',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }

      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter,
        preferences,
      })

      // These should work without context
      await expect(api.getTipStatus()).resolves.toBeDefined()
      await expect(
        api.submitTransaction('signed-tx' as TransactionCborBase64),
      ).resolves.toBeUndefined()
      await expect(api.getPoolInfo({poolIds: ['pool1']})).resolves.toBeDefined()
      await expect(
        api.fetchTxStatus({txHashes: [Branded.asTransactionHash('hash1')]}),
      ).resolves.toBeDefined()
    })

    it('should work with wallet context provided', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')

      const preferences: EndpointPreference = {
        getTipStatus: 'backend-zero',
        fetchNewTxHistory: 'backend-zero',
        filterUsedAddresses: 'backend-zero',
        submitTransaction: 'backend-zero',
        getAccountState: 'backend-zero',
        bulkGetAccountState: 'backend-zero',
        getPoolInfo: 'backend-zero',
        fetchTxStatus: 'backend-zero',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }

      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter,
        preferences,
      })

      await expect(
        api.fetchNewTxHistory(
          {addresses: [], untilBlock: Branded.asBlockHash('block-hash')},
          mockWalletContext,
        ),
      ).resolves.toBeDefined()

      await expect(
        api.filterUsedAddresses(
          [Branded.asAddress('addr1')],
          mockWalletContext,
        ),
      ).resolves.toBeDefined()

      await expect(
        api.getAccountState(
          {addresses: [Branded.asAddress('addr1')]},
          mockWalletContext,
        ),
      ).resolves.toBeDefined()

      await expect(
        api.bulkGetAccountState(
          [Branded.asAddress('addr1')],
          mockWalletContext,
        ),
      ).resolves.toBeDefined()
    })
  })

  describe('endpoint availability validation', () => {
    it('should throw error for invalid preference', () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')

      const preferences: EndpointPreference = {
        getTipStatus: 'backend-zero',
        fetchNewTxHistory: 'backend-zero',
        filterUsedAddresses: 'backend-zero',
        submitTransaction: 'backend-zero',
        getAccountState: 'backend-zero',
        bulkGetAccountState: 'backend-zero',
        getPoolInfo: 'backend-zero',
        fetchTxStatus: 'backend-zero',
        checkServerStatus: 'backend-zero' as CardanoBackend, // Invalid - only legacy supports this
        getFundInfo: 'legacy',
      }

      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter,
        preferences,
      })

      if (!api.checkServerStatus) {
        throw new Error('checkServerStatus should not be available')
      }
      return expect(api.checkServerStatus()).rejects.toThrow(
        'Backend backend-zero does not support endpoint checkServerStatus',
      )
    })
  })

  describe('optional methods', () => {
    it('should handle checkServerStatus when available', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')

      const preferences: EndpointPreference = {
        getTipStatus: 'backend-zero',
        fetchNewTxHistory: 'backend-zero',
        filterUsedAddresses: 'backend-zero',
        submitTransaction: 'backend-zero',
        getAccountState: 'backend-zero',
        bulkGetAccountState: 'backend-zero',
        getPoolInfo: 'backend-zero',
        fetchTxStatus: 'backend-zero',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }

      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter,
        preferences,
      })

      const result = await api.checkServerStatus!()
      expect(result.isServerOk).toBe(true)
      expect(result.serverTime).toBeDefined()
    })

    it('should handle getFundInfo when available', async () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapter = createMockAdapter('legacy')

      const preferences: EndpointPreference = {
        getTipStatus: 'backend-zero',
        fetchNewTxHistory: 'backend-zero',
        filterUsedAddresses: 'backend-zero',
        submitTransaction: 'backend-zero',
        getAccountState: 'backend-zero',
        bulkGetAccountState: 'backend-zero',
        getPoolInfo: 'backend-zero',
        fetchTxStatus: 'backend-zero',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }

      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter,
        preferences,
      })

      const result = await api.getFundInfo!()
      expect(result.currentFund).toBeNull()
      expect(result.nextFund).toBeNull()
    })

    it('should throw error when optional method is not available', () => {
      const backendZeroAdapter = createMockAdapter('backend-zero')
      const legacyAdapterWithoutOptional = {
        ...createMockAdapter('legacy'),
        checkServerStatus: undefined,
        getFundInfo: undefined,
      }

      const preferences: EndpointPreference = {
        getTipStatus: 'backend-zero',
        fetchNewTxHistory: 'backend-zero',
        filterUsedAddresses: 'backend-zero',
        submitTransaction: 'backend-zero',
        getAccountState: 'backend-zero',
        bulkGetAccountState: 'backend-zero',
        getPoolInfo: 'backend-zero',
        fetchTxStatus: 'backend-zero',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      }

      const api = cardanoApiManagerMaker({
        backendZeroAdapter,
        legacyAdapter: legacyAdapterWithoutOptional,
        preferences,
      })

      return expect(api.checkServerStatus!()).rejects.toThrow(
        'checkServerStatus not available',
      )
    })
  })
})
