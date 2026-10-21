import {Balance} from '@yoroi/types'

import {
  addressInfoFromAddress,
  derivePublicKeyFromAccountPathHex,
  deriveWalletPublicKeyHex,
  signWalletData,
  walletRootKeyHexFromEntropy,
} from '@yoroi-classic/cml-mobile-bridge'
import {Buffer} from 'buffer'

import {getMasterKeyFromMnemonic} from '../mnemonic/mnemonic'
import {mocks} from '../mocks/mocks/wallet'
import {cip95ExtensionMaker} from './cip95'

describe('cip95ExtensionMaker', () => {
  beforeEach(() => {
    // Frozen root-key vector for the signing fixture mnemonic. The signature
    // expectation below remains a separate compatibility vector.
    jest
      .mocked(walletRootKeyHexFromEntropy)
      .mockReturnValue(
        '9053adfb225e91c0bf2db38e1978907cfeff6e66b9a9c3d8945aa686a9d29851bf83c8e2e556464605afeb9651fab3ef3f0aa205685c8f1e6f818629f843bde9a7e129fd35d072ce79b40a49cefcbc8526a3cb8d4bfa7a47afddaddc31dbb728',
      )
    jest.mocked(addressInfoFromAddress).mockReturnValue({
      hex: '01260c2a2b09aad0061a320042c15f8985449b9e8d5ced8a45e35b37dd42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
      networkId: 1,
      bech32:
        'addr1qynqc23tpx4dqps6xgqy9s2l3xz5fxu734wwmzj9uddn0h2z6epfcukqmswgwwfruxh7gaddv9x0d5awccwahnhwleqqc4zkh4',
      isValid: true,
    })
    jest
      .mocked(deriveWalletPublicKeyHex)
      .mockReturnValue(
        'be6a4d7e9789dd7458049c971ad783107e7f041c6f1f542b4530d63d5fe5afb1',
      )
    jest
      .mocked(derivePublicKeyFromAccountPathHex)
      .mockReturnValue(
        '128d503f283abab8ab21325b164db691eb042f39516b705dbd45e245c9a10d43',
      )
    jest.mocked(signWalletData).mockReturnValue({
      signatureHex:
        '14835b7fca21d7b99a6bee383816a479494b4b221434f13eabe3b0759f5bc758120a026d49706a9ce7d53e6f791f9c84c6ad854de80ba67d53b01b9f129cb60c',
      publicKeyHex:
        'be6a4d7e9789dd7458049c971ad783107e7f041c6f1f542b4530d63d5fe5afb1',
    })
  })

  it('should throw an error for unsupported wallet implementation', async () => {
    expect(() =>
      cip95ExtensionMaker(mocks.wallet, {
        ...mocks.walletMeta,
        implementation: 'cardano-bip44',
      }),
    ).toThrow()
  })

  it('should support signData', async () => {
    const rootKey = getMasterKeyFromMnemonic(mnemonic)
    const rootKeyHex = Buffer.from(rootKey).toString('hex')
    const message = '48656C6C6F'
    const addressBech32 =
      'addr1qynqc23tpx4dqps6xgqy9s2l3xz5fxu734wwmzj9uddn0h2z6epfcukqmswgwwfruxh7gaddv9x0d5awccwahnhwleqqc4zkh4'

    const cip95 = cip95ExtensionMaker(mocks.wallet, mocks.walletMeta)
    const result = await cip95.signData(rootKeyHex, addressBech32, message)

    expect(result).toEqual({
      signature:
        '845869a30127045820be6a4d7e9789dd7458049c971ad783107e7f041c6f1f542b4530d63d5fe5afb16761646472657373583901260c2a2b09aad0061a320042c15f8985449b9e8d5ced8a45e35b37dd42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40a166686173686564f44548656c6c6f584014835b7fca21d7b99a6bee383816a479494b4b221434f13eabe3b0759f5bc758120a026d49706a9ce7d53e6f791f9c84c6ad854de80ba67d53b01b9f129cb60c',
      key: 'a4010103272006215820be6a4d7e9789dd7458049c971ad783107e7f041c6f1f542b4530d63d5fe5afb1',
    })
  })

  it('derives the DRep public key through the CML bridge role path', async () => {
    const result = await cip95ExtensionMaker(
      mocks.wallet,
      mocks.walletMeta,
    ).getPubDRepKey()

    expect(result).toBe(
      '128d503f283abab8ab21325b164db691eb042f39516b705dbd45e245c9a10d43',
    )
    expect(derivePublicKeyFromAccountPathHex).toHaveBeenCalledWith(
      mocks.wallet.publicKeyHex,
      [3, 0],
    )
  })

  it('should support getRegisteredPubStakeKeys', async () => {
    const stakingPublicKeyHex = 'ab'.repeat(32)
    const registeredResult = await cip95ExtensionMaker(
      {
        ...mocks.wallet,
        getStakingKey: () => ({toHex: () => stakingPublicKeyHex}) as never,
        getStakingInfo: () => Promise.resolve({status: 'registered'}),
      },
      mocks.walletMeta,
    ).getRegisteredPubStakeKeys()

    expect(registeredResult).toEqual([stakingPublicKeyHex])

    const stakedResult = await cip95ExtensionMaker(
      {
        ...mocks.wallet,
        getStakingKey: () => ({toHex: () => stakingPublicKeyHex}) as never,
        getStakingInfo: () =>
          Promise.resolve({
            status: 'staked' as const,
            amount: '10' as Balance.Quantity,
            poolId: 'pool1',
            rewards: '10' as Balance.Quantity,
          }),
      },
      mocks.walletMeta,
    ).getRegisteredPubStakeKeys()

    expect(stakedResult).toEqual([stakingPublicKeyHex])

    const notRegisteredResult = await cip95ExtensionMaker(
      {
        ...mocks.wallet,
        getStakingKey: () => ({toHex: () => stakingPublicKeyHex}) as never,
        getStakingInfo: () => Promise.resolve({status: 'not-registered'}),
      },
      mocks.walletMeta,
    ).getRegisteredPubStakeKeys()

    expect(notRegisteredResult).toEqual([])
  })

  it('should support getUnregisteredPubStakeKeys', async () => {
    const stakingPublicKeyHex = 'ab'.repeat(32)
    const registeredResult = await cip95ExtensionMaker(
      {
        ...mocks.wallet,
        getStakingKey: () => ({toHex: () => stakingPublicKeyHex}) as never,
        getStakingInfo: () => Promise.resolve({status: 'registered'}),
      },
      mocks.walletMeta,
    ).getUnregisteredPubStakeKeys()

    expect(registeredResult).toEqual([])

    const stakedResult = await cip95ExtensionMaker(
      {
        ...mocks.wallet,
        getStakingKey: () => ({toHex: () => stakingPublicKeyHex}) as never,
        getStakingInfo: () =>
          Promise.resolve({
            status: 'staked' as const,
            amount: '10' as Balance.Quantity,
            poolId: 'pool1',
            rewards: '10' as Balance.Quantity,
          }),
      },
      mocks.walletMeta,
    ).getUnregisteredPubStakeKeys()

    expect(stakedResult).toEqual([])

    const notRegisteredResult = await cip95ExtensionMaker(
      {
        ...mocks.wallet,
        getStakingKey: () => ({toHex: () => stakingPublicKeyHex}) as never,
        getStakingInfo: () => Promise.resolve({status: 'not-registered'}),
      },
      mocks.walletMeta,
    ).getUnregisteredPubStakeKeys()

    expect(notRegisteredResult).toEqual([stakingPublicKeyHex])
  })
})

const mnemonic = [
  'dry balcony arctic what garbage sort',
  'cart shine egg lamp manual bottom',
  'slide assault bus',
].join(' ')
