import {transactionUnspentOutputHex} from '@yoroi-classic/cml-mobile-bridge'

import {serializeModernUtxoCml} from './cml-utxo'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  transactionUnspentOutputHex: jest.fn(() => 'cml-utxo-cbor'),
}))

describe('serializeModernUtxoCml', () => {
  it('passes exact decimal values and token IDs to the CML serializer', () => {
    const primaryTokenId = 'ada.lovelace' as never
    const tokenId = `${'ab'.repeat(28)}.4e49474854`
    const utxo = {
      receiver: 'addr_test1wallet',
      txHash: 'cd'.repeat(32),
      txIndex: 2,
      balance: {
        [primaryTokenId]: '9007199254740993',
        [tokenId]: '123456789012345678',
      },
    }

    expect(serializeModernUtxoCml(utxo as never, primaryTokenId)).toBe(
      'cml-utxo-cbor',
    )
    expect(transactionUnspentOutputHex).toHaveBeenCalledWith({
      txHashHex: 'cd'.repeat(32),
      index: '2',
      address: 'addr_test1wallet',
      lovelace: '9007199254740993',
      assets: [
        {
          policyIdHex: 'ab'.repeat(28),
          assetNameHex: '4e49474854',
          quantity: '123456789012345678',
        },
      ],
    })
  })

  it('does not serialize an unsafe JavaScript output index', () => {
    expect(() =>
      serializeModernUtxoCml(
        {
          receiver: 'addr_test',
          txHash: 'cd'.repeat(32),
          txIndex: Number.MAX_SAFE_INTEGER + 1,
          balance: {},
        } as never,
        'ada.lovelace' as never,
      ),
    ).toThrow('Invalid UTxO output index')
  })
})
