import {applyLedgerWitnessesToTransactionHex} from '@yoroi-classic/cml-mobile-bridge'

import {buildLedgerSignedTx, createSignedLedgerTxFromCbor} from './signing'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  applyLedgerWitnessesToTransactionHex: jest.fn(() => '84a0a0f5'),
}))

const ledgerResponse = {
  txHashHex: 'ab'.repeat(32),
  witnesses: [
    {
      path: [1852 + 0x80000000, 1815 + 0x80000000, 0x80000000, 0, 0],
      witnessSignatureHex: 'cd'.repeat(64),
    },
  ],
}

describe('Ledger witness integration', () => {
  beforeEach(() => jest.clearAllMocks())

  it('merges Ledger signatures into transaction CBOR through the CML bridge', async () => {
    const signed = await buildLedgerSignedTx(
      {
        transactionHex: '84a0a0f5',
        senderUtxos: [
          {
            receiver: 'addr_test1source',
            txHash: '01'.repeat(32),
            txIndex: 2,
            addressing: {
              path: [1852 + 0x80000000, 1815 + 0x80000000, 0x80000000, 0, 0],
              startLevel: 1,
            },
          },
        ],
      },
      ledgerResponse as never,
      1852 + 0x80000000,
      'ef'.repeat(64),
      true,
      undefined,
      3,
    )

    expect(applyLedgerWitnessesToTransactionHex).toHaveBeenCalledWith({
      transactionHex: '84a0a0f5',
      accountPublicKeyHex: 'ef'.repeat(64),
      purpose: String(1852 + 0x80000000),
      coinType: '2147485463',
      accountIndex: '2147483651',
      witnesses: [
        {
          path: ledgerResponse.witnesses[0]!.path,
          signatureHex: 'cd'.repeat(64),
        },
      ],
      expectedTxIdHex: 'ab'.repeat(32),
      senderUtxos: [
        {
          txHashHex: '01'.repeat(32),
          outputIndex: 2,
          address: 'addr_test1source',
          path: ledgerResponse.witnesses[0]!.path,
        },
      ],
    })
    expect(signed.id).toBe(ledgerResponse.txHashHex)
    expect(Buffer.from(signed.encodedTx).toString('hex')).toBe('84a0a0f5')
  })

  it('uses the same CML witness boundary for serialized Ledger transactions', async () => {
    await createSignedLedgerTxFromCbor(
      '84a0a0f5',
      ledgerResponse as never,
      1852 + 0x80000000,
      'ef'.repeat(64),
    )

    expect(applyLedgerWitnessesToTransactionHex).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionHex: '84a0a0f5',
        accountPublicKeyHex: 'ef'.repeat(64),
        purpose: String(1852 + 0x80000000),
        coinType: '2147485463',
        accountIndex: '2147483648',
        witnesses: [
          {
            path: ledgerResponse.witnesses[0]!.path,
            signatureHex: 'cd'.repeat(64),
          },
        ],
        expectedTxIdHex: 'ab'.repeat(32),
        senderUtxos: [],
      }),
    )
  })
})
