import {deriveAccountPublicKeyHex, walletRootKeyHexFromEntropy} from '@yoroi-classic/cml-mobile-bridge'

import {keyManager} from './key-manager'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  walletRootKeyHexFromEntropy: jest.fn(() => 'ab'.repeat(96)),
  deriveAccountPublicKeyHex: jest.fn(({purpose}) =>
    purpose === '2147485500' ? 'cip1852-public-key' : 'bip44-public-key',
  ),
}))

describe('makeKeys', () => {
  it('makes root key and accountPubKeyHex - shelley - cip1852', async () => {
    const mnemonic = [
      'dry balcony arctic what garbage sort',
      'cart shine egg lamp manual bottom',
      'slide assault bus',
    ].join(' ')

    const keys = keyManager('cardano-cip1852')({mnemonic})

    expect(keys).toEqual({
      accountPubKeyHex: 'cip1852-public-key',
      rootKey: 'ab'.repeat(96),
    })
    expect(walletRootKeyHexFromEntropy).toHaveBeenCalled()
    expect(deriveAccountPublicKeyHex).toHaveBeenCalledWith({
      masterKeyHex: 'ab'.repeat(96),
      purpose: '2147485500',
      coinType: '2147485463',
      accountIndex: '0',
    })
  })

  it('makes root key and accountPubKeyHex - byron - bip44', () => {
    const mnemonic = [
      'dry balcony arctic what garbage sort',
      'cart shine egg lamp manual bottom',
      'slide assault bus',
    ].join(' ')

    const keys = keyManager('cardano-bip44')({mnemonic})

    expect(keys).toEqual({
      accountPubKeyHex: 'bip44-public-key',
      rootKey: 'ab'.repeat(96),
    })
    expect(deriveAccountPublicKeyHex).toHaveBeenLastCalledWith({
      masterKeyHex: 'ab'.repeat(96),
      purpose: '2147483692',
      coinType: '2147485463',
      accountIndex: '0',
    })
  })
})
