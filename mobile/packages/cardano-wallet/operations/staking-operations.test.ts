import {
  derivePublicKeyFromAccountPathHex,
  publicKeyHashHexFromRawHex,
} from '@yoroi-classic/cml-mobile-bridge'

import {getStakingKey} from './staking-operations'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  derivePublicKeyFromAccountPathHex: jest.fn(() => 'ab'.repeat(32)),
  publicKeyHashHexFromRawHex: jest.fn(() => 'cd'.repeat(28)),
}))

describe('getStakingKey', () => {
  it('derives the CIP-1852 stake key with CML and exposes its raw public key/hash', () => {
    const key = getStakingKey(
      {
        publicKeyHex: '01'.repeat(64),
        accountVisual: 0,
        externalAddresses: [],
        internalAddresses: [],
      },
      'cardano-cip1852',
      0,
    )

    expect(derivePublicKeyFromAccountPathHex).toHaveBeenCalledWith(
      '01'.repeat(64),
      [2, 0],
    )
    expect(publicKeyHashHexFromRawHex).toHaveBeenCalledWith('ab'.repeat(32))
    expect(key.toHex()).toBe('ab'.repeat(32))
    expect(key.hash().toHex()).toBe('cd'.repeat(28))
    expect(Buffer.from(key.hash().toBytes()).toString('hex')).toBe(
      'cd'.repeat(28),
    )
  })
})
