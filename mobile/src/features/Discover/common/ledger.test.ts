import {
  AddressType,
  CertificateType,
  CredentialParamsType,
  DatumType,
  TransactionSigningMode,
  TxOutputDestinationType,
  TxOutputFormat,
} from '@cardano-foundation/ledgerjs-hw-app-cardano'
import {transactionReviewInfoJson} from '@yoroi-classic/cml-mobile-bridge'
import {decode} from 'cbor2'

import {toLedgerSignRequest} from './ledger'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  transactionReviewInfoJson: jest.fn(),
}))

jest.mock('cbor2', () => ({decode: jest.fn()}))

describe('toLedgerSignRequest CML adapter', () => {
  it('builds the Ledger request from CML-parsed transaction fields', async () => {
    ;(decode as jest.Mock).mockReturnValue([new Map([[0, []]])])
    ;(transactionReviewInfoJson as jest.Mock).mockReturnValue(
      JSON.stringify({
        body: {
          inputs: [{transactionIdHex: 'ab'.repeat(32), index: '0'}],
          outputs: [],
          fee: '168581',
          ttl: '123456',
          validityIntervalStart: null,
          certificates: null,
          withdrawals: null,
          mint: null,
          scriptDataHashHex: null,
          auxiliaryDataHashHex: null,
          collateralInputs: null,
          requiredSigners: null,
          collateralReturn: null,
          totalCollateral: null,
          referenceInputs: null,
          networkId: '0',
        },
      }),
    )

    const request = await toLedgerSignRequest(
      '84a10080a0f5f6',
      0,
      764824073,
      {},
      {},
      [],
    )

    expect(transactionReviewInfoJson).toHaveBeenCalledWith('84a10080a0f5f6')
    expect(request.signingMode).toBe(
      TransactionSigningMode.ORDINARY_TRANSACTION,
    )
    expect(request.tx).toMatchObject({
      network: {networkId: 0, protocolMagic: 764824073},
      inputs: [{txHashHex: 'ab'.repeat(32), outputIndex: 0, path: null}],
      outputs: [],
      fee: '168581',
      ttl: 123456,
      certificates: null,
      withdrawals: null,
      collateralInputs: null,
      referenceInputs: null,
      includeNetworkId: true,
    })
    expect(request.options).toEqual({tagCborSets: false})
  })

  it('preserves normalized inputs, token outputs, certificates, withdrawals and Plutus fields', async () => {
    const policyId = '22'.repeat(28)
    const assetName = 'abcd'
    const ownOutputHex = `61${'11'.repeat(28)}`
    const stakeHash = '33'.repeat(28)
    const ownRewardAddressHex = `e1${stakeHash}`
    const txHash = 'ab'.repeat(32)
    const collateralHash = 'cd'.repeat(32)
    const referenceHash = 'ef'.repeat(32)
    ;(decode as jest.Mock).mockReturnValue(
      new Map<unknown, unknown>([
        [0, new Set([new Uint8Array(34).fill(1)])],
        [4, [[0, [0, new Uint8Array(28).fill(0x44)]]]],
        [
          9,
          new Map([
            [
              Uint8Array.from(Buffer.from(policyId, 'hex')),
              new Map([[Uint8Array.from(Buffer.from(assetName, 'hex')), 9n]]),
            ],
          ]),
        ],
      ]),
    )
    ;(transactionReviewInfoJson as jest.Mock).mockReturnValue(
      JSON.stringify({
        body: {
          inputs: [{transactionIdHex: txHash, index: '1'}],
          outputs: [
            {
              address: null,
              addressHex: ownOutputHex,
              lovelace: '3000000',
              assets: [
                {
                  policyIdHex: policyId,
                  assetNameHex: assetName,
                  quantity: '90071992547409931234',
                },
              ],
              datum: {kind: 'inline', cborHex: '820102'},
              scriptRef: {cborHex: '82005820' + '55'.repeat(32)},
              cborHex: 'a0',
            },
          ],
          fee: '168581',
          ttl: null,
          validityIntervalStart: '42',
          certificates: null,
          withdrawals: [
            {
              rewardAddressHex: ownRewardAddressHex,
              amount: '12345678901234567890',
            },
          ],
          mint: null,
          scriptDataHashHex: '66'.repeat(32),
          auxiliaryDataHashHex: null,
          collateralInputs: [{transactionIdHex: collateralHash, index: '2'}],
          requiredSigners: ['77'.repeat(28)],
          collateralReturn: null,
          totalCollateral: '5000000',
          referenceInputs: [{transactionIdHex: referenceHash, index: '3'}],
          networkId: '1',
        },
      }),
    )

    const request = await toLedgerSignRequest(
      '84a10080a0f5f6',
      1,
      764824073,
      {[ownOutputHex]: [1852, 1815, 0, 1, 4]},
      {[ownRewardAddressHex]: [1852, 1815, 0, 2, 0]},
      [
        {txHash, txIndex: 1, addressing: {path: [1852, 1815, 0, 0, 0]}},
        {
          txHash: collateralHash,
          txIndex: 2,
          addressing: {path: [1852, 1815, 0, 0, 1]},
        },
      ] as never,
      [],
      [1852, 1815, 0, 2, 0],
    )

    expect(request.signingMode).toBe(TransactionSigningMode.PLUTUS_TRANSACTION)
    expect(request.tx).toMatchObject({
      inputs: [
        {txHashHex: txHash, outputIndex: 1, path: [1852, 1815, 0, 0, 0]},
      ],
      collateralInputs: [
        {
          txHashHex: collateralHash,
          outputIndex: 2,
          path: [1852, 1815, 0, 0, 1],
        },
      ],
      referenceInputs: [{txHashHex: referenceHash, outputIndex: 3, path: null}],
      validityIntervalStart: 42,
      totalCollateral: '5000000',
      scriptDataHashHex: '66'.repeat(32),
      certificates: [
        {
          type: CertificateType.STAKE_REGISTRATION,
          params: {
            stakeCredential: {
              type: CredentialParamsType.KEY_PATH,
              keyPath: [1852, 1815, 0, 2, 0],
            },
          },
        },
      ],
      mint: [
        {
          policyIdHex: policyId,
          tokens: [{assetNameHex: assetName, amount: '9'}],
        },
      ],
      outputs: [
        {
          format: TxOutputFormat.MAP_BABBAGE,
          amount: '3000000',
          tokenBundle: [
            {
              policyIdHex: policyId,
              tokens: [
                {assetNameHex: assetName, amount: '90071992547409931234'},
              ],
            },
          ],
          datum: {type: DatumType.INLINE, datumHex: '820102'},
          referenceScriptHex: '82005820' + '55'.repeat(32),
          destination: {
            type: TxOutputDestinationType.DEVICE_OWNED,
            params: {
              type: AddressType.ENTERPRISE_KEY,
              params: {spendingPath: [1852, 1815, 0, 1, 4]},
            },
          },
        },
      ],
      withdrawals: [
        {
          amount: '12345678901234567890',
          stakeCredential: {
            type: CredentialParamsType.KEY_PATH,
            keyPath: [1852, 1815, 0, 2, 0],
          },
        },
      ],
    })
    expect(request.options).toEqual({tagCborSets: true})
  })
})
