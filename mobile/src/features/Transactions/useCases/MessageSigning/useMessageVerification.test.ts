import {act, renderHook} from '@testing-library/react-native'
import {verifyEd25519Signature} from '@yoroi-classic/cml-mobile-bridge'
import {decode, encode} from 'cbor2'

import {useMessageVerification} from './useMessageVerification'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  verifyEd25519Signature: jest.fn(() => true),
  publicKeyHashHexFromRawHex: jest.fn(() => 'key-hash'),
  addressInfoFromAddress: jest.fn(),
}))

jest.mock('cbor2', () => ({
  decode: jest.fn(),
  encode: jest.fn(() => Buffer.from('deadbeef', 'hex')),
}))

jest.mock('@yoroi/cardano-wallet', () => ({
  getSpendingKey: jest.fn(() => null),
  getStakingKey: jest.fn(() => null),
}))

describe('useMessageVerification', () => {
  it('verifies the encoded CIP-8 Sig_structure through the CML bridge', async () => {
    const protectedHeader = Buffer.from('a1045820' + '01'.repeat(32), 'hex')
    const payload = Buffer.from('hello')
    const signature = Buffer.alloc(64, 2)
    const coseSign1 = '01'
    ;(decode as jest.Mock).mockImplementation((input: Uint8Array) =>
      Buffer.from(input).equals(Buffer.from(coseSign1, 'hex'))
        ? [protectedHeader, new Map(), payload, signature]
        : new Map([[4, Buffer.alloc(32, 1)]]),
    )
    const {result} = renderHook(() => useMessageVerification())
    let verification: Awaited<ReturnType<typeof result.current.verifyMessage>>

    await act(async () => {
      verification = await result.current.verifyMessage(coseSign1)
    })

    expect(verification!.isValid).toBe(true)
    expect(encode).toHaveBeenCalledWith([
      'Signature1',
      new Uint8Array(protectedHeader),
      new Uint8Array(),
      new Uint8Array(payload),
    ])
    expect(verifyEd25519Signature).toHaveBeenCalledWith({
      publicKeyHex: Buffer.alloc(32, 1).toString('hex'),
      messageHex: 'deadbeef',
      signatureHex: signature.toString('hex'),
    })
  })
})
