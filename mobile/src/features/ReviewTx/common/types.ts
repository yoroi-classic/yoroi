import {
  CertificateKind,
  type ChainValidationResult,
  type DecodedDatum,
  type Proposal,
  type ReferenceScript,
  type Vote,
} from '@yoroi/tx'
import {Balance, Portfolio} from '@yoroi/types'

export type TransactionInput = {transaction_id: string; index: number}
export type TransactionOutput = {
  address: string
  amount: {
    coin: string
    multiasset?: Record<string, Record<string, string>>
  }
}
export type TransactionInputs = TransactionInput[]
export type TransactionOutputs = TransactionOutput[]
export type TransactionBody = {
  inputs: TransactionInputs
  outputs: TransactionOutputs
  reference_inputs?: TransactionInputs
  fee: string
  certs?: Array<Record<string, unknown>> | null
  mint?: Array<[string, Record<string, string>]> | null
  auxiliary_data_hash?: string | null
  cmlReviewInfo?: CmlTransactionReviewInfo
}

export type CmlReviewInput = {transactionIdHex: string; index: string}
export type CmlReviewAsset = {
  policyIdHex: string
  assetNameHex: string
  quantity: string
}
export type CmlReviewOutput = {
  address: string | null
  addressHex: string
  networkId: string | null
  addressKind: string
  lovelace: string
  assets: CmlReviewAsset[]
  datum:
    | {kind: 'hash'; hashHex: string}
    | {kind: 'inline'; cborHex: string}
    | null
  scriptRef: {
    type: string
    hashHex: string
    size: string
    bytesHex: string | null
    cborHex: string
  } | null
  cborHex: string
}
export type CmlTransactionReviewInfo = {
  transactionIdHex: string
  isValid: boolean
  body: {
    cborHex: string
    inputs: CmlReviewInput[]
    outputs: CmlReviewOutput[]
    fee: string
    ttl: string | null
    validityIntervalStart: string | null
    certificates: unknown[] | null
    withdrawals: Array<{
      rewardAddress: string
      rewardAddressHex: string
      amount: string
    }> | null
    mint: unknown
    scriptDataHashHex: string | null
    collateralInputs: CmlReviewInput[] | null
    requiredSigners: string[] | null
    networkId: string | null
    collateralReturn: CmlReviewOutput | null
    totalCollateral: string | null
    referenceInputs: CmlReviewInput[] | null
    votingProcedures: unknown
    proposalProcedures: unknown
    currentTreasuryValue: string | null
    donation: string | null
    auxiliaryDataHashHex?: string | null
  }
  witnessSet: {
    cborHex: string
    vkeys: Array<{publicKeyHex: string; signatureHex: string}>
    bootstraps: Array<{
      publicKeyHex: string
      signatureHex: string
      chainCodeHex: string
      attributes: unknown
    }>
    nativeScripts: Array<{hashHex: string; cborHex: string}>
    plutusScripts: Array<{
      type: string
      hashHex: string
      bytesHex: string
      cborHex: string
    }>
    plutusDataCborHex: string[]
    redeemers: unknown
    cmlJson: unknown
  }
  auxiliaryData: {
    cborHex: string
    metadata: Array<{
      label: string
      json: unknown
      basicConversionsJson: string | null
      cmlJson: unknown
    }>
    nativeScripts: Array<{hashHex: string; cborHex: string}>
    plutusScripts: Array<{
      type: string
      hashHex: string
      bytesHex: string
      cborHex: string
    }>
    cmlJson: unknown
  } | null
}

export type FormattedInput = {
  assets: Array<{
    tokenInfo: Portfolio.Token.Info
    quantity: Balance.Quantity
  }>
  address: string | undefined
  addressKind: 0 | 1 | null
  rewardAddress: string | null
  ownAddress: boolean | null
  txIndex: number
  txHash: string
  resolvedName?: string | null // Resolved alias (AdaHandle, CNS, etc.)
  contractInfo?: {
    name?: string
    purpose?: string
    description?: string
  } | null // Smart contract information
  referenceScript?: ReferenceScript | null // Reference script if present
}

export type FormattedInputs = Array<FormattedInput>

export type FormattedOutput = {
  assets: Array<{
    tokenInfo: Portfolio.Token.Info
    quantity: Balance.Quantity
  }>
  address: string
  addressKind: 0 | 1 | null
  rewardAddress: string | null
  ownAddress: boolean
  resolvedName?: string | null // Resolved alias (AdaHandle, CNS, etc.)
  contractInfo?: {
    name?: string
    purpose?: string
    description?: string
  } | null // Smart contract information
  datum?: {
    type: 'hash' | 'inline' | 'embedded'
    hash: string
    data?: string // PlutusData hex (if available)
    decoded?: DecodedDatum | null // Decoded datum for display
    json?: unknown | null // JSON representation if available
  } | null // Datum information
  referenceScript?: ReferenceScript | null // Reference script if present
}

export type FormattedOutputs = Array<FormattedOutput>

export type FormattedFee = {
  tokenInfo: Portfolio.Token.Info
  quantity: Balance.Quantity
}

export type FormattedWithdrawal = {
  address: string
  amount: Balance.Quantity
  tokenInfo: Portfolio.Token.Info
}

export type FormattedWithdrawals = Array<FormattedWithdrawal>

export type FormattedWitness = {
  type: 'vkey' | 'bootstrap' | 'nativeScript' | 'plutusScript'
  publicKey?: string // For vkey and bootstrap
  signature?: string // For vkey and bootstrap
  scriptHash?: string // For native and plutus scripts
  scriptBytes?: string // For plutus scripts
  chaincode?: string // For bootstrap
  attributes?: string // For bootstrap
}

export type FormattedWitnessSet = {
  vkeys: Array<{publicKey: string; signature: string}>
  bootstraps: Array<{
    publicKey: string
    signature: string
    chaincode: string
    attributes: string
  }>
  nativeScripts: Array<{scriptHash: string}>
  plutusScripts: Array<{scriptHash: string; scriptBytes: string}>
  plutusData: Array<{data: string; decoded?: unknown}>
}

export type FormattedTx = {
  inputs: FormattedInputs
  outputs: FormattedOutputs
  fee: FormattedFee
  certificates: FormattedCertificate[] | null
  mint: Array<[Portfolio.Token.Info, string]> | null
  referenceInputs: FormattedInputs
  withdrawals: FormattedWithdrawals | null
  collateral: FormattedInputs | null
  collateralReturn: FormattedOutput | null
  totalCollateral: FormattedFee | null
  requiredSigners: string[] | null // Ed25519 key hashes
  scriptDataHash: string | null
  ttl: number | null
  validityIntervalStart: number | null
  networkId: number | null
  witnessSet: FormattedWitnessSet | null
  governance?: {
    proposals: Proposal[]
    votes: Vote[]
  } | null // Governance actions (proposals and votes)
  chainInfo?: {
    isChained: boolean
    chainOrder?: number
    validationResult?: ChainValidationResult
  } | null // Transaction chaining information
}

export type FormattedMetadata = {
  hash: string | null
  metadata: {msg: Array<string>} | null
  allLabels: Record<string, unknown> | null // All metadata labels, not just 674
  scripts: Array<{scriptHash: string; scriptBytes: string}> | null // Scripts in auxiliary data
}

// Minimal certificate with just type (for historical transactions)
type MinimalCertificate = {
  type: CertificateType
  value: Partial<Record<string, unknown>>
}

export type FormattedCertificate = MinimalCertificate

// Re-export CertificateKind from @yoroi/tx as CertificateType for backward compatibility
export const CertificateType = CertificateKind
export type CertificateType = CertificateKind
