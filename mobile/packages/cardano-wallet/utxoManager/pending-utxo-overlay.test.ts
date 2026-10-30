import {RawUtxo} from '@yoroi/api'
import {Branded} from '@yoroi/types'

import {
  transactionIdHex,
  transactionReviewInfoJson,
} from '@yoroi-classic/cml-mobile-bridge'

import {createPendingUtxoOverlayFromCbor} from './pending-utxo-overlay'

const inputHash = 'cd'.repeat(32)
const walletAddress = 'addr_test1owned'
const otherAddress = 'addr_test1other'
const walletUtxo: RawUtxo = {
  utxo_id: Branded.asUtxoId(`${inputHash}:0`),
  tx_hash: Branded.asTransactionHash(inputHash),
  tx_index: 0,
  receiver: Branded.asAddress(walletAddress),
  amount: Branded.asBalanceQuantity('12345678901234567890'),
  assets: [],
}
const reviewOutput = (address: string) => ({
  address,
  lovelace: '9007199254740993000000',
  assets: [
    {
      policyIdHex: 'ef'.repeat(28),
      assetNameHex: '414243',
      quantity: '9007199254740993000001',
    },
  ],
  datum: {kind: 'inline' as const, cborHex: 'd87980'},
  scriptRef: {hashHex: 'aa'.repeat(28)},
})

describe('createPendingUtxoOverlayFromCbor', () => {
  beforeEach(() => {
    jest.mocked(transactionIdHex).mockReturnValue('ab'.repeat(32))
    jest.mocked(transactionReviewInfoJson).mockReturnValue(
      JSON.stringify({
        isValid: true,
        body: {
          inputs: [{transactionIdHex: inputHash, index: '0'}],
          outputs: [reviewOutput(walletAddress), reviewOutput(otherAddress)],
        },
      }),
    )
  })

  it('records only owned spends and outputs with exact integer quantities', () => {
    const overlay = createPendingUtxoOverlayFromCbor({
      signedTxBase64: 'AQID',
      walletUtxos: [walletUtxo],
      ownedAddresses: new Set([walletAddress]),
    })

    expect(overlay).toEqual({
      txHash: Branded.asTransactionHash('ab'.repeat(32)),
      spentUtxoIds: [Branded.asUtxoId(`${inputHash}:0`)],
      createdUtxos: [
        {
          utxoId: Branded.asUtxoId(`${'ab'.repeat(32)}:0`),
          txHash: Branded.asTransactionHash('ab'.repeat(32)),
          txIndex: 0,
          receiver: Branded.asAddress(walletAddress),
          amount: Branded.asBalanceQuantity('9007199254740993000000'),
          assets: [
            {
              assetId: Branded.asTokenId(`${'ef'.repeat(28)}.414243`),
              policyId: Branded.asPolicyId('ef'.repeat(28)),
              name: Branded.asAssetName('414243'),
              amount: Branded.asBalanceQuantity('9007199254740993000001'),
            },
          ],
          inlineDatum: 'd87980',
          referenceScriptHash: 'aa'.repeat(28),
        },
      ],
    })
  })

  it('uses collateral inputs and the collateral-return index for invalid transactions', () => {
    jest.mocked(transactionReviewInfoJson).mockReturnValue(
      JSON.stringify({
        isValid: false,
        body: {
          inputs: [{transactionIdHex: inputHash, index: '0'}],
          outputs: [reviewOutput(otherAddress)],
          collateralInputs: [{transactionIdHex: inputHash, index: '0'}],
          collateralReturn: reviewOutput(walletAddress),
        },
      }),
    )

    const overlay = createPendingUtxoOverlayFromCbor({
      signedTxBase64: 'AQID',
      walletUtxos: [walletUtxo],
      ownedAddresses: new Set([walletAddress]),
    })

    expect(overlay?.spentUtxoIds).toEqual([Branded.asUtxoId(`${inputHash}:0`)])
    expect(overlay?.createdUtxos[0]?.utxoId).toBe(`${'ab'.repeat(32)}:1`)
  })

  it('does not create an overlay for transactions unrelated to this wallet', () => {
    jest.mocked(transactionReviewInfoJson).mockReturnValue(
      JSON.stringify({
        isValid: true,
        body: {
          inputs: [{transactionIdHex: inputHash, index: '0'}],
          outputs: [reviewOutput(otherAddress)],
        },
      }),
    )
    const overlay = createPendingUtxoOverlayFromCbor({
      signedTxBase64: 'AQID',
      walletUtxos: [],
      ownedAddresses: new Set([walletAddress]),
    })

    expect(overlay).toBeUndefined()
  })

  it('does not project owned outputs when no wallet input is tracked', () => {
    jest.mocked(transactionReviewInfoJson).mockReturnValue(
      JSON.stringify({
        isValid: true,
        body: {
          inputs: [{transactionIdHex: inputHash, index: '0'}],
          outputs: [reviewOutput(walletAddress)],
        },
      }),
    )

    const overlay = createPendingUtxoOverlayFromCbor({
      signedTxBase64: 'AQID',
      walletUtxos: [],
      ownedAddresses: new Set([walletAddress]),
    })

    expect(overlay).toBeUndefined()
  })

  it('rejects malformed transaction input indices', () => {
    jest.mocked(transactionReviewInfoJson).mockReturnValue(
      JSON.stringify({
        isValid: true,
        body: {
          inputs: [{transactionIdHex: inputHash, index: '9007199254740992'}],
          outputs: [],
        },
      }),
    )

    expect(() =>
      createPendingUtxoOverlayFromCbor({
        signedTxBase64: 'AQID',
        walletUtxos: [walletUtxo],
        ownedAddresses: new Set([walletAddress]),
      }),
    ).toThrow('Invalid transaction input index')
  })
})
