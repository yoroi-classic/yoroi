import {
  FundInfoResponse,
  RawUtxo,
  TipStatusResponse,
  TxStatusRequest,
  TxStatusResponse,
} from '@yoroi/api'
import {
  AccountStates,
  StakePoolInfoRequest,
  StakePoolInfosAndHistories,
  StakingInfo,
  StakingStatus,
} from '@yoroi/staking'
import {
  Addressing as AddressingType,
  CardanoAddressedUtxo as CardanoAddressedUtxoType,
  StakingKeyBalances as StakingKeyBalancesType,
  TokenEntry as TokenEntryType,
  UnsignedTransaction,
} from '@yoroi/tx'
import type {TransactionMetadata as TxMetadataFromTypes} from '@yoroi/types'
import {
  Address,
  Api,
  App,
  Balance,
  HW,
  Network,
  Portfolio,
  TransactionCborBase64,
  Wallet,
  WalletTransaction,
} from '@yoroi/types'

import {WalletChecksum as WalletChecksumType} from '@emurgo/cip4-js'

import {AddressChain} from './account-manager/account-manager'
import {ReadOnlyAddressChain} from './account-manager/read-only-account-manager'
import type {CardanoWalletDependencies} from './dependencies'
import {WalletEncryptedStorage} from './dependencies'
import type {ManualAddress} from './storage/manual-address-storage'

export type WalletEvent =
  | {type: 'initialize'}
  | {type: 'transactions'}
  | {type: 'addresses'; addresses: Address[]}
  | {type: 'utxos'; utxos: RawUtxo[]}
  | {type: 'collateral-id'; collateralId: RawUtxo['utxo_id']}

export type WalletSubscription = (event: WalletEvent) => void
type Unsubscribe = () => void

export type ServerStatus = {
  isServerOk: boolean
  isMaintenance: boolean
  serverTime: number | undefined
  isQueueOnline?: boolean
}

export type Pagination = {
  page: number
  limit: number
}

export type YoroiWallet = {
  id: string
  publicKeyHex: string
  protocolParams: Api.Cardano.ProtocolParams
  readonly portfolioPrimaryTokenInfo: Readonly<Portfolio.Token.Info>

  // ---------------------------------------------------------------------------------------
  //                     ########## Interface  -  V2 ##########
  // network
  readonly networkManager: Readonly<Network.Manager>
  readonly isMainnet: boolean

  // portfolio
  readonly balanceManager: Readonly<Portfolio.Manager.Balance>
  readonly balance$: Readonly<Portfolio.Manager.Balance['observable$']>
  balances(): ReturnType<Portfolio.Manager.Balance['getBalances']>
  primaryBalance(): ReturnType<Portfolio.Manager.Balance['getPrimaryBalance']>
  primaryBreakdown(): ReturnType<
    Portfolio.Manager.Balance['getPrimaryBreakdown']
  >
  isEmpty(): boolean
  hasOnlyPrimary(): boolean

  // account
  readonly accountVisual: number

  // sync
  resync(): Promise<void>
  clear(): Promise<void>
  sync(params: {
    isForced?: boolean
    tipStatus?: TipStatusResponse | null
  }): Promise<void>
  quickSync(params: {
    isForced?: boolean
    tipStatus?: TipStatusResponse | null
  }): Promise<void>
  // ---------------------------------------------------------------------------------------

  receiveAddressInfo(): Readonly<{
    lastUsedIndexVisual: number
    lastUsedIndex: number
    canIncrease: boolean
  }>

  // API
  api: App.Api

  signRawTx(
    txHex: string,
    rootKeyHex: string,
    signerPaths: number[][],
  ): Promise<Uint8Array | undefined>

  getAddressing(address: string): {path: number[]; startLevel: number}
  getManualAddresses(): Promise<Array<ManualAddress>>

  // Sending
  signTx(signRequest: UnsignedTransaction, rootKey: string): Promise<Uint8Array>
  submitTransaction(signedTx: TransactionCborBase64): Promise<void>

  // Ledger
  signTxWithLedger(
    request: UnsignedTransaction,
    useUSB: boolean,
    hwDeviceInfo: HW.DeviceInfo,
  ): Promise<Uint8Array>
  ledgerSupportsCIP36(
    useUSB: boolean,
    hwDeviceInfo: HW.DeviceInfo,
  ): Promise<boolean>
  ledgerSupportsCIP1694(
    useUSB: boolean,
    hwDeviceInfo: HW.DeviceInfo,
  ): Promise<boolean>
  signRawTxWithLedger(
    cbor: string,
    useUSB: boolean,
    hwDeviceInfo: HW.DeviceInfo,
  ): Promise<void>

  // Voting
  fetchFundInfo(): Promise<FundInfoResponse>

  // Staking
  rewardAddressHex: string
  getDelegationStatus(): StakingStatus
  getAllUtxosForKey(): Array<CardanoTypes.CardanoAddressedUtxo>
  getStakingInfo: () => Promise<StakingInfo>
  fetchAccountState(): Promise<AccountStates>
  fetchPoolInfo(
    request: StakePoolInfoRequest,
  ): Promise<StakePoolInfosAndHistories>
  getStakingKey(): CardanoTypes.PublicKey

  // Password
  encryptedStorage: WalletEncryptedStorage

  // Account -> Chains (exposed directly)
  externalChain: AddressChain | ReadOnlyAddressChain
  internalChain: AddressChain | ReadOnlyAddressChain

  // Account -> Addresses
  externalAddresses(): Address[]
  internalAddresses(): Address[]
  isUsedAddressIndex(): Record<string, boolean>
  receiveAddresses(): Address[]
  generateNewReceiveAddress(): boolean
  getChangeAddress(addressMode: Wallet.AddressMode): string

  // Balances, TxDetails
  saveMemo(txId: string, memo: string): Promise<void>
  getRawTransaction(txId: string): WalletTransaction | undefined
  getRawTransactions(): Record<string, WalletTransaction>
  confirmationCounts(): Record<string, null | number>
  fetchTxStatus(request: TxStatusRequest): Promise<TxStatusResponse>
  addOptimisticTransaction(tx: WalletTransaction): void

  // Utxos
  utxos(): Array<RawUtxo>
  allUtxos(): Array<RawUtxo>
  collateralId(): string
  getCollateralInfo(): {
    utxo: RawUtxo | undefined
    amount: Portfolio.Token.Amount
    collateralId: RawUtxo['utxo_id']
    isConfirmed: boolean
  }
  setCollateralId(collateralId: RawUtxo['utxo_id']): void

  // Other
  subscribe: (subscription: WalletSubscription) => Unsubscribe
  subscribeOnTxHistoryUpdate(handler: () => void): () => void
  checkServerStatus(): Promise<ServerStatus>

  // CIP36 Payment Address
  getFirstPaymentAddress(): Address

  // Backend-zero wallet registration
  getWalletContext?():
    | {
        walletId: string
        publicKeyHex?: string
        accountPubKeyHex?: string
        paymentKeyHashes: string[]
        rewardAddresses: string[]
      }
    | undefined

  // Internal dependencies (exposed for extensions)
  _dependencies: {
    toLedgerSignRequest: CardanoWalletDependencies['toLedgerSignRequest']
    createCollateralEntry: CardanoWalletDependencies['createCollateralEntry']
    toBalanceManagerSyncArgs: CardanoWalletDependencies['toBalanceManagerSyncArgs']
  }
}

export const isYoroiWallet = (wallet: unknown): wallet is YoroiWallet => {
  return (
    !!wallet &&
    typeof wallet === 'object' &&
    yoroiWalletKeys.every((key) => key in wallet)
  )
}

const yoroiWalletKeys: Array<keyof YoroiWallet> = [
  'id',
  'publicKeyHex',

  // Portfolio
  'balance$',
  'balances',
  'primaryBalance',
  'primaryBreakdown',

  // Sending
  'signTxWithLedger',
  'signTx',
  'submitTransaction',

  // Voting
  'fetchFundInfo',

  // Staking
  'rewardAddressHex',
  'getDelegationStatus',
  'getAllUtxosForKey',
  'getStakingInfo',
  'fetchAccountState',
  'fetchPoolInfo',

  // Password
  'encryptedStorage',

  // Addresses
  'externalChain',
  'internalChain',
  'externalAddresses',
  'internalAddresses',
  'isUsedAddressIndex',
  'receiveAddresses',
  'generateNewReceiveAddress',

  // Sync, Save
  'resync',
  'clear',
  'sync',
  'saveMemo',

  // Balances, TxDetails
  'getRawTransaction',
  'getRawTransactions',
  'confirmationCounts',
  'fetchTxStatus',

  // Other
  'subscribe',
  'subscribeOnTxHistoryUpdate',
  'checkServerStatus',
  'utxos',
]

export namespace CardanoTypes {
  export type TxMetadata = TxMetadataFromTypes
  export type CardanoAddressedUtxo = CardanoAddressedUtxoType
  export type SignedTx = Uint8Array
  export type UnsignedTx = UnsignedTransaction
  export type MultiTokenValue = Balance.Amounts // Use Balance.Amounts directly
  export type StakingKeyBalances = StakingKeyBalancesType
  export type WalletChecksum = WalletChecksumType

  export type Addressing = AddressingType
  export type PublicKey = {
    toHex(): string
    hash(): {toHex(): string; toBytes(): Uint8Array}
  }
  export type TokenEntry = TokenEntryType
}

export {
  NoOutputsError,
  NotEnoughMoneyToSendError,
  RegistrationStatus,
} from '@yoroi/tx'
