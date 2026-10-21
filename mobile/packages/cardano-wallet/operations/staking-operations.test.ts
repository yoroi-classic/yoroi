import {
  addressInfoFromAddress,
  derivePublicKeyFromAccountPathHex,
  publicKeyHashHexFromRawHex,
} from '@yoroi-classic/cml-mobile-bridge'

import {getStakingKey} from './staking-operations'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn(),
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

  it('extracts the key stake credential from a read-only Shelley base address', () => {
    const address = 'addr1readonly-base'
    jest.mocked(addressInfoFromAddress).mockReturnValue({
      hex: `01${'11'.repeat(28)}${'22'.repeat(28)}`,
      networkId: 1,
      bech32: address,
      isValid: true,
    })

    const key = getStakingKey(
      {
        publicKeyHex: '',
        accountVisual: 0,
        externalAddresses: [address],
        internalAddresses: [],
      },
      'cardano-cip1852',
      0,
    )

    expect(key.hash().toHex()).toBe('22'.repeat(28))
  })

  it('skips script-stake and Byron addresses in a read-only wallet', () => {
    const scriptStakeAddress = 'addr1readonly-script-stake'
    const byronAddress = 'Ae2readonly-byron'
    jest.mocked(addressInfoFromAddress).mockImplementation((address) => ({
      hex: address === scriptStakeAddress ? `31${'11'.repeat(56)}` : '82d818',
      networkId: 1,
      bech32: address,
      isValid: true,
    }))

    expect(() =>
      getStakingKey(
        {
          publicKeyHex: '',
          accountVisual: 0,
          externalAddresses: [scriptStakeAddress, byronAddress],
          internalAddresses: [],
        },
        'cardano-cip1852',
        0,
      ),
    ).toThrow(
      'Could not extract staking key from addresses for read-only wallet',
    )
  })
})
