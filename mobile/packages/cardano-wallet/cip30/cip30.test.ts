import {
  addressInfoFromAddress,
  addressToHex,
  deriveWalletPublicKeyHex,
  emptyWitnessTransactionHex,
  rewardAddressFromAddress,
  signWalletData,
  transactionUnspentOutputHex,
} from '@yoroi-classic/cml-mobile-bridge'

import {createCollateralEntry} from '~/features/Settings/ui/screens/ChangeWalletSettingsScreen/ManageCollateralScreen/helpers'

import {makeCip8DataToSign} from '../cip8/cip8'
import {getMasterKeyFromMnemonic} from '../mnemonic/mnemonic'
import {mocks} from '../mocks/mocks/wallet'
import {YoroiWallet} from '../types'
import {cip30ExtensionMaker} from './cip30'

jest.mock('../transaction-recipes', () => ({
  createSendTxFromWallet: jest.fn(),
}))

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  transactionIdHex: jest.fn(
    () => '1a6205dc7a5a0493ef64487ca7033d12ba8f85a7d4a6e62d3c8eaa570d74eb53',
  ),
  addressInfoFromAddress: jest.fn((address: string) => ({
    hex:
      {
        'addr1qynqc23tpx4dqps6xgqy9s2l3xz5fxu734wwmzj9uddn0h2z6epfcukqmswgwwfruxh7gaddv9x0d5awccwahnhwleqqc4zkh4':
          '01260c2a2b09aad0061a320042c15f8985449b9e8d5ced8a45e35b37dd42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
        'addr1qxy9yjhvxh700xeluhvdpwlauuvnzav42edveyggy8fusqvg2f9wcd0u77dnlewc6zalmecex96e24j6ejgssgwneqqs762af9':
          '0188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c80188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c801',
        'addr_test1qrg0x4sx2wfd3l26zqs658u8vyg8qz4dzqw0zke45lpy0vkr3y3kdut55a40jff00qmg74686vz44v6k363md06qkq0qzplc3l':
          '00d0f356065392d8fd5a1021aa1f876110700aad101cf15b35a7c247b2c3892366f174a76af9252f78368f5747d3055ab3568ea3b6bf40b01e',
        '0188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c80188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c801':
          '0188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c80188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c801',
      }[address] ?? '00' + 'ab'.repeat(56),
    networkId: 1,
    bech32: address,
    isValid: true,
  })),
  addressToHex: jest.fn((address: string) => address),
  rewardAddressFromAddress: jest.fn(() => 'stake1fixture'),
  transactionValidationInfoJson: jest.fn(() =>
    JSON.stringify({inputsCount: 1, outputsCount: 1, fee: '1000000', ttl: 10}),
  ),
  transactionReviewInfoJson: jest.fn(() =>
    JSON.stringify({body: {inputs: []}}),
  ),
  transactionUnspentOutputHex: jest.fn((args: unknown) => JSON.stringify(args)),
  valueFromAmountsHex: jest.fn(() => '821a001e8480a0'),
  valueFromHexInfoJson: jest.fn(() => JSON.stringify({coin: '0', assets: []})),
  emptyWitnessTransactionHex: jest.fn(() => 'body-only-transaction-cbor'),
  transactionSigningRequirementsJson: jest.fn(() =>
    JSON.stringify({
      inputs: [],
      collateralInputs: [],
      requiredSigners: [],
      hasStakingCertificate: false,
      withdrawals: [],
      nativeScriptKeyHashesHex: [],
    }),
  ),
  buildSimplePaymentTransaction: jest.fn(),
  buildEscrowRedeemTransactionCml: jest.fn(),
  minimumCoinForAssets: jest.fn(),
  walletRootKeyHexFromEntropy: jest.fn(
    () =>
      '9053adfb225e91c0bf2db38e1978907cfeff6e66b9a9c3d8945aa686a9d29851bf83c8e2e556464605afeb9651fab3ef3f0aa205685c8f1e6f818629f843bde9a7e129fd35d072ce79b40a49cefcbc8526a3cb8d4bfa7a47afddaddc31dbb728',
  ),
  deriveAccountPublicKeyHex: jest.fn(() => 'cd'.repeat(64)),
  derivePublicKeyFromAccountPathHex: jest.fn(() => 'aa'.repeat(32)),
  publicKeyHashHexFromRawHex: jest.fn(() => 'bb'.repeat(28)),
  signWalletTransactionHex: jest.fn(() => '0102'),
  signWalletTransactionPathsHex: jest.fn(() => '0102'),
  deriveWalletPublicKeyHex: jest.fn(),
  signWalletData: jest.fn(),
}))

const mockDependencies = {
  createCollateralEntry,
}

describe('cip30ExtensionMaker', () => {
  it('should support submitTx', async () => {
    const mockWallet: YoroiWallet = {
      ...mocks.wallet,
      submitTransaction: jest.fn(),
    }

    const cip30 = cip30ExtensionMaker(
      mockWallet,
      mocks.walletMeta,
      mockDependencies,
    )
    const result = await cip30.submitTx(txCbor)
    expect(mockWallet.submitTransaction).toHaveBeenCalled()
    expect(result).toBe(
      '1a6205dc7a5a0493ef64487ca7033d12ba8f85a7d4a6e62d3c8eaa570d74eb53',
    )
  })

  it('should support getUtxos', async () => {
    const cip30 = cip30ExtensionMaker(
      mocks.wallet,
      mocks.walletMeta,
      mockDependencies,
    )
    const result = await cip30.getUtxos(undefined, undefined)
    expect(result).toHaveLength(mocks.wallet.utxos().length)
    expect(typeof result?.[0]).toBe('string')
  })

  it('serializes CIP-30 UTxOs through CML without losing large quantities', async () => {
    const policyId = '11'.repeat(28)
    const address =
      'addr_test1qqqqpvpu82s99aguppk9f02qt84d95hyy6kgn7jt8njpe0cqqzcrcw4q2t63czrv2j75qk026tfwgf4v38ayk08yrjls8jdlam'
    const serializedFixture =
      '82825820222222222222222222222222222222222222222222222222222222222222222202825839000000b03c3aa052f51c086c54bd4059ead2d2e426ac89fa4b3ce41cbf0000b03c3aa052f51c086c54bd4059ead2d2e426ac89fa4b3ce41cbf821b0020000000000001a1581c11111111111111111111111111111111111111111111111111111111a1454e494748541b01b69b4ba630f34e'
    jest
      .mocked(transactionUnspentOutputHex)
      .mockReturnValueOnce(serializedFixture)
    const wallet: YoroiWallet = {
      ...mocks.wallet,
      utxos: () => [
        {
          ...mocks.wallet.utxos()[0]!,
          tx_hash: '22'.repeat(32) as never,
          tx_index: 2,
          receiver: address as never,
          amount: '9007199254740993' as never,
          assets: [
            {
              tokenId: `${policyId}.4e49474854` as never,
              policyId: policyId as never,
              name: 'NIGHT' as never,
              amount: '123456789012345678' as never,
            },
          ],
        },
      ],
    }
    const cip30 = cip30ExtensionMaker(
      wallet,
      mocks.walletMeta,
      mockDependencies,
    )

    const [serialized] = (await cip30.getUtxos()) ?? []
    expect(serialized).toBe(serializedFixture)
    expect(transactionUnspentOutputHex).toHaveBeenCalledWith({
      txHashHex: '22'.repeat(32),
      index: '2',
      address,
      lovelace: '9007199254740993',
      assets: [
        {
          policyIdHex: policyId,
          assetNameHex: '4e49474854',
          quantity: '123456789012345678',
        },
      ],
    })
  })

  it('should support getBalance', async () => {
    const policyId = 'ab'.repeat(28)
    const wallet: YoroiWallet = {
      ...mocks.wallet,
      utxos: () => [
        {
          ...mocks.wallet.utxos()[0]!,
          amount: '2000000' as never,
          assets: [
            {
              tokenId: `${policyId}.00ff` as never,
              policyId: policyId as never,
              name: '00ff' as never,
              amount: '900719925474099312346' as never,
            },
          ],
        },
      ],
    }
    const cip30 = cip30ExtensionMaker(
      wallet,
      mocks.walletMeta,
      mockDependencies,
    )
    const result = cip30.getBalance()
    expect(result).toBe('821a001e8480a0')
    expect(
      jest.requireMock('@yoroi-classic/cml-mobile-bridge').valueFromAmountsHex,
    ).toHaveBeenCalledWith({
      coin: '2000000',
      assets: [
        {
          policyIdHex: policyId,
          assetNameHex: '00ff',
          quantity: '900719925474099312346',
        },
      ],
    })
  })

  it('builds a reorganisation transaction with a CML empty witness set', async () => {
    const {createSendTxFromWallet} = jest.requireMock('../transaction-recipes')
    createSendTxFromWallet.mockResolvedValue({
      cbor: 'unsigned-transaction-cbor',
    })
    const cip30 = cip30ExtensionMaker(mocks.wallet, mocks.walletMeta, {
      createCollateralEntry: jest.fn(() => ({}) as never),
    })

    await expect(cip30.buildReorganisationTx()).resolves.toBe(
      'body-only-transaction-cbor',
    )
    expect(emptyWitnessTransactionHex).toHaveBeenCalledWith(
      'unsigned-transaction-cbor',
    )
  })

  it('should support getUnusedAddresses', async () => {
    const cip30 = cip30ExtensionMaker(
      mocks.wallet,
      mocks.walletMeta,
      mockDependencies,
    )
    const result = cip30.getUnusedAddresses()
    expect(result).toEqual([])
  })

  it('should support getUsedAddresses', async () => {
    const cip30 = cip30ExtensionMaker(
      mocks.wallet,
      mocks.walletMeta,
      mockDependencies,
    )
    const result = cip30.getUsedAddresses()
    expect(result).toEqual([])
  })

  it('should support getChangeAddress', async () => {
    const cip30 = cip30ExtensionMaker(
      mocks.wallet,
      mocks.walletMeta,
      mockDependencies,
    )
    const result = cip30.getChangeAddress()
    expect(result).toBe(
      '0188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c80188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c801',
    )
  })

  it('should support getRewardAddresses', async () => {
    const cip30 = cip30ExtensionMaker(
      {
        ...mocks.wallet,
        rewardAddressHex:
          '0188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c80188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c801',
      },
      mocks.walletMeta,
      mockDependencies,
    )
    const result = cip30.getRewardAddresses()
    expect(result).toHaveLength(1)
    const [address] = result
    expect(address).toBe(
      '0188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c80188524aec35fcf79b3fe5d8d0bbfde719317595565acc910821d3c801',
    )
  })

  it('should support getCollateral', async () => {
    const cip30 = cip30ExtensionMaker(
      mocks.wallet,
      mocks.walletMeta,
      mockDependencies,
    )
    const result = await cip30.getCollateral()
    expect(result).toHaveLength(1)
    const [utxo] = result ?? []
    expect(utxo).toEqual(
      expect.stringContaining(
        '"txHashHex":"22d391c7a97559cb4784bd975214919618acce75cde573a7150a176700e76181"',
      ),
    )
  })

  it('should support signTx', async () => {
    const signRawTx = jest.fn(
      async (_tx: string, _root: string, _paths: Array<Array<number>>) =>
        new Uint8Array([1, 2]),
    )
    const cip30 = cip30ExtensionMaker(
      {
        ...mocks.wallet,
        signRawTx,
      },
      mocks.walletMeta,
      mockDependencies,
    )
    const rootKey = getMasterKeyFromMnemonic(mnemonic)
    const rootKeyHex = Buffer.from(rootKey).toString('hex')
    const result = await cip30.signTx(rootKeyHex, txCbor, true)
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(signRawTx).toHaveBeenCalledWith(
      txCbor,
      rootKeyHex,
      expect.any(Array),
    )
    const signerPaths = signRawTx.mock.calls[0]?.[2]
    expect(signerPaths?.every((path) => path.length === 5)).toBe(true)
  })

  it('should support signData', async () => {
    const rootKey = getMasterKeyFromMnemonic(mnemonic)
    const rootKeyHex = Buffer.from(rootKey).toString('hex')
    const message = '48656C6C6F'
    const addressBech32 =
      'addr1qynqc23tpx4dqps6xgqy9s2l3xz5fxu734wwmzj9uddn0h2z6epfcukqmswgwwfruxh7gaddv9x0d5awccwahnhwleqqc4zkh4'

    const publicKeyHex =
      'be6a4d7e9789dd7458049c971ad783107e7f041c6f1f542b4530d63d5fe5afb1'
    ;(deriveWalletPublicKeyHex as jest.Mock).mockReturnValue(publicKeyHex)
    ;(signWalletData as jest.Mock).mockReturnValue({
      signatureHex:
        '14835b7fca21d7b99a6bee383816a479494b4b221434f13eabe3b0759f5bc758120a026d49706a9ce7d53e6f791f9c84c6ad854de80ba67d53b01b9f129cb60c',
      publicKeyHex,
    })

    const cip30 = cip30ExtensionMaker(
      mocks.wallet,
      mocks.walletMeta,
      mockDependencies,
    )
    const result = await cip30.signData(rootKeyHex, addressBech32, message)

    expect(addressInfoFromAddress).toHaveBeenCalledWith(addressBech32)
    expect(rewardAddressFromAddress).toHaveBeenCalledWith(addressBech32, 1)
    expect(addressToHex).toHaveBeenCalledWith('stake1fixture')
    expect(deriveWalletPublicKeyHex).toHaveBeenCalledWith({
      masterKeyHex: rootKeyHex,
      signerPath: [2147485500, 2147485463, 2147483648, 0, 0],
    })
    expect(signWalletData).toHaveBeenCalledWith({
      messageHex: makeCip8DataToSign(
        Buffer.from(
          '01260c2a2b09aad0061a320042c15f8985449b9e8d5ced8a45e35b37dd42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
          'hex',
        ),
        Buffer.from(message, 'hex'),
        Buffer.from(publicKeyHex, 'hex'),
      ).toString('hex'),
      masterKeyHex: rootKeyHex,
      signerPath: [2147485500, 2147485463, 2147483648, 0, 0],
    })

    expect(result).toEqual({
      signature:
        '845869a30127045820be6a4d7e9789dd7458049c971ad783107e7f041c6f1f542b4530d63d5fe5afb16761646472657373583901260c2a2b09aad0061a320042c15f8985449b9e8d5ced8a45e35b37dd42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40a166686173686564f44548656c6c6f584014835b7fca21d7b99a6bee383816a479494b4b221434f13eabe3b0759f5bc758120a026d49706a9ce7d53e6f791f9c84c6ad854de80ba67d53b01b9f129cb60c',
      key: 'a4010103272006215820be6a4d7e9789dd7458049c971ad783107e7f041c6f1f542b4530d63d5fe5afb1',
    })
  })
})

const mnemonic = [
  'dry balcony arctic what garbage sort',
  'cart shine egg lamp manual bottom',
  'slide assault bus',
].join(' ')

const txCbor =
  '84a30081825820ab67cc8cfc2904a49066255bbfb3893894e777387ff5389f01e86e3fdd91702900018282583901627e29d0e433daf833d8e80c97c575992cc3abadffd5ac2f64086b5dfd1c740673b5b8840a12cfbbd4e6c5c243bf08bbece4c8b3258194b21a001e848082583901fef19c26a68374e0d32be6b3870e611bf1d34d5e26e95ef2812008d1fd1c740673b5b8840a12cfbbd4e6c5c243bf08bbece4c8b3258194b2821a0761679ba4581c1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1ea150776f726c646d6f62696c65746f6b656e1a005ec5a8581c279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3fa144534e454b1901bc581c8654e8b350e298c80d2451beb5ed80fc9eee9f38ce6b039fb8706bc3a1474c4f42535445521a2d5448dd581ca0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235a145484f534b591a0203a048021a0002af65a0f5f6'
