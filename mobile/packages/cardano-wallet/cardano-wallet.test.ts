import {buildNetworkManagers} from '@yoroi/blockchains'
import {createTokenManagerMock} from '@yoroi/portfolio'
import {
  PendingUtxoOverlay,
  PersistentPendingUtxoOverlayStore,
  createPersistentPendingUtxoOverlayStore,
} from '@yoroi/tx'
import {App, Balance, Branded, Chain, TransactionCborBase64} from '@yoroi/types'
import {
  getWalletFactory,
  initializeWalletFactories,
} from '@yoroi/wallet-manager'

import AsyncStorage from '@react-native-async-storage/async-storage'

import * as accountManagerApi from './account-manager/account-manager'
import * as readOnlyAccountManagerApi from './account-manager/read-only-account-manager'
import * as legacyApi from './api/api'
import {selectUtxoBackend} from './cardano-wallet'
import type {CardanoWalletDependencies} from './dependencies'
import {keyManager} from './key-manager/key-manager'
import * as pendingOverlayApi from './utxoManager/pending-utxo-overlay'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  walletRootKeyHexFromEntropy: jest.fn(() => 'ab'.repeat(96)),
  derivePublicKeyFromAccountPathHex: jest.fn(() => 'cd'.repeat(32)),
  publicKeyHashHexFromRawHex: jest.fn(() => 'ef'.repeat(28)),
  baseAddressBech32FromPublicKeyHashes: jest.fn(() => 'addr1fixture'),
  deriveAccountPublicKeyHex: jest.fn(
    () =>
      '6c2311e6e7a934751c55054cb21ab844f2e55baa48fc8f298dd54430f116d1c14c5f12d15611670454e05efac74e8f5d5e887ae2c15ef3086e0691d0d8439665',
  ),
  addressToHex: jest.fn(
    () => 'e042d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
  ),
  rewardAddressFromAddress: jest.fn(() => 'stake_test1fixture'),
  rewardAddressHexFromAccountPublicKey: jest.fn(
    () => 'e0c11ef08c44f3610b7e56d46e086b90186c12e9a68f0521b7c4c72e4b',
  ),
  rewardAddressDetailsFromAddress: jest.fn(() => ({
    bech32: 'stake_test1fixture',
    keyHashHex: 'ef'.repeat(28),
  })),
}))

// Setup network managers and initialize wallet factories before tests
const mockTokenManagers = {
  [Chain.Network.Mainnet]: createTokenManagerMock(),
  [Chain.Network.Preprod]: createTokenManagerMock(),
  [Chain.Network.Preview]: createTokenManagerMock(),
}
const mockApiMaker = jest.fn().mockReturnValue({
  getProtocolParams: jest.fn().mockResolvedValue({}),
  getBestBlock: jest.fn().mockResolvedValue({}),
  getUtxoData: jest.fn().mockResolvedValue({}),
})
const networkManagers = buildNetworkManagers({
  tokenManagers: mockTokenManagers,
  apiMaker: mockApiMaker,
})

// Create a mock storage with join method
const createMockStorage = (path = '/'): App.Storage => {
  return {
    join: jest.fn(
      (folderName: string): App.Storage =>
        createMockStorage(`${path}${folderName}`),
    ),
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    getAllKeys: jest.fn().mockResolvedValue([]),
    multiGet: jest.fn().mockResolvedValue([]),
    multiSet: jest.fn().mockResolvedValue(undefined),
    multiRemove: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    removeFolder: jest.fn().mockResolvedValue(undefined),
  }
}

const mockCardanoWalletDependencies: CardanoWalletDependencies = {
  rootStorage: createMockStorage(),
  makeWalletEncryptedStorage: jest.fn().mockReturnValue({
    xpriv: {read: jest.fn(), write: jest.fn(), remove: jest.fn()},
    xpub: {read: jest.fn(), write: jest.fn(), remove: jest.fn()},
    clear: jest.fn(),
  }),
  buildPortfolioBalanceManager: jest.fn().mockReturnValue(() => ({
    balanceManager: {
      hydrate: jest.fn(),
      refresh: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      observable$: {subscribe: jest.fn()},
      syncBalances: jest.fn(),
      getPrimaryBalance: jest.fn(),
      getBalances: jest.fn(),
      destroy: jest.fn(),
      clear: jest.fn(),
    },
    balanceStorage: {},
  })),
  toBalanceManagerSyncArgs: jest.fn(),
  makeMemosManager: jest.fn(),
  toLedgerSignRequest: jest.fn(),
  createCollateralEntry: jest.fn(),
}

beforeAll(() => {
  initializeWalletFactories(mockCardanoWalletDependencies, networkManagers)
})

describe('CardanoWallet', () => {
  afterEach(() => AsyncStorage.clear())

  it('build', async () => {
    const accountManagerMakerSpy = jest.spyOn(
      accountManagerApi,
      'accountManagerMaker',
    )
    const ShelleyWalletPreprod = getWalletFactory({
      implementation: 'cardano-cip1852',
      network: Chain.Network.Preprod,
    })
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon oak'
    const accountVisual = 0
    const id = '261c7e0f-dd72-490c-8ce9-6714b512b969'

    // keys
    const {accountPubKeyHex} = keyManager('cardano-cip1852')({
      mnemonic,
      accountVisual,
    })

    const wallet = await ShelleyWalletPreprod.build({
      id,
      accountPubKeyHex,
      accountVisual,
    })

    expect(accountManagerMakerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cardanoWalletBackendNetwork: Chain.Network.Preprod,
      }),
    )
    accountManagerMakerSpy.mockRestore()

    expect(wallet.publicKeyHex).toBe(
      '6c2311e6e7a934751c55054cb21ab844f2e55baa48fc8f298dd54430f116d1c14c5f12d15611670454e05efac74e8f5d5e887ae2c15ef3086e0691d0d8439665',
    )
    expect(wallet.rewardAddressHex).toBe(
      'e0c11ef08c44f3610b7e56d46e086b90186c12e9a68f0521b7c4c72e4b',
    )
    expect(wallet.usesCurrentStateUtxos).toBe(false)
  })

  it('builds a Shelley wallet with the current-state manager when enabled', async () => {
    mockCardanoWalletDependencies.cardanoWalletBackendUrl =
      'https://wallet-backend.example.com'
    mockCardanoWalletDependencies.currentStateUtxoEnabled = true
    mockCardanoWalletDependencies.makePendingUtxoOverlayStore =
      createPersistentPendingUtxoOverlayStore

    try {
      const ShelleyWalletPreprod = getWalletFactory({
        implementation: 'cardano-cip1852',
        network: Chain.Network.Preprod,
      })
      const wallet = await ShelleyWalletPreprod.build({
        id: '261c7e0f-dd72-490c-8ce9-6714b512b969',
        accountPubKeyHex:
          '6c2311e6e7a934751c55054cb21ab844f2e55baa48fc8f298dd54430f116d1c14c5f12d15611670454e05efac74e8f5d5e887ae2c15ef3086e0691d0d8439665',
        accountVisual: 0,
      })

      expect(wallet.usesCurrentStateUtxos).toBe(true)
    } finally {
      delete mockCardanoWalletDependencies.cardanoWalletBackendUrl
      delete mockCardanoWalletDependencies.currentStateUtxoEnabled
      delete mockCardanoWalletDependencies.makePendingUtxoOverlayStore
    }
  })

  it('updates in-memory UTxOs immediately after saving a pending overlay', async () => {
    mockCardanoWalletDependencies.cardanoWalletBackendUrl =
      'https://wallet-backend.example.com'
    mockCardanoWalletDependencies.currentStateUtxoEnabled = true
    let pendingOverlays: PendingUtxoOverlay[] = []
    let failOverlayRemoval = false
    const removalError = new Error('overlay storage unavailable')
    const pendingStore = {
      getPendingUtxoOverlaysInSubmissionOrder: async () => pendingOverlays,
      savePendingUtxoOverlay: async (
        _stakeAddress: string,
        pending: PendingUtxoOverlay,
      ) => {
        pendingOverlays = [...pendingOverlays, pending]
      },
      replacePendingUtxoOverlays: async (
        _stakeAddress: string,
        pending: ReadonlyArray<PendingUtxoOverlay>,
      ) => {
        pendingOverlays = [...pending]
      },
      removePendingUtxoOverlay: async (
        _stakeAddress: string,
        txHash: PendingUtxoOverlay['txHash'],
      ) => {
        if (failOverlayRemoval) throw removalError
        pendingOverlays = pendingOverlays.filter(
          (pending) => pending.txHash !== txHash,
        )
      },
      clearPendingUtxoOverlays: async () => {
        pendingOverlays = []
      },
      clearPendingUtxoOverlaysForFullResync: async () => {
        pendingOverlays = []
      },
    } as PersistentPendingUtxoOverlayStore
    mockCardanoWalletDependencies.makePendingUtxoOverlayStore = () =>
      pendingStore
    const output = {
      utxoId: Branded.asUtxoId(`${'b'.repeat(64)}:0`),
      txHash: Branded.asTransactionHash('b'.repeat(64)),
      txIndex: 0,
      receiver: Branded.asAddress('addr_test1fixture'),
      amount: '5000000' as Balance.Quantity,
      assets: [],
    }
    const spendableOutput: PendingUtxoOverlay['createdUtxos'][number] = {
      ...output,
      utxoId: Branded.asUtxoId(`${'b'.repeat(64)}:1`),
      txIndex: 1,
      amount: '1000000' as Balance.Quantity,
    }
    const overlay: PendingUtxoOverlay = {
      txHash: output.txHash,
      spentUtxoIds: [Branded.asUtxoId(`${'a'.repeat(64)}:0`)],
      createdUtxos: [output, spendableOutput],
    }
    const overlaySpy = jest
      .spyOn(pendingOverlayApi, 'createPendingUtxoOverlayFromCbor')
      .mockReturnValue(overlay)
    const submitSpy = jest
      .spyOn(legacyApi, 'submitTransaction')
      .mockResolvedValue(undefined)
    const txStatusSpy = jest
      .spyOn(legacyApi, 'fetchTxStatus')
      .mockResolvedValue({
        submissionStatus: {
          ['b'.repeat(64)]: {status: 'FAILED'},
        },
      } as Awaited<ReturnType<typeof legacyApi.fetchTxStatus>>)

    try {
      const ShelleyWalletPreprod = getWalletFactory({
        implementation: 'cardano-cip1852',
        network: Chain.Network.Preprod,
      })
      const wallet = await ShelleyWalletPreprod.build({
        id: 'current-state-pending-overlay-wallet',
        accountPubKeyHex:
          '6c2311e6e7a934751c55054cb21ab844f2e55baa48fc8f298dd54430f116d1c14c5f12d15611670454e05efac74e8f5d5e887ae2c15ef3086e0691d0d8439665',
        accountVisual: 0,
      })
      const utxoEvents: Array<Array<{utxo_id: string}>> = []
      wallet.subscribe((event) => {
        if (event.type === 'utxos') utxoEvents.push(event.utxos)
      })

      await wallet.submitTransaction('AQID' as TransactionCborBase64)

      expect(wallet.usesCurrentStateUtxos).toBe(true)
      expect(overlaySpy).toHaveBeenCalledTimes(1)
      expect(submitSpy).toHaveBeenCalledTimes(1)
      expect(wallet.utxos()).toEqual([
        expect.objectContaining({utxo_id: spendableOutput.utxoId}),
      ])
      expect(wallet.collateralId()).toBe('')
      expect(utxoEvents.at(-1)).toEqual([
        expect.objectContaining({utxo_id: spendableOutput.utxoId}),
      ])
      expect(submitSpy).toHaveBeenCalledTimes(1)

      const submissionError = new Error('transaction rejected')
      submitSpy.mockRejectedValue(submissionError)
      failOverlayRemoval = true
      await expect(
        wallet.submitTransaction('AQID' as TransactionCborBase64),
      ).rejects.toBe(submissionError)
    } finally {
      overlaySpy.mockRestore()
      submitSpy.mockRestore()
      txStatusSpy.mockRestore()
      delete mockCardanoWalletDependencies.cardanoWalletBackendUrl
      delete mockCardanoWalletDependencies.currentStateUtxoEnabled
      delete mockCardanoWalletDependencies.makePendingUtxoOverlayStore
    }
  })

  it('does not enable read-only discovery with a whitespace-only backend URL', async () => {
    const readOnlyAccountManagerSpy = jest.spyOn(
      readOnlyAccountManagerApi,
      'readOnlyAccountManagerMaker',
    )
    mockCardanoWalletDependencies.cardanoWalletBackendUrl = '   '
    mockCardanoWalletDependencies.currentStateUtxoEnabled = true

    try {
      const ShelleyWalletPreprod = getWalletFactory({
        implementation: 'cardano-cip1852',
        network: Chain.Network.Preprod,
      })
      await ShelleyWalletPreprod.build({
        id: 'read-only-whitespace-backend',
        accountVisual: 0,
        readOnlyAddresses: {knownAddress: 'addr_test1fixture'},
      })

      expect(readOnlyAccountManagerSpy).toHaveBeenCalledWith(
        expect.objectContaining({currentStateSource: undefined}),
      )
    } finally {
      readOnlyAccountManagerSpy.mockRestore()
      delete mockCardanoWalletDependencies.cardanoWalletBackendUrl
      delete mockCardanoWalletDependencies.currentStateUtxoEnabled
    }
  })
})

describe('selectUtxoBackend', () => {
  it('selects current-state reads for configured Shelley wallets with stake credentials', () => {
    expect(
      selectUtxoBackend({
        backendUrl: ' https://wallet-backend.example.com/// ',
        enabled: true,
        implementation: 'cardano-cip1852',
        rewardAddressHex: 'e0c11ef0',
      }),
    ).toEqual({
      kind: 'current-state',
      baseUrl: 'https://wallet-backend.example.com',
    })
  })

  it.each([
    ['Byron', 'cardano-bip44', ''],
    ['Shelley without a stake credential', 'cardano-cip1852', ''],
  ] as const)(
    'keeps %s on the explicit fallback',
    (_name, implementation, rewardAddressHex) => {
      expect(
        selectUtxoBackend({
          backendUrl: 'https://wallet-backend.example.com',
          implementation,
          rewardAddressHex,
        }),
      ).toEqual({kind: 'legacy', reason: 'unsupported-wallet'})
    },
  )

  it('keeps the explicit legacy path when no backend is configured', () => {
    expect(
      selectUtxoBackend({
        implementation: 'cardano-cip1852',
        rewardAddressHex: 'e0c11ef0',
      }),
    ).toEqual({kind: 'legacy', reason: 'not-configured'})
  })

  it('treats whitespace-only backend URLs as not configured', () => {
    expect(
      selectUtxoBackend({
        backendUrl: '   ',
        enabled: true,
        implementation: 'cardano-cip1852',
        rewardAddressHex: 'e0c11ef0',
      }),
    ).toEqual({kind: 'legacy', reason: 'not-configured'})
  })

  it('does not enable the current-state source until backend completeness is verified', () => {
    expect(
      selectUtxoBackend({
        backendUrl: 'https://wallet-backend.example.com',
        implementation: 'cardano-cip1852',
        rewardAddressHex: 'e0c11ef0',
      }),
    ).toEqual({kind: 'legacy', reason: 'not-enabled'})
  })
})
