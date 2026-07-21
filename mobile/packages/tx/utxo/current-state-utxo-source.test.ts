import {Fetcher} from '@yoroi/common'
import {Branded, Chain} from '@yoroi/types'

import {createCardanoWalletBackendUtxoSource} from './current-state-utxo-source'

const TX_HASH = 'ab'.repeat(32)
const POLICY_ID = 'cd'.repeat(28)
const STAKE_ADDRESS = Branded.asStakingAddress('stake_test1account')
const PREPROD_STATUS = {network: Chain.Network.Preprod, chain: 'ok'}

const preprodRequest = (
  accountResponse: unknown,
): jest.MockedFunction<Fetcher> =>
  jest.fn(async (options: {url: string}) =>
    options.url.endsWith('/v1/status') ? PREPROD_STATUS : accountResponse,
  ) as unknown as jest.MockedFunction<Fetcher>

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
  it('maps account state and preserves integer quantities', async () => {
    const request = preprodRequest([validAccountUtxo()])
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example/',
      Chain.Network.Preprod,
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
    expect(request).toHaveBeenNthCalledWith(1, {
      url: 'https://wallet.example/v1/status',
      method: 'GET',
      headers: {Accept: 'application/json'},
    })
    expect(request).toHaveBeenNthCalledWith(2, {
      url: `https://wallet.example/v1/account/${STAKE_ADDRESS}/utxos`,
      method: 'GET',
      headers: {Accept: 'application/json'},
    })
  })

  it('rejects malformed responses before they reach transaction construction', async () => {
    const request = preprodRequest([
      {
        txHash: TX_HASH,
        outputIndex: 0,
        address: 'addr_test1receiver',
        value: 42,
        assets: [],
      },
    ])
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Preprod,
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'Invalid cardano-wallet-backend account UTxO response',
    )
  })

  it('propagates request errors so the sync layer can apply retry policy', async () => {
    const request = jest.fn(async (options: {url: string}) => {
      if (options.url.endsWith('/v1/status')) return PREPROD_STATUS
      throw new Error('backend unavailable')
    }) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Preprod,
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
    const request = preprodRequest([
      {
        txHash: TX_HASH,
        outputIndex: 0,
        address: 'addr_test1receiver',
        value: '42',
        assets: [],
        [field]: value,
      },
    ])
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Preprod,
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
    const request = preprodRequest([makeInvalid(validAccountUtxo())])
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Preprod,
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'Invalid cardano-wallet-backend account UTxO response',
    )
  })

  it('fails closed at the legacy backend row cap', async () => {
    const request = preprodRequest(
      Array.from({length: 1_000}, (_, outputIndex) => ({
        ...validAccountUtxo(),
        outputIndex,
      })),
    )
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Preprod,
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'cardano-wallet-backend account UTxO response may be incomplete',
    )
  })

  it('rejects a backend serving a different network before reading UTxOs', async () => {
    const request = jest.fn(async () => ({
      network: Chain.Network.Mainnet,
      chain: 'ok',
    })) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Preprod,
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'cardano-wallet-backend network mismatch',
    )
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each(['stale', 'down'] as const)(
    'rejects backend chain state %s before reading UTxOs',
    async (chain) => {
      const request = jest.fn(async () => ({
        network: Chain.Network.Preprod,
        chain,
      })) as unknown as jest.MockedFunction<Fetcher>
      const source = createCardanoWalletBackendUtxoSource(
        'https://wallet.example',
        Chain.Network.Preprod,
        request,
      )

      await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
        'cardano-wallet-backend chain data is not ready',
      )
      expect(request).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects a stake address from a different selected network', async () => {
    const request = preprodRequest([])
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Preprod,
      request,
    )

    await expect(
      source.getAccountUtxos(Branded.asStakingAddress('stake1account')),
    ).rejects.toThrow('Stake address does not match the selected network')
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects an output address from a different network', async () => {
    const request = preprodRequest([
      {...validAccountUtxo(), address: 'addr1mainnet'},
    ])
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Preprod,
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'cardano-wallet-backend account UTxO network mismatch',
    )
  })

  it('supports a mainnet backend, stake address, and output together', async () => {
    const request = jest.fn(async (options: {url: string}) =>
      options.url.endsWith('/v1/status')
        ? {network: Chain.Network.Mainnet, chain: 'ok'}
        : [{...validAccountUtxo(), address: 'addr1receiver'}],
    ) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Mainnet,
      request,
    )

    await expect(
      source.getAccountUtxos(Branded.asStakingAddress('stake1account')),
    ).resolves.toEqual([expect.objectContaining({receiver: 'addr1receiver'})])
  })

  it('rejects duplicate output references', async () => {
    const request = preprodRequest([validAccountUtxo(), validAccountUtxo()])
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Preprod,
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'Duplicate cardano-wallet-backend account UTxO',
    )
  })

  it('rejects duplicate assets within an output', async () => {
    const valid = validAccountUtxo()
    const request = preprodRequest([
      {...valid, assets: [valid.assets[0], valid.assets[0]]},
    ])
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      Chain.Network.Preprod,
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'Duplicate asset in cardano-wallet-backend account UTxO',
    )
  })

  it('requires a configured backend URL', () => {
    expect(() =>
      createCardanoWalletBackendUtxoSource('///', Chain.Network.Preprod),
    ).toThrow('cardano-wallet-backend base URL is required')
  })
})
