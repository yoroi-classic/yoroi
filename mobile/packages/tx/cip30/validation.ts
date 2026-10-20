import {transactionValidationInfoJson} from '@yoroi-classic/csl-mobile-bridge'

/** Transaction validation result. */
export type TransactionValidationResult = {
  valid: boolean
  errors: string[]
  warnings: string[]
}

type TransactionValidationInfo = {
  inputsCount: number
  outputsCount: number
  fee: string
  ttl: number | null
}

/** Validate transaction CBOR before signing using the native CML parser. */
export function validateTransactionCbor(cborHex: string): TransactionValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!/^[0-9a-fA-F]+$/.test(cborHex)) {
    errors.push('Transaction CBOR must be valid hex string')
    return {valid: false, errors, warnings}
  }

  try {
    const info = JSON.parse(transactionValidationInfoJson(cborHex)) as TransactionValidationInfo
    if (info.inputsCount === 0) errors.push('Transaction has no inputs')
    if (info.outputsCount === 0) warnings.push('Transaction has no outputs')
    if (info.fee === '0') warnings.push('Transaction fee is zero')
    if (info.ttl == null || info.ttl === 0) warnings.push('Transaction TTL is not set')
  } catch (error) {
    errors.push(`Failed to parse transaction: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {valid: errors.length === 0, errors, warnings}
}

/** CIP-30 transaction error with structured validation results. */
export class CIP30TransactionError extends Error {
  constructor(message: string, public readonly validation: TransactionValidationResult) {
    super(message)
    this.name = 'CIP30TransactionError'
  }
}
