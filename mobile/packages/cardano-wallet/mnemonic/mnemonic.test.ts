import {walletRootKeyHexFromEntropy} from '@yoroi-classic/cml-mobile-bridge'

import {generateAdaMnemonic, getMasterKeyFromMnemonic} from './mnemonic'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  // Matches the fixed CML root-key vector in the native bridge's Rust tests for 0x11 entropy.
  walletRootKeyHexFromEntropy: jest.fn(
    () =>
      '789baf867d07a3ab819e4a28b0639a29611c6d87cb381ae5a7f265c234a8785d86842032c8c1eb143d7be93358701495a6402e88c5fb3346801ac8585fc286cbcc9dbd2223bfaac220dc66aa6dd54c04590227b39e448bc24efc730b176b8e48',
  ),
}))

const mnemonic =
  'baby mass dust captain baby mass dust captain baby mass dust casino'

describe('BIP39', () => {
  it('correctly generates mnemonics', () => {
    const recoverPhrase = generateAdaMnemonic()
    expect(recoverPhrase.split(' ').length).toEqual(15)
  })

  it('generates wallet root key through the CML bridge from BIP39 entropy', () => {
    const rootKeyBytes = getMasterKeyFromMnemonic(mnemonic)
    expect(walletRootKeyHexFromEntropy).toHaveBeenCalledWith('11'.repeat(16))
    expect(Buffer.from(rootKeyBytes).toString('hex')).toEqual(
      '789baf867d07a3ab819e4a28b0639a29611c6d87cb381ae5a7f265c234a8785d86842032c8c1eb143d7be93358701495a6402e88c5fb3346801ac8585fc286cbcc9dbd2223bfaac220dc66aa6dd54c04590227b39e448bc24efc730b176b8e48',
    )
  })
})
