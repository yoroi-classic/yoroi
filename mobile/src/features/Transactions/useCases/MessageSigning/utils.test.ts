import {getSpendingKey, getStakingKey} from '@yoroi/cardano-wallet'

import {
  addressInfoFromAddress,
  publicKeyHashHexFromRawHex,
} from '@yoroi-classic/cml-mobile-bridge'
import {decode} from 'cbor2'

import {extractAddressFromSignature, verifyAddressFromPublicKey} from './utils'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn(),
  publicKeyHashHexFromRawHex: jest.fn(() => 'matching-key-hash'),
}))

jest.mock('@yoroi/cardano-wallet', () => ({
  getSpendingKey: jest.fn(() => null),
  getStakingKey: jest.fn(() => null),
}))

jest.mock('cbor2', () => ({decode: jest.fn()}))

describe('MessageSigning address helpers', () => {
  beforeEach(() => jest.clearAllMocks())

  it('converts a COSE address using the CML address parser', async () => {
    ;(decode as jest.Mock).mockReturnValueOnce(
      new Map([['address', Buffer.from('address-bytes')]]),
    )
    ;(addressInfoFromAddress as jest.Mock).mockReturnValueOnce({
      bech32: 'addr_test1fixture',
    })

    await expect(
      extractAddressFromSignature(new Uint8Array([1])),
    ).resolves.toBe('addr_test1fixture')
    expect(addressInfoFromAddress).toHaveBeenCalledWith(
      Buffer.from('address-bytes').toString('hex'),
    )
  })

  it('matches a public key against payment and reward credentials via CML-backed helpers', async () => {
    ;(getSpendingKey as jest.Mock).mockReturnValueOnce('matching-key-hash')
    await expect(
      verifyAddressFromPublicKey('01'.repeat(32), 'addr_test1payment'),
    ).resolves.toBe(true)
    expect(publicKeyHashHexFromRawHex).toHaveBeenCalledWith('01'.repeat(32))
    ;(getStakingKey as jest.Mock).mockReturnValueOnce('matching-key-hash')
    await expect(
      verifyAddressFromPublicKey('01'.repeat(32), 'stake_test1reward'),
    ).resolves.toBe(true)
  })

  it('rejects addresses whose key credentials do not match', async () => {
    await expect(
      verifyAddressFromPublicKey('01'.repeat(32), 'addr_test1other'),
    ).resolves.toBe(false)
  })
})
