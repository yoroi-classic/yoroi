import {primaryTokenId} from '@yoroi/portfolio'

import {resolvedUtxoToModernUtxo} from './resolved-utxo-to-modern'

const referenceScript = {
  hash: 'ab'.repeat(28),
  type: 'plutusV3',
  size: 3,
  bytes: '010203',
}

describe('resolvedUtxoToModernUtxo', () => {
  it('retains exact amounts, datum CBOR, and validated reference-script bytes', () => {
    const utxo = resolvedUtxoToModernUtxo({
      txHash: 'cd'.repeat(32),
      outputIndex: 2,
      address:
        'addr_test1qrgpjmyy8zk9nuza24a0f4e7mgp9gd6h3uayp0rqnjnkl54v4dlyj0kwfs0x4e38a7047lymzp37tx0y42glslcdtzhqzp57km',
      value: '900719925474099312345',
      assets: [
        {
          policyId: 'ef'.repeat(28),
          assetName: '00ff',
          quantity: '900719925474099399999',
        },
      ],
      datumHash: '12'.repeat(32),
      inlineDatum: 'd87980',
      referenceScriptHash: referenceScript.hash,
      referenceScript,
      spent: false,
    })

    expect(utxo.txIndex).toBe(2)
    expect(utxo.balance[primaryTokenId]).toBe('900719925474099312345')
    expect(utxo.balance[`${'ef'.repeat(28)}.00ff` as keyof typeof utxo.balance]).toBe(
      '900719925474099399999',
    )
    expect(utxo.inlineDatumCborHex).toBe('d87980')
    expect(utxo.datumHashHex).toBe('12'.repeat(32))
    expect(utxo.referenceScript).toEqual(referenceScript)
  })

  it('does not expose mismatched reference-script hash/size metadata', () => {
    const utxo = resolvedUtxoToModernUtxo({
      txHash: 'cd'.repeat(32),
      outputIndex: 2,
      address:
        'addr_test1qrgpjmyy8zk9nuza24a0f4e7mgp9gd6h3uayp0rqnjnkl54v4dlyj0kwfs0x4e38a7047lymzp37tx0y42glslcdtzhqzp57km',
      value: '1',
      assets: [],
      referenceScriptHash: 'cd'.repeat(28),
      referenceScript: {...referenceScript, size: 4},
      spent: false,
    })

    expect(utxo.referenceScript).toBeUndefined()
  })

  it('rejects spent outputs', () => {
    expect(() =>
      resolvedUtxoToModernUtxo({
        txHash: 'cd'.repeat(32),
        outputIndex: 2,
        address: 'addr_test1fixture',
        value: '1',
        assets: [],
        spent: true,
      }),
    ).toThrow('Cannot adapt a spent UTxO')
  })
})
