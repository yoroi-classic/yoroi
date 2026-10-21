import {walletRootKeyHexFromEntropy} from '@yoroi-classic/cml-mobile-bridge'

import {generateAdaMnemonic, getMasterKeyFromMnemonic} from './mnemonic'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  walletRootKeyHexFromEntropy: jest.fn(() => 'ab'.repeat(96)),
}))

const mnemonic = [
  'dry balcony arctic what garbage sort',
  'cart shine egg lamp manual bottom',
  'slide assault bus',
].join(' ')

describe('BIP39', () => {
  it('correctly generates mnemonics', () => {
    const recoverPhrase = generateAdaMnemonic()
    expect(recoverPhrase.split(' ').length).toEqual(15)
  })

  it('generates wallet root key through the CML bridge from BIP39 entropy', () => {
    const rootKeyBytes = getMasterKeyFromMnemonic(mnemonic)
    expect(walletRootKeyHexFromEntropy).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]+$/),
    )
    expect(Buffer.from(rootKeyBytes).toString('hex')).toEqual('ab'.repeat(96))
  })
})
