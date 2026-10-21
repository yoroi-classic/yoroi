import {primaryTokenId} from '@yoroi/portfolio'
import {Address, Balance, TransactionHash} from '@yoroi/types'

import {addressToHex} from '@yoroi-classic/cml-mobile-bridge'

import {ModernUtxo} from '../utxo/models'
import {cmlAssetsFromAmounts, cmlPaymentInputFromUtxo} from './cml-value'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressToHex: jest.fn(() => `01${'00'.repeat(28)}`),
}))

describe('CML value DTO conversion', () => {
  const policyId = 'ab'.repeat(28)

  it('preserves exact integer strings and token-name encoding beyond JS safe integers', () => {
    const tokenId = `${policyId}.00ff`
    const amounts: Balance.Amounts = {
      [primaryTokenId]: '9007199254740993' as Balance.Quantity,
      [tokenId]: '18446744073709551615' as Balance.Quantity,
      [`${policyId}.`]: '0' as Balance.Quantity,
    }

    expect(cmlAssetsFromAmounts(amounts, primaryTokenId)).toEqual([
      {
        policyIdHex: policyId,
        assetNameHex: '00ff',
        quantity: '18446744073709551615',
      },
    ])
  })

  it('maps a spendable UTxO without number coercion', () => {
    const tokenId = `${policyId}.00ff`
    const utxo: ModernUtxo = {
      receiver: 'addr_test1qrecipient' as Address,
      txHash: 'cd'.repeat(32) as TransactionHash,
      txIndex: 17,
      balance: {
        [primaryTokenId]: '9007199254740993' as Balance.Quantity,
        [tokenId]: '18446744073709551615' as Balance.Quantity,
      },
      toTransactionUnspentOutputHex: () => '',
    }

    expect(cmlPaymentInputFromUtxo(utxo, primaryTokenId)).toEqual({
      transactionHashHex: 'cd'.repeat(32),
      index: '17',
      address: 'addr_test1qrecipient',
      addressHex: `01${'00'.repeat(28)}`,
      isBootstrap: false,
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

  it('identifies Byron UTxO source addresses from their serialized header', () => {
    jest.mocked(addressToHex).mockReturnValueOnce(`80${'00'.repeat(28)}`)
    const utxo: ModernUtxo = {
      receiver: 'Ae2fixture' as Address,
      txHash: 'cd'.repeat(32) as TransactionHash,
      txIndex: 0,
      balance: {[primaryTokenId]: '1000000' as Balance.Quantity},
      toTransactionUnspentOutputHex: () => '',
    }

    expect(cmlPaymentInputFromUtxo(utxo, primaryTokenId)).toMatchObject({
      address: 'Ae2fixture',
      addressHex: `80${'00'.repeat(28)}`,
      isBootstrap: true,
    })
  })
})
