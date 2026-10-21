// Functional transaction builder backed by the CML recipe bridge.
import {primaryTokenId as defaultPrimaryTokenId} from '@yoroi/portfolio'
import {
  Address,
  Balance,
  BalanceQuantity,
  Portfolio,
  TransactionCbor,
  TransactionHash,
  UtxoId,
} from '@yoroi/types'

import {NoOutputsError} from '../errors'
import {CardanoHaskellConfig, Datum, TransactionMetadata} from '../types'
import {ModernUtxo} from '../utxo/models'
import {buildCmlTransactionRecipe} from './cml-recipe'
import type {
  ScriptInput,
  TransactionCertificate,
  TransactionInput,
  TransactionOptions,
  TransactionOutput,
  TransactionReferenceInput,
  TransactionWithdrawal,
  UnsignedTransaction,
} from './types'

/**
 * Transaction builder state (immutable)
 */
export type TransactionBuilderState = {
  inputs: TransactionInput[]
  outputs: TransactionOutput[]
  certificates: TransactionCertificate[]
  withdrawals: TransactionWithdrawal[]
  referenceInputs: TransactionReferenceInput[]
  collateralInputs: TransactionInput[]
  scriptInputs: ScriptInput[]
  metadata: TransactionMetadata[]
  options: TransactionOptions
  excludedUtxos: Set<UtxoId>
}

/**
 * Create initial transaction builder state
 */
export function createTransactionBuilder(): TransactionBuilderState {
  return {
    inputs: [],
    outputs: [],
    certificates: [],
    withdrawals: [],
    referenceInputs: [],
    collateralInputs: [],
    scriptInputs: [],
    metadata: [],
    options: {
      mints: [],
    },
    excludedUtxos: new Set(),
  }
}

/**
 * Get exclusion key for a UTXO
 */
function getExclusionKey(txHash: TransactionHash, txIndex: number): UtxoId {
  return `${txHash}:${txIndex}` as UtxoId
}

/**
 * Check if a UTXO is excluded
 */
function isExcluded(utxo: ModernUtxo, excludedUtxos: Set<UtxoId>): boolean {
  return excludedUtxos.has(getExclusionKey(utxo.txHash, utxo.txIndex))
}

// Input operations
export function addInput(
  state: TransactionBuilderState,
  utxo: ModernUtxo,
): TransactionBuilderState {
  return {
    ...state,
    inputs: [...state.inputs, {utxo}],
  }
}

/** Add a UTxO locked by a native script with explicit signer-count metadata. */
export function addNativeScriptInput(
  state: TransactionBuilderState,
  utxo: ModernUtxo,
  nativeScriptCborHex: string,
  nativeScriptWitnessCount: number,
): TransactionBuilderState {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(nativeScriptCborHex)) {
    throw new Error('Native script input requires valid script CBOR hex')
  }
  if (
    !Number.isSafeInteger(nativeScriptWitnessCount) ||
    nativeScriptWitnessCount < 0
  ) {
    throw new Error(
      'Native script input requires a non-negative safe witness count',
    )
  }
  return {
    ...state,
    inputs: [
      ...state.inputs,
      {
        utxo,
        kind: 'nativeScript',
        nativeScriptCborHex,
        nativeScriptWitnessCount: String(nativeScriptWitnessCount),
      },
    ],
  }
}

export function addInputs(
  state: TransactionBuilderState,
  utxos: ModernUtxo[],
): TransactionBuilderState {
  return utxos.reduce((acc, utxo) => addInput(acc, utxo), state)
}

export function removeInput(
  state: TransactionBuilderState,
  txHash: TransactionHash,
  txIndex: number,
): TransactionBuilderState {
  return {
    ...state,
    inputs: state.inputs.filter(
      (input) => input.utxo.txHash !== txHash || input.utxo.txIndex !== txIndex,
    ),
  }
}

// Output operations
export function addOutput(
  state: TransactionBuilderState,
  address: Address | string,
  amounts: Balance.Amounts,
  datum?: Datum,
): TransactionBuilderState {
  const addr = typeof address === 'string' ? (address as Address) : address
  return {
    ...state,
    outputs: [...state.outputs, {address: addr, amounts, datum}],
  }
}

export function addOutputs(
  state: TransactionBuilderState,
  outputs: TransactionOutput[],
): TransactionBuilderState {
  return {
    ...state,
    outputs: [...state.outputs, ...outputs],
  }
}

// Certificate operations
export function addCertificate(
  state: TransactionBuilderState,
  cert: TransactionCertificate,
): TransactionBuilderState {
  return {
    ...state,
    certificates: [...state.certificates, cert],
  }
}

export function addCertificates(
  state: TransactionBuilderState,
  certs: TransactionCertificate[],
): TransactionBuilderState {
  return certs.reduce((acc, cert) => addCertificate(acc, cert), state)
}

// Withdrawal operations
export function addWithdrawal(
  state: TransactionBuilderState,
  rewardAddress: Address | string,
  amount: BalanceQuantity | string,
): TransactionBuilderState {
  const addr =
    typeof rewardAddress === 'string'
      ? (rewardAddress as Address)
      : rewardAddress
  const amt = typeof amount === 'string' ? (amount as BalanceQuantity) : amount
  return {
    ...state,
    withdrawals: [...state.withdrawals, {rewardAddress: addr, amount: amt}],
  }
}

// Reference input operations
export function addReferenceInput(
  state: TransactionBuilderState,
  utxo: ModernUtxo,
): TransactionBuilderState {
  return {
    ...state,
    referenceInputs: [...state.referenceInputs, {utxo}],
  }
}

// Collateral input operations
export function addCollateralInput(
  state: TransactionBuilderState,
  utxo: ModernUtxo,
): TransactionBuilderState {
  return {
    ...state,
    collateralInputs: [...state.collateralInputs, {utxo}],
  }
}

export function addCollateralInputs(
  state: TransactionBuilderState,
  utxos: ModernUtxo[],
): TransactionBuilderState {
  return utxos.reduce((acc, utxo) => addCollateralInput(acc, utxo), state)
}

export function removeCollateralInput(
  state: TransactionBuilderState,
  txHash: string,
  txIndex: number,
): TransactionBuilderState {
  return {
    ...state,
    collateralInputs: state.collateralInputs.filter(
      (input) => input.utxo.txHash !== txHash || input.utxo.txIndex !== txIndex,
    ),
  }
}

// Script input operations
export function addScriptInput(
  state: TransactionBuilderState,
  scriptInput: ScriptInput,
): TransactionBuilderState {
  return {
    ...state,
    scriptInputs: [...state.scriptInputs, scriptInput],
  }
}

// UTXO exclusion operations
export function excludeUtxo(
  state: TransactionBuilderState,
  txHash: TransactionHash,
  txIndex: number,
): TransactionBuilderState {
  const newExcluded = new Set(state.excludedUtxos)
  newExcluded.add(getExclusionKey(txHash, txIndex))
  return {
    ...state,
    excludedUtxos: newExcluded,
  }
}

export function excludeUtxos(
  state: TransactionBuilderState,
  utxos: ModernUtxo[],
): TransactionBuilderState {
  return utxos.reduce(
    (acc, utxo) => excludeUtxo(acc, utxo.txHash, utxo.txIndex),
    state,
  )
}

// Metadata operations
export function addMetadata(
  state: TransactionBuilderState,
  label: string,
  data: TransactionMetadata['data'],
): TransactionBuilderState {
  return {
    ...state,
    metadata: [...state.metadata, {label, data}],
  }
}

// Options operations
export function setChangeAddress(
  state: TransactionBuilderState,
  address: Address | string,
): TransactionBuilderState {
  const addr = typeof address === 'string' ? (address as Address) : address
  return {
    ...state,
    options: {...state.options, changeAddress: addr},
  }
}

export function setChangeOutput(
  state: TransactionBuilderState,
  address: Address | string,
  amounts: Balance.Amounts,
): TransactionBuilderState {
  const addr = typeof address === 'string' ? (address as Address) : address
  return {
    ...state,
    options: {
      ...state.options,
      manualChangeOutput: {address: addr, amounts},
    },
  }
}

export function setFee(
  state: TransactionBuilderState,
  amounts: Balance.Amounts,
): TransactionBuilderState {
  return {
    ...state,
    options: {...state.options, manualFee: amounts},
  }
}

export function setTTL(
  state: TransactionBuilderState,
  slot: number,
): TransactionBuilderState {
  return {
    ...state,
    options: {...state.options, ttl: slot},
  }
}

/**
 * Set TTL with a buffer to account for signing and submission delays
 * Default buffer is 7200 slots (2 hours on mainnet, ~1 slot/second)
 * This ensures transactions don't expire before they can be submitted
 */
export function setTTLWithBuffer(
  state: TransactionBuilderState,
  slotNumber: number,
  bufferSlots: number = 7200,
): TransactionBuilderState {
  return setTTL(state, slotNumber + bufferSlots)
}

export function setValidityInterval(
  state: TransactionBuilderState,
  start: number,
  end: number,
): TransactionBuilderState {
  return {
    ...state,
    options: {
      ...state.options,
      validityInterval: {start, end},
    },
  }
}

/**
 * Validate transaction state before building
 */
function validateInputs(state: TransactionBuilderState): void {
  // Check that excluded UTXOs are not in inputs
  for (const input of state.inputs) {
    if (isExcluded(input.utxo, state.excludedUtxos)) {
      throw new Error(
        `UTXO ${input.utxo.txHash}:${input.utxo.txIndex} is excluded but used as input`,
      )
    }
  }

  // Check that excluded UTXOs are not in collateral
  for (const collateral of state.collateralInputs) {
    if (isExcluded(collateral.utxo, state.excludedUtxos)) {
      throw new Error(
        `UTXO ${collateral.utxo.txHash}:${collateral.utxo.txIndex} is excluded but used as collateral`,
      )
    }
  }
}

/**
 * Build a transaction with the normalized CML recipe adapter.
 */
export async function buildTransaction(
  state: TransactionBuilderState,
  protocolParams: CardanoHaskellConfig,
  primaryTokenId: Portfolio.Token.Id = defaultPrimaryTokenId,
): Promise<UnsignedTransaction> {
  validateInputs(state)
  if (
    state.outputs.length === 0 &&
    state.options.changeAddress === undefined &&
    state.options.manualChangeOutput === undefined &&
    state.certificates.length === 0 &&
    state.withdrawals.length === 0 &&
    (state.options.mints?.length ?? 0) === 0
  ) {
    throw new NoOutputsError()
  }

  const result = buildCmlTransactionRecipe(
    state,
    protocolParams,
    primaryTokenId,
  )
  return {
    inputs: state.inputs,
    outputs: state.outputs,
    certificates: state.certificates,
    withdrawals: state.withdrawals,
    referenceInputs: state.referenceInputs,
    collateralInputs: state.collateralInputs,
    metadata: state.metadata.length > 0 ? state.metadata : undefined,
    options: state.options,
    cbor: result.cborHex as TransactionCbor,
  }
}

/**
 * Build transaction as CBOR hex string for multiparty signing
 */
export async function buildTransactionCBOR(
  state: TransactionBuilderState,
  protocolParams: CardanoHaskellConfig,
  primaryTokenId: Portfolio.Token.Id = defaultPrimaryTokenId,
): Promise<string> {
  const unsignedTx = await buildTransaction(
    state,
    protocolParams,
    primaryTokenId,
  )
  if (unsignedTx.cbor) {
    return unsignedTx.cbor
  }
  throw new Error('Failed to build transaction CBOR')
}

/**
 * Check if transaction is ready to be signed
 */
export function isTransactionReady(state: TransactionBuilderState): boolean {
  return state.inputs.length > 0 && state.outputs.length > 0
}

/**
 * Get current builder state (for debugging/inspection)
 */
export function getTransactionState(
  state: TransactionBuilderState,
): TransactionBuilderState {
  return {
    ...state,
    excludedUtxos: new Set(state.excludedUtxos), // Clone Set
  }
}
