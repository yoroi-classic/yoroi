import {Fetcher} from '@yoroi/common'
import {Branded} from '@yoroi/types'

import {createCardanoWalletBackendUtxoSource} from './current-state-utxo-source'

const TX_HASH = 'ab'.repeat(32)
const POLICY_ID = 'cd'.repeat(28)
const STAKE_ADDRESS = Branded.asStakingAddress('stake_test1account')

const validAccountUtxo = () => ({
  txHash: TX_HASH,
  outputIndex: 2,
  address: 'addr_test1receiver',
  value: '9007199254740993000000',
  assets: [
    {
      policyId: POLICY_ID,
      assetName: '414243',
      quantity: '9007199254740993000001',
    },
  ],
  datumHash: 'de'.repeat(32),
  inlineDatum: 'd87980',
  referenceScriptHash: 'ca'.repeat(28),
})

describe('cardano-wallet-backend current-state UTxO source', () => {
  it('reads the complete account state and preserves integer quantities', async () => {
    const request = jest.fn(async () => [
      validAccountUtxo(),
    ]) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example/',
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).resolves.toEqual([
      {
        utxoId: `${TX_HASH}:2`,
        txHash: TX_HASH,
        txIndex: 2,
        receiver: 'addr_test1receiver',
        amount: '9007199254740993000000',
        assets: [
          {
            assetId: `${POLICY_ID}.414243`,
            policyId: POLICY_ID,
            name: '414243',
            amount: '9007199254740993000001',
          },
        ],
        datumHash: 'de'.repeat(32),
        inlineDatum: 'd87980',
        referenceScriptHash: 'ca'.repeat(28),
      },
    ])
    expect(request).toHaveBeenCalledWith({
      url: `https://wallet.example/v1/account/${STAKE_ADDRESS}/utxos`,
      method: 'GET',
      headers: {Accept: 'application/json'},
    })
  })

  it('rejects malformed responses before they reach transaction construction', async () => {
    const request = jest.fn(async () => [
      {
        txHash: TX_HASH,
        outputIndex: 0,
        address: 'addr_test1receiver',
        value: 42,
        assets: [],
      },
    ]) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'Invalid cardano-wallet-backend account UTxO response',
    )
  })

  it('propagates request errors so the sync layer can apply retry policy', async () => {
    const request = jest.fn(async () => {
      throw new Error('backend unavailable')
    }) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'backend unavailable',
    )
  })

  it.each([
    ['datumHash', 'deadbeef'],
    ['inlineDatum', 'abc'],
    ['referenceScriptHash', 'cafe'],
  ])('rejects a malformed %s', async (field, value) => {
    const request = jest.fn(async () => [
      {
        txHash: TX_HASH,
        outputIndex: 0,
        address: 'addr_test1receiver',
        value: '42',
        assets: [],
        [field]: value,
      },
    ]) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'Invalid cardano-wallet-backend account UTxO response',
    )
  })

  it.each<
    [
      string,
      (utxo: ReturnType<typeof validAccountUtxo>) => Record<string, unknown>,
    ]
  >([
    ['transaction hash', (utxo) => ({...utxo, txHash: 'bad'})],
    ['output index', (utxo) => ({...utxo, outputIndex: -1})],
    ['address', (utxo) => ({...utxo, address: ''})],
    [
      'policy id',
      (utxo) => ({
        ...utxo,
        assets: [{...utxo.assets[0], policyId: 'bad'}],
      }),
    ],
    [
      'asset name',
      (utxo) => ({
        ...utxo,
        assets: [{...utxo.assets[0], assetName: 'abc'}],
      }),
    ],
    ['lovelace quantity', (utxo) => ({...utxo, value: '01'})],
    [
      'asset quantity',
      (utxo) => ({
        ...utxo,
        assets: [{...utxo.assets[0], quantity: '01'}],
      }),
    ],
  ])('pins validation for malformed %s', async (_name, makeInvalid) => {
    const request = jest.fn(async () => [
      makeInvalid(validAccountUtxo()),
    ]) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'Invalid cardano-wallet-backend account UTxO response',
    )
  })

  it('fails closed at the unpaged Koios response limit', async () => {
    const request = jest.fn(async () =>
      Array.from({length: 1000}, validAccountUtxo),
    ) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'cardano-wallet-backend account UTxO response may be truncated',
    )
  })

  it('requires a configured backend URL', () => {
    expect(() => createCardanoWalletBackendUtxoSource('///')).toThrow(
      'cardano-wallet-backend base URL is required',
    )
  })
})
