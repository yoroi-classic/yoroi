// Cardano transaction utilities
// Functions for transaction hashing, ID calculation, etc.
import {
  stakeCredentialHexFromAddress,
  transactionIdHex,
  transactionValidationInfoJson,
  transactionWitnessSetHex,
} from '@yoroi-classic/cml-mobile-bridge'
import {BigNumber} from 'bignumber.js'

/**
 * Hash a transaction to get its transaction hash
 */
export async function hashTransaction(
  transactionBytes: Uint8Array,
): Promise<string> {
  return transactionIdHex(Buffer.from(transactionBytes).toString('hex'))
}

/**
 * Calculate transaction ID from encoded transaction
 *
 */
export async function calculateTxId(
  encodedTx: string,
  encoding: 'base64' | 'hex',
): Promise<string> {
  const txHex = Buffer.from(encodedTx, encoding).toString('hex')
  return transactionIdHex(txHex)
}

/** Extract the serialized witness set from a signed transaction using CML. */
export function getTransactionWitnessSetHex(
  transactionBytes: Uint8Array,
): string {
  return transactionWitnessSetHex(Buffer.from(transactionBytes).toString('hex'))
}

/** Read the transaction body's fee with the CML transaction parser. */
export function getTransactionFee(transactionHex: string): bigint {
  const parsed: unknown = JSON.parse(
    transactionValidationInfoJson(transactionHex),
  )
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('fee' in parsed) ||
    typeof parsed.fee !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(parsed.fee)
  ) {
    throw new Error('Invalid CML transaction fee response')
  }
  return BigInt(parsed.fee)
}

/**
 * Get balance for staking credentials from UTXOs
 *
 */
export async function getBalanceForStakingCredentials(
  utxos: Array<{receiver: string; amount: string}>,
): Promise<Record<string, string>> {
  const balances = await utxos.reduce(
    async (prevPromise, curr) => {
      const prev = await prevPromise
      try {
        const stakeCredHex = stakeCredentialHexFromAddress(curr.receiver)
        if (!prev[stakeCredHex]) {
          prev[stakeCredHex] = '0'
        }

        const prevAmount = new BigNumber(prev[stakeCredHex])
        const currAmount = new BigNumber(curr.amount)

        prev[stakeCredHex] = prevAmount.plus(currAmount).toString()
      } catch {
        /** */
      }

      return prev
    },
    Promise.resolve({} as {[key: string]: string}),
  )
  return balances
}
