import {
  Address,
  Amount,
  Balance,
  KeyHash,
  ScriptHash,
  TransactionCbor,
} from '@yoroi/types'

import type {MintAction} from '../minting/types'
import {Datum} from '../types'
/**
 * JSON-serializable value types for transaction metadata
 * Re-exported from types/index to avoid duplication
 */
import type {MetadataDataValue, TransactionMetadata} from '../types'
import {ModernUtxo} from '../utxo/models'

export type TransactionOutput = {
  address: Address
  amounts: Balance.Amounts
  datum?: Datum
}

export type TransactionInput = {
  utxo: ModernUtxo
  /** Native-script UTxOs require the witness script and its required signer count. */
  kind?: 'paymentKey' | 'nativeScript'
  nativeScriptCborHex?: string
  nativeScriptWitnessCount?: string
}

/**
 * Certificate kind enum - matches CertificateType from ReviewTx
 */
export const CertificateKind = {
  StakeRegistration: 'StakeRegistration',
  StakeDeregistration: 'StakeDeregistration',
  StakeDelegation: 'StakeDelegation',
  PoolRegistration: 'PoolRegistration',
  PoolRetirement: 'PoolRetirement',
  GenesisKeyDelegation: 'GenesisKeyDelegation',
  MoveInstantaneousRewardsCert: 'MoveInstantaneousRewardsCert',
  CommitteeHotAuth: 'CommitteeHotAuth',
  CommitteeColdResign: 'CommitteeColdResign',
  DRepDeregistration: 'DRepDeregistration',
  DRepRegistration: 'DRepRegistration',
  DRepUpdate: 'DRepUpdate',
  VoteDelegation: 'VoteDelegation',
  StakeAndVoteDelegation: 'StakeAndVoteDelegation',
  StakeRegistrationAndDelegation: 'StakeRegistrationAndDelegation',
  StakeVoteRegistrationAndDelegation: 'StakeVoteRegistrationAndDelegation',
  VoteRegistrationAndDelegation: 'VoteRegistrationAndDelegation',
} as const

export type CertificateKind =
  (typeof CertificateKind)[keyof typeof CertificateKind]

/**
 * DRep value type - matches DRepValue from @yoroi/staking
 */
export type DRepValue =
  | 'AlwaysAbstain'
  | 'AlwaysNoConfidence'
  | {KeyHash: KeyHash}
  | {ScriptHash: ScriptHash}

/**
 * Certificate data for transaction building
 * Based on RemoteCertificateMeta from @yoroi/staking but adapted for transaction builder:
 * - Uses stakeCredentialKeyHashHex instead of rewardAddress (extracted from address)
 * - Uses 'kind' field to match RemoteCertificateMeta pattern
 * - Stores only JSON-serializable certificate fields for the CML recipe adapter
 */
export type TransactionCertificate =
  | {
      kind: 'StakeRegistration'
      stakeCredentialKeyHashHex: KeyHash
    }
  | {
      kind: 'StakeDeregistration'
      stakeCredentialKeyHashHex: KeyHash
    }
  | {
      kind: 'StakeDelegation'
      stakeCredentialKeyHashHex: KeyHash
      poolKeyHash: KeyHash
    }
  | {
      kind: 'PoolRegistration'
      poolParams: Record<string, unknown>
    }
  | {
      kind: 'PoolRetirement'
      poolKeyHash: KeyHash
      epoch: string
    }
  | {
      kind: 'MoveInstantaneousRewardsCert'
      rewards: Array<{
        credential: {kind: 'key' | 'script'; hashHex: string}
        amount: Amount
      }>
      pot: 0 | 1
    }
  | {
      kind: 'GenesisKeyDelegation'
      genesisHashHex: string
      genesisDelegateHashHex: string
      vrfKeyHashHex: string
    }
  | {
      kind: 'CommitteeHotAuth'
      coldCredential: {kind: 'key' | 'script'; hashHex: string}
      hotCredential: {kind: 'key' | 'script'; hashHex: string}
    }
  | {
      kind: 'CommitteeColdResign'
      coldCredential: {kind: 'key' | 'script'; hashHex: string}
      anchor?: {url: string; dataHashHex: string}
    }
  | {
      kind: 'DRepDeregistration'
      credential: {kind: 'key' | 'script'; hashHex: string}
      deposit: Amount
    }
  | {
      kind: 'DRepRegistration'
      credential: {kind: 'key' | 'script'; hashHex: string}
      deposit: Amount
      anchor?: {url: string; dataHashHex: string}
    }
  | {
      kind: 'DRepUpdate'
      credential: {kind: 'key' | 'script'; hashHex: string}
      anchor?: {url: string; dataHashHex: string}
    }
  | {
      kind: 'VoteDelegation'
      stakeCredentialKeyHashHex: KeyHash
      drep: DRepValue
    }
  | {
      kind: 'StakeAndVoteDelegation'
      stakeCredentialKeyHashHex: KeyHash
      poolKeyHash?: KeyHash
      drep?: DRepValue | null
    }
  | {
      kind: 'StakeRegistrationAndDelegation'
      stakeCredentialKeyHashHex: KeyHash
      poolKeyHash?: KeyHash
    }
  | {
      kind: 'StakeVoteRegistrationAndDelegation'
      stakeCredentialKeyHashHex: KeyHash
      poolKeyHash?: KeyHash
      drep?: DRepValue | null
    }
  | {
      kind: 'VoteRegistrationAndDelegation'
      stakeCredentialKeyHashHex: KeyHash
      drep?: DRepValue | null
    }

export type TransactionWithdrawal = {
  rewardAddress: Address
  amount: Amount
}

export type TransactionReferenceInput = {
  utxo: ModernUtxo
}

export type ScriptInput = {
  utxo: ModernUtxo
  scriptHash: string
  /** Inline Plutus witness bytes; older callers stored these in scriptHash. */
  inlineScriptCborHex?: string
  /** Language for an inline witness; legacy inline values default to V1. */
  plutusVersion?: 'v1' | 'v2' | 'v3'
  redeemer: string // Redeemer PlutusData CBOR hex
  redeemerExUnits: {mem: string; steps: string}
  referenceScriptUtxo?: {
    txHash: string
    txIndex: number
    langVersion: 'v1' | 'v2' | 'v3'
    scriptSize: number
    output?: {
      address: string
      lovelace: string
      assets: Array<{policyIdHex: string; assetNameHex: string; quantity: string}>
      scriptCborHex: string
    }
  }
  datumSource: 'inline' | {data: string} // 'inline' = from UTxO, or explicit data hex
}

export type {MetadataDataValue}

export type TransactionOptions = {
  changeAddress?: Address
  ttl?: number
  validityInterval?: {
    start: number
    end: number
  }
  metadata?: TransactionMetadata[]
  manualChangeOutput?: TransactionOutput
  manualFee?: Balance.Amounts
  mints?: MintAction[] // Minting actions
}

export type UnsignedTransaction = {
  inputs: TransactionInput[]
  outputs: TransactionOutput[]
  certificates: TransactionCertificate[]
  withdrawals: TransactionWithdrawal[]
  referenceInputs: TransactionReferenceInput[]
  collateralInputs: TransactionInput[]
  metadata?: TransactionMetadata[]
  options: TransactionOptions
  cbor?: TransactionCbor // CBOR hex string
}
