// Ledger signing functions: merge Ledger signatures into serialized CML transactions.
import {PublicKeyHex} from '@yoroi/types'

import {
  SignTransactionResponse,
  SignedTransactionData,
} from '@cardano-foundation/ledgerjs-hw-app-cardano'
import {applyLedgerWitnessesToTransactionHex} from '@yoroi-classic/cml-mobile-bridge'

import {Addressing} from '../types'

const CARDANO_COIN_TYPE = '2147485463'
const HARDENED_OFFSET = 2 ** 31

type LedgerInput = {
  receiver: string
  txHash: string
  txIndex: number
  addressing: Addressing
}

type LedgerTransaction = {
  transactionHex: string
  senderUtxos: LedgerInput[]
}

const applyLedgerResponse = (
  transactionHex: string,
  signedLedgerTx: {
    txHashHex: string
    witnesses: Array<{path: number[]; witnessSignatureHex: string}>
  },
  purpose: number,
  accountVisual: number,
  publicKeyHex: string,
  senderUtxos: LedgerInput[] = [],
  plutusDataHexes?: string[],
): Uint8Array => {
  for (const utxo of senderUtxos) {
    if (utxo.addressing.startLevel !== 1) {
      throw new Error('Ledger input addressing does not start at BIP-44 root')
    }
    if (utxo.addressing.path.length !== 5) {
      throw new Error('Ledger input addressing must contain five path indexes')
    }
  }

  const signedHex = applyLedgerWitnessesToTransactionHex({
    transactionHex,
    accountPublicKeyHex: publicKeyHex,
    purpose: String(purpose),
    coinType: CARDANO_COIN_TYPE,
    accountIndex: String(HARDENED_OFFSET + accountVisual),
    witnesses: signedLedgerTx.witnesses.map(({path, witnessSignatureHex}) => ({
      path,
      signatureHex: witnessSignatureHex,
    })),
    expectedTxIdHex: signedLedgerTx.txHashHex,
    plutusDataHexes,
    senderUtxos: senderUtxos.map((utxo) => ({
      txHashHex: utxo.txHash,
      outputIndex: utxo.txIndex,
      address: utxo.receiver,
      path: utxo.addressing.path,
    })),
  })

  return Uint8Array.from(Buffer.from(signedHex, 'hex'))
}

/** Merge verified Ledger witnesses into the transaction built by CML. */
export async function buildLedgerSignedTx(
  unsignedTx: LedgerTransaction,
  signedLedgerTx: SignTransactionResponse,
  purpose: number,
  publicKeyHex: string,
  _useCIP36 = true,
  plutusDataHexes?: string[],
  accountVisual = 0,
): Promise<{id: string; encodedTx: Uint8Array}> {
  const encodedTx = applyLedgerResponse(
    unsignedTx.transactionHex,
    signedLedgerTx,
    purpose,
    accountVisual,
    publicKeyHex,
    unsignedTx.senderUtxos,
    plutusDataHexes,
  )

  return {id: signedLedgerTx.txHashHex, encodedTx}
}

/** Create a signed transaction from serialized CBOR and Ledger signatures. */
export async function createSignedLedgerTxFromCbor(
  cbor: string,
  signedData: SignedTransactionData,
  purpose: number,
  publicKeyHex: PublicKeyHex | string,
): Promise<Uint8Array> {
  return applyLedgerResponse(cbor, signedData, purpose, 0, publicKeyHex)
}
