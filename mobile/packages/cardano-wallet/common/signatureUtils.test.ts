import type {Wallet} from '@yoroi/types'

import type {YoroiWallet} from '../types'
import {convertBech32ToHex, getTransactionSigners} from './signatureUtils'

describe('convertBech32ToHex', () => {
  it('returns the address bytes produced by the CML parser', () => {
    const address =
      'addr1qynqc23tpx4dqps6xgqy9s2l3xz5fxu734wwmzj9uddn0h2z6epfcukqmswgwwfruxh7gaddv9x0d5awccwahnhwleqqc4zkh4'
    const expectedHex =
      '01260c2a2b09aad0061a320042c15f8985449b9e8d5ced8a45e35b37dd42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40'
    const {addressToHex} = jest.requireMock('@yoroi-classic/cml-mobile-bridge')
    addressToHex.mockReturnValueOnce(expectedHex)

    expect(convertBech32ToHex(address)).toBe(expectedHex)
    expect(addressToHex).toHaveBeenCalledWith(address)
  })
})

describe('getTransactionSigners', () => {
  it('maps required and nested native-script key hashes to the owned address path', async () => {
    const address = 'addr1wallet-owned-fixture'
    const paymentKeyHash = '11'.repeat(28)
    const stakingKeyHash = '22'.repeat(28)
    const bridge = jest.requireMock('@yoroi-classic/cml-mobile-bridge')
    bridge.transactionSigningRequirementsJson.mockReturnValueOnce(
      JSON.stringify({
        inputs: [],
        collateralInputs: [],
        requiredSigners: [paymentKeyHash],
        hasStakingCertificate: false,
        withdrawals: [],
        nativeScriptKeyHashesHex: [paymentKeyHash],
      }),
    )
    bridge.addressInfoFromAddress.mockReturnValueOnce({
      hex: `01${paymentKeyHash}${stakingKeyHash}`,
      networkId: 1,
      bech32: address,
      isValid: true,
    })

    const wallet = {
      accountVisual: 0,
      allUtxos: () => [],
      externalAddresses: () => [address],
      internalAddresses: () => [],
      portfolioPrimaryTokenInfo: {id: '.'},
      getStakingKey: () => ({hash: () => ({toHex: () => stakingKeyHash})}),
    } as unknown as YoroiWallet
    const meta = {implementation: 'cardano-cip1852'} as Wallet.Meta

    await expect(
      getTransactionSigners('fixture-cbor', wallet, meta),
    ).resolves.toEqual([[2_147_485_500, 2_147_485_463, 2_147_483_648, 0, 0]])
    expect(bridge.transactionSigningRequirementsJson).toHaveBeenCalledWith(
      'fixture-cbor',
    )
  })
})
