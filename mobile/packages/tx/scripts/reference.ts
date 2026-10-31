import {Address, Balance, Branded} from '@yoroi/types'

import {scriptHashHexFromCbor} from '@yoroi-classic/cml-mobile-bridge'

import {TransactionBuilderState} from '../transaction-builder/builder'
import {ModernUtxo} from '../utxo/models'
import type {ReferenceScript} from './types'

/**
 * Read a validated CWB reference-script object carried by the UTxO adapter.
 */
export function detectReferenceScript(
  utxo: ModernUtxo,
): ReferenceScript | null {
  const script = utxo.referenceScript
  if (!script || !/^[0-9a-fA-F]{56}$/.test(script.hash)) return null
  if (!script.bytes || !/^(?:[0-9a-fA-F]{2})+$/.test(script.bytes)) return null
  if (script.size !== script.bytes.length / 2) return null
  const scriptType = script.type === 'native' ? 'native' : 'plutus'
  const scriptHashType =
    script.type === 'native'
      ? 'native'
      : /^plutusV[123]$/.test(script.type ?? '')
        ? (script.type as 'plutusV1' | 'plutusV2' | 'plutusV3')
        : undefined
  if (!scriptHashType) {
    return null
  }
  try {
    if (
      scriptHashHexFromCbor(scriptHashType, script.bytes).toLowerCase() !==
      script.hash.toLowerCase()
    ) {
      return null
    }
  } catch {
    return null
  }

  return {
    txHash: utxo.txHash,
    txIndex: utxo.txIndex,
    scriptHash: Branded.asScriptHash(script.hash.toLowerCase()),
    scriptType,
    scriptSize: script.size,
  }
}

/**
 * Find reference scripts in UTXOs
 */
export function findReferenceScripts(utxos: ModernUtxo[]): ReferenceScript[] {
  const scripts: ReferenceScript[] = []

  for (const utxo of utxos) {
    const script = detectReferenceScript(utxo)
    if (script) {
      scripts.push(script)
    }
  }

  return scripts
}

/**
 * Find reference script by hash
 */
export function findReferenceScriptByHash(
  utxos: ModernUtxo[],
  scriptHash: string,
): ReferenceScript | null {
  const scripts = findReferenceScripts(utxos)
  return scripts.find((s) => s.scriptHash === scriptHash) || null
}

/**
 * Calculate reference script fee (local estimation)
 *
 * Note: This is a rough estimation. Accurate fee calculation requires
 * Phase 2 backend evaluation.
 */
export function estimateReferenceScriptFee(
  protocolParams: {
    minFeeReferenceScript?: {
      coinsPerByte: {numerator: string; denominator: string}
      tierStepBytes: string
      multiplier: string
    }
  },
  scriptSize: number,
): string {
  // Rough estimation based on protocol parameters
  // Actual calculation would be more complex

  if (!protocolParams.minFeeReferenceScript) {
    // Fallback: estimate based on script size
    return (scriptSize * 0.000044).toString() // Rough ADA per byte
  }

  const {coinsPerByte, tierStepBytes, multiplier} =
    protocolParams.minFeeReferenceScript

  // Simplified calculation
  const bytes = BigInt(scriptSize)
  const numerator = BigInt(coinsPerByte.numerator)
  const denominator = BigInt(coinsPerByte.denominator)
  const tierStep = BigInt(tierStepBytes)
  const mult = BigInt(multiplier)

  // Calculate: (bytes * numerator * multiplier) / (denominator * tierStep)
  const fee = (bytes * numerator * mult) / (denominator * tierStep)

  return fee.toString()
}

/**
 * Add reference script to transaction builder
 *
 * Note: Reference scripts are added as reference inputs, not regular inputs
 */
export function addReferenceScriptUsage(
  state: TransactionBuilderState,
  referenceScript: ReferenceScript,
): TransactionBuilderState {
  // Create UTXO reference for the reference script
  const refUtxo: ModernUtxo = {
    receiver: '' as Address, // Not needed for reference inputs
    txHash: referenceScript.txHash,
    txIndex: referenceScript.txIndex,
    balance: {} as Balance.Amounts,
    toTransactionUnspentOutputHex: () => {
      throw new Error('Cannot serialize reference script UTXO')
    },
  }

  // Add as reference input
  return {
    ...state,
    referenceInputs: [...state.referenceInputs, {utxo: refUtxo}],
  }
}
