import {signedTransactionBase64} from './transaction-cbor'

describe('signedTransactionBase64', () => {
  it('submits the exact signed CML CBOR bytes without parsing or re-encoding', () => {
    const signedCbor = new Uint8Array([0x84, 0xa0, 0xa0, 0xf5])

    expect(signedTransactionBase64(signedCbor)).toBe('hKCg9Q==')
  })
})
