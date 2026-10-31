import type {YoroiWallet} from '@yoroi/cardano-wallet'
import type {Portfolio} from '@yoroi/types'

import {CmlReviewOutput, CmlTransactionReviewInfo} from '../types'
import {formatCmlOutput, formatCmlWitnessSet} from './useFormattedTx'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn(() => ({hex: '70aa', isValid: true})),
  datumInfoFromOutputCborHex: jest.fn(() => 'null'),
}))

describe('CML transaction review formatting', () => {
  const wallet = {
    portfolioPrimaryTokenInfo: {id: 'lovelace'},
    networkManager: {chainId: 0},
    internalAddresses: () => [],
    externalAddresses: () => [],
  } as unknown as YoroiWallet

  it('formats CML outputs and keeps the real transaction output reference', () => {
    const tokenInfo = {id: 'ab'.repeat(28) + '.01'} as Portfolio.Token.Info
    const tokenInfos = new Map([[tokenInfo.id, tokenInfo]])
    const output: CmlReviewOutput = {
      address: 'addr_test1script',
      addressHex: '70aa',
      networkId: '0',
      addressKind: 'enterpriseScript',
      lovelace: '2000000',
      assets: [
        {
          policyIdHex: 'ab'.repeat(28),
          assetNameHex: '01',
          quantity: '9007199254740993',
        },
      ],
      datum: null,
      scriptRef: {
        type: 'native',
        hashHex: 'cd'.repeat(28),
        size: '3',
        bytesHex: '010203',
        cborHex: '43010203',
      },
      cborHex: 'a0',
    }

    const formatted = formatCmlOutput(
      wallet,
      'ef'.repeat(32),
      output,
      tokenInfos,
      2,
    )

    expect(formatted.address).toBe('addr_test1script')
    expect(formatted.assets).toHaveLength(2)
    expect(formatted.assets[1]?.quantity).toBe('9007199254740993')
    expect(formatted.referenceScript).toEqual({
      txHash: 'ef'.repeat(32),
      txIndex: 2,
      scriptHash: 'cd'.repeat(28),
      scriptType: 'native',
      scriptSize: 3,
    })
  })

  it('normalizes all witness categories and returns null for an empty set', () => {
    const baseInfo = {
      witnessSet: {
        cborHex: 'a0',
        vkeys: [{publicKeyHex: '01', signatureHex: '02'}],
        bootstraps: [
          {
            publicKeyHex: '03',
            signatureHex: '04',
            chainCodeHex: '05',
            attributes: {hex: '06'},
          },
        ],
        nativeScripts: [{hashHex: '07', cborHex: 'a0'}],
        plutusScripts: [
          {type: 'plutusV3', hashHex: '08', bytesHex: '09', cborHex: '4109'},
        ],
        plutusDataCborHex: ['80'],
        redeemers: null,
        cmlJson: null,
      },
    } as unknown as CmlTransactionReviewInfo

    expect(formatCmlWitnessSet(baseInfo)).toEqual({
      vkeys: [{publicKey: '01', signature: '02'}],
      bootstraps: [
        {
          publicKey: '03',
          signature: '04',
          chaincode: '05',
          attributes: '{"hex":"06"}',
        },
      ],
      nativeScripts: [{scriptHash: '07'}],
      plutusScripts: [{scriptHash: '08', scriptBytes: '09'}],
      plutusData: [{data: '80'}],
    })

    expect(
      formatCmlWitnessSet({
        witnessSet: {
          vkeys: [],
          bootstraps: [],
          nativeScripts: [],
          plutusScripts: [],
          plutusDataCborHex: [],
        },
      } as unknown as CmlTransactionReviewInfo),
    ).toBeNull()
  })
})
