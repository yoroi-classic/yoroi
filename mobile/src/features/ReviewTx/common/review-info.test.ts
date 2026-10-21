import {cmlReviewBodyToTransactionBody} from './review-info'
import {CmlTransactionReviewInfo} from './types'

describe('cmlReviewBodyToTransactionBody', () => {
  it('adapts normalized CML inputs, outputs, amounts, and mint without numeric coercion', () => {
    const reviewInfo = {
      transactionIdHex: 'ab'.repeat(32),
      isValid: true,
      body: {
        cborHex: '00',
        inputs: [{transactionIdHex: 'cd'.repeat(32), index: '3'}],
        outputs: [
          {
            address: 'addr_test1example',
            addressHex: '00',
            networkId: '0',
            addressKind: 'Base',
            lovelace: '9007199254740993',
            assets: [
              {
                policyIdHex: '11'.repeat(28),
                assetNameHex: 'abcd',
                quantity: '18446744073709551615',
              },
            ],
            datum: null,
            scriptRef: null,
            cborHex: '00',
          },
        ],
        fee: '170000',
        ttl: null,
        validityIntervalStart: null,
        certificates: null,
        withdrawals: null,
        mint: {['22'.repeat(28)]: {beef: '-2'}},
        scriptDataHashHex: null,
        collateralInputs: null,
        requiredSigners: null,
        networkId: null,
        collateralReturn: null,
        totalCollateral: null,
        referenceInputs: null,
        votingProcedures: null,
        proposalProcedures: null,
        currentTreasuryValue: null,
        donation: null,
        auxiliaryDataHashHex: null,
      },
      witnessSet: {
        cborHex: 'a0',
        vkeys: [],
        bootstraps: [],
        nativeScripts: [],
        plutusScripts: [],
        plutusDataCborHex: [],
        redeemers: null,
        cmlJson: {},
      },
      auxiliaryData: null,
    } satisfies CmlTransactionReviewInfo

    expect(cmlReviewBodyToTransactionBody(reviewInfo)).toEqual({
      cmlReviewInfo: reviewInfo,
      inputs: [{transaction_id: 'cd'.repeat(32), index: 3}],
      outputs: [
        {
          address: 'addr_test1example',
          amount: {
            coin: '9007199254740993',
            multiasset: {['11'.repeat(28)]: {abcd: '18446744073709551615'}},
          },
        },
      ],
      fee: '170000',
      reference_inputs: [],
      certs: null,
      mint: [['22'.repeat(28), {beef: '-2'}]],
      auxiliary_data_hash: null,
    })
  })
})
