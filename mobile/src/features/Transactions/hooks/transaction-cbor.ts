import {Buffer} from 'buffer'

export const signedTransactionBase64 = (cborBytes: Uint8Array): string =>
  Buffer.from(cborBytes).toString('base64')
