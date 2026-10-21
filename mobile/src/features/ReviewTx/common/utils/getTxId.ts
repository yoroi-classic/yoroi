import {calculateTxId} from '@yoroi/tx'

import {Buffer} from 'buffer'

/**
 * Safe extraction of transaction ID from callback arguments
 *
 * Priority order:
 * 1. args?.txId (already calculated, preferred)
 * 2. fallbackCbor (unsigned CBOR - safe, body hash is same for signed/unsigned)
 * 3. args?.signedTx or args?.tx (last resort, with null checks)
 *
 * @param args - Callback arguments from useOnConfirm
 * @param fallbackCbor - Optional unsigned CBOR to use as safe fallback
 * @returns Transaction ID string, or undefined if not available
 */
export const getTxIdFromArgs = async (
  args?: {
    txId?: string
    signedTxBytes?: Uint8Array
  },
  fallbackCbor?: string,
): Promise<string | undefined> => {
  // 1. Prefer txId from args (already calculated)
  if (args?.txId) {
    return args.txId
  }

  // 2. Use unsigned CBOR if provided (safe - body hash is same for signed/unsigned)
  if (fallbackCbor) {
    try {
      return await calculateTxId(fallbackCbor, 'hex')
    } catch (error) {
      // If calculation fails, continue to next fallback
    }
  }

  // 3. Last resort: hash the CML-produced signed transaction bytes.
  if (args?.signedTxBytes) {
    try {
      return await calculateTxId(
        Buffer.from(args.signedTxBytes).toString('hex'),
        'hex',
      )
    } catch (error) {
      // If calculation fails, return undefined
    }
  }

  return undefined
}
