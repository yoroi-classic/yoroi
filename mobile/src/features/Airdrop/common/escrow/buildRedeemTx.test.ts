import {buildEscrowRedeemTransactionCml} from '@yoroi-classic/cml-mobile-bridge'

import {buildEscrowRedeemTx} from './buildRedeemTx'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  buildEscrowRedeemTransactionCml: jest.fn(() => ({
    cborHex: 'cml-unsigned-tx',
    fee: '1',
  })),
}))

jest.mock('./datumParser', () => ({
  buildUpdatedDatumHex: jest.fn(() => 'd87980'),
}))

const cmlBuilderMock = jest.mocked(buildEscrowRedeemTransactionCml)

describe('buildEscrowRedeemTx CML route', () => {
  beforeEach(() => cmlBuilderMock.mockClear())

  it('passes the CWB reference output, inline datum, assets, exunits and protocol fees to CML', async () => {
    const primaryTokenId = 'ada.lovelace' as never
    const fundingUtxo = {
      receiver:
        'addr_test1qqqqpvpu82s99aguppk9f02qt84d95hyy6kgn7jt8njpe0cqqzcrcw4q2t63czrv2j75qk026tfwgf4v38ayk08yrjls8jdlam',
      txHash: '11'.repeat(32),
      txIndex: 1,
      balance: {[primaryTokenId]: '10000000'},
      toTransactionUnspentOutputHex: () => '',
    }
    const collateralUtxo = {
      ...fundingUtxo,
      txHash: '22'.repeat(32),
      balance: {[primaryTokenId]: '5000000'},
    }
    const protocolParams = {
      keyDeposit: '2000000',
      linearFee: {coefficient: '44', constant: '155381'},
      minimumUtxoVal: '1000000',
      coinsPerUtxoByte: '4310',
      poolDeposit: '500000000',
      networkId: 0,
      collateralPercentage: '150',
      refScriptCoinsPerByte: {numerator: '15', denominator: '1'},
      refScriptTierStepBytes: '25600',
      refScriptMultiplier: '1.2',
      scriptExecutionPrices: {
        memory: {numerator: '577', denominator: '10000'},
        cpu: {numerator: '721', denominator: '10000000'},
      },
      plutusV3CostModel: [0],
    }

    await expect(
      buildEscrowRedeemTx({
        escrowUtxo: {
          txHash: '33'.repeat(32),
          txIndex: 0,
          address:
            'addr_test1wzzfgjazt5ts34cstrhzaac4xav8x7z2m3vg76s8qmaztzglsw8k5',
          nightAmount: '2000000',
          adaAmount: '3000000',
          datumHex: 'd87980',
          datum: {
            paymentCredHash: 'ab'.repeat(28),
            stakingCredHash: null,
            nightPerThaw: 1000000n,
            nextThawTime: 1650000000000n,
            thawsRemaining: 2n,
            interval: 1000n,
          },
          referenceScriptOutput: {
            txHash: '44'.repeat(32),
            txIndex: 2,
            address:
              'addr_test1qqqqpvpu82s99aguppk9f02qt84d95hyy6kgn7jt8njpe0cqqzcrcw4q2t63czrv2j75qk026tfwgf4v38ayk08yrjls8jdlam',
            value: '2000000',
            referenceScriptHash:
              '5986bfcc0cbfc60dec8df87715cc95d03817aac386b0e9d33da03b39',
            referenceScriptSize: 1,
            referenceScriptType: 'plutusV3',
            referenceScriptCborHex: 'aa',
            assets: [],
          },
        },
        eligibleAddress:
          'addr_test1qqqqpvpu82s99aguppk9f02qt84d95hyy6kgn7jt8njpe0cqqzcrcw4q2t63czrv2j75qk026tfwgf4v38ayk08yrjls8jdlam',
        fundingUtxos: [fundingUtxo] as never,
        collateralUtxo: collateralUtxo as never,
        changeAddress: fundingUtxo.receiver,
        protocolParams,
        primaryTokenId,
        currentSlot: 100,
      }),
    ).resolves.toBe('cml-unsigned-tx')

    expect(cmlBuilderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scriptInput: expect.objectContaining({inlineDatumCborHex: 'd87980'}),
        referenceScriptInput: expect.objectContaining({
          txHashHex: '44'.repeat(32),
          index: '2',
        }),
        referenceScriptCborHex: 'aa',
        referenceScriptSize: '1',
        redeemerCborHex: 'd87980',
        redeemerMem: '900000',
        redeemerSteps: '250000000',
        outputs: expect.arrayContaining([
          expect.objectContaining({datumCborHex: 'd87980'}),
        ]),
        refScriptCoinsPerByte: {numerator: '15', denominator: '1'},
        refScriptTierStepBytes: '25600',
        refScriptMultiplier: '1.2',
        exUnitPricesMemory: {numerator: '577', denominator: '10000'},
        exUnitPricesSteps: {numerator: '721', denominator: '10000000'},
        plutusV3CostModel: [0],
      }),
    )
  })
})
