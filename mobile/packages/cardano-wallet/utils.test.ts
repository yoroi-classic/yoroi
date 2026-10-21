import {primaryTokenInfoMainnet} from '@yoroi/blockchains'
import {createUnknownTokenInfo} from '@yoroi/portfolio'
import {SendToken} from '@yoroi/tx'
import {Balance, Portfolio, TokenId} from '@yoroi/types'

import {
  addressToHex as nativeAddressToHex,
  rewardAddressDetailsFromAddress as nativeRewardAddressDetailsFromAddress,
  rewardAddressFromAddress as nativeRewardAddressFromAddress,
  rewardAddressHexFromAccountPublicKey as nativeRewardAddressHexFromAccountPublicKey,
  stakeCredentialHexFromAddress as nativeStakeCredentialHexFromAddress,
  transactionUnspentOutputHex as nativeTransactionUnspentOutputHex,
} from '@yoroi-classic/cml-mobile-bridge'

import {
  deriveRewardAddressDetails,
  deriveRewardAddressFromAddress,
  deriveRewardAddressHex,
  deriveStakeCredentialHex,
  generateCIP30UtxoCbor,
  serializeAddressToHex,
  toSendToken,
  toSendTokenList,
} from './utils'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressToHex: jest.fn(
    () =>
      '002f8b8dd5e6f03495f9753213d0594c8be5571496128d583ad781de78e56e8517f913420618dd04cfa84122f403ddae4ec09b1269279e61bf',
  ),
  rewardAddressFromAddress: jest.fn(() => 'stake_test1fixture'),
  rewardAddressDetailsFromAddress: jest.fn(() => ({
    bech32: 'stake_test1fixture',
    keyHashHex: '42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
  })),
  rewardAddressHexFromAccountPublicKey: jest.fn(
    () => 'e042d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
  ),
  stakeCredentialHexFromAddress: jest.fn(
    () => '8200581ce56e8517f913420618dd04cfa84122f403ddae4ec09b1269279e61bf',
  ),
  transactionUnspentOutputHex: jest.fn(() => 'fixture-cbor'),
}))

describe('generateCIP30UtxoCbor', () => {
  it('uses CML and preserves exact ADA/token quantities', () => {
    const policyId = 'ab'.repeat(28)
    const utxo = {
      amount: '9007199254740993',
      receiver: 'addr_test1fixture',
      tx_hash: 'cd'.repeat(32),
      tx_index: 4,
      utxo_id: `${'cd'.repeat(32)}:4`,
      assets: [
        {
          amount: '18446744073709551615',
          tokenId: `${policyId}.00ff`,
          policyId,
          name: '00ff',
        },
      ],
    } as never

    expect(generateCIP30UtxoCbor(utxo)).toBe('fixture-cbor')
    expect(nativeTransactionUnspentOutputHex).toHaveBeenCalledWith({
      txHashHex: 'cd'.repeat(32),
      index: '4',
      address: 'addr_test1fixture',
      lovelace: '9007199254740993',
      assets: [
        {
          policyIdHex: policyId,
          assetNameHex: '00ff',
          quantity: '18446744073709551615',
        },
      ],
    })
  })
})

describe('serializeAddressToHex', () => {
  it('delegates address serialization to the CML native bridge', () => {
    const address = 'addr_test1fixture'
    expect(serializeAddressToHex(address)).toBe(
      '002f8b8dd5e6f03495f9753213d0594c8be5571496128d583ad781de78e56e8517f913420618dd04cfa84122f403ddae4ec09b1269279e61bf',
    )
    expect(nativeAddressToHex).toHaveBeenCalledWith(address)
  })
})

describe('deriveStakeCredentialHex', () => {
  it('delegates canonical credential extraction to the CML native bridge', () => {
    const address =
      'addr_test1qqhchrw4umcrf90ew5ep85zefj9724c5jcfg6kp667qau789d6z307gnggrp3hgye75yzgh5q0w6unkqnvfxjfu7vxlswtaxme'

    expect(deriveStakeCredentialHex(address)).toBe(
      '8200581ce56e8517f913420618dd04cfa84122f403ddae4ec09b1269279e61bf',
    )
    expect(nativeStakeCredentialHexFromAddress).toHaveBeenCalledWith(address)
  })
})

describe('deriveRewardAddressDetails', () => {
  it('delegates reward-address normalization and key-hash extraction to CML', () => {
    const address = 'e042d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40'
    expect(deriveRewardAddressDetails(address)).toEqual({
      bech32: 'stake_test1fixture',
      keyHashHex: '42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
    })
    expect(nativeRewardAddressDetailsFromAddress).toHaveBeenCalledWith(address)
  })
})

describe('deriveRewardAddressFromAddress', () => {
  it('delegates address conversion to the CML native bridge', () => {
    const baseAddress =
      'addr_test1qqhchrw4umcrf90ew5ep85zefj9724c5jcfg6kp667qau789d6z307gnggrp3hgye75yzgh5q0w6unkqnvfxjfu7vxlswtaxme'

    expect(deriveRewardAddressFromAddress(baseAddress, 0)).toBe(
      'stake_test1fixture',
    )
    expect(nativeRewardAddressFromAddress).toHaveBeenCalledWith(baseAddress, 0)
  })
})

describe('deriveRewardAddressHex', () => {
  it('delegates account xpub derivation to the CML native bridge', () => {
    const accountPublicKeyHex =
      '7cc9d816f272eb78a2db936a839d3bf53fa960dd470ddbaadabb6a7bf2019b837d20b2cd13cbb22b6f6938abea40d425f5539b6bb1fe0813ccb4c21676a7fd6b'

    expect(deriveRewardAddressHex(accountPublicKeyHex, 0, 2, 0)).toBe(
      'e042d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
    )
    expect(nativeRewardAddressHexFromAccountPublicKey).toHaveBeenCalledWith(
      accountPublicKeyHex,
      0,
      2,
      0,
    )
  })
})

describe('toSendTokenList', () => {
  const asSendToken = toSendToken(primaryTokenInfoMainnet)

  it('converts amounts to send token list for tx (lib)', async () => {
    const amounts: Balance.Amounts = {
      [primaryTokenInfoMainnet.id]: '123',
      [secondaryToken.id]: '456',
    } as Balance.Amounts

    const primaryAsToken = asSendToken({
      tokenId: primaryTokenInfoMainnet.id,
      quantity: '123' as Balance.Quantity,
    })
    const secondaryAsToken = asSendToken({
      tokenId: secondaryToken.id,
      quantity: '456' as Balance.Quantity,
    })

    const sendTokenList: Array<SendToken> = [primaryAsToken, secondaryAsToken]

    expect(toSendTokenList(amounts, primaryTokenInfoMainnet)).toEqual(
      sendTokenList,
    )
  })
})

const secondaryToken = createUnknownTokenInfo({
  id: '6b8d07d69639e9413dd637a1a815a7323c69c86abbafb66dbfdb1aa7.' as TokenId,
  name: 'Test Token',
}) as Portfolio.Token.Info
