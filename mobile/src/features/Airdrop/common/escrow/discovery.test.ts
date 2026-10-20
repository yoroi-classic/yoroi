import {getAddressUtxos, getUtxosByRef} from '@yoroi/cardano-wallet'
import {Chain} from '@yoroi/types'

import {
  ESCROW_SCRIPT_HASH,
  NIGHT_ASSET_NAME_HEX,
  NIGHT_POLICY_ID,
} from './constants'
import {parseEscrowDatum} from './datumParser'
import {discoverEscrowUtxo} from './discovery'

jest.mock('@yoroi/cardano-wallet', () => ({
  getAddressUtxos: jest.fn(),
  getUtxosByRef: jest.fn(),
}))

jest.mock('./datumParser', () => ({
  parseEscrowDatum: jest.fn(() => ({
    paymentCredHash: 'a'.repeat(56),
    stakingCredHash: null,
    nightPerThaw: 1n,
    nextThawTime: 2n,
    thawsRemaining: 3n,
    interval: 4n,
  })),
}))

const escrowAddress = 'addr_test1wqtest'
const referenceOutput = {
  txHash: 'b'.repeat(64),
  outputIndex: 0,
  address: 'addr_test1vref',
  value: '2000000',
  assets: [],
  referenceScriptHash: ESCROW_SCRIPT_HASH,
  referenceScript: {
    hash: ESCROW_SCRIPT_HASH,
    size: 4,
    type: 'plutusV3',
    bytes: '4e010000',
  },
  spent: false,
}

const escrowOutput = {
  txHash: 'c'.repeat(64),
  outputIndex: 1,
  address: escrowAddress,
  value: '9000000',
  assets: [
    {
      policyId: NIGHT_POLICY_ID,
      assetName: NIGHT_ASSET_NAME_HEX,
      quantity: '5',
    },
  ],
  inlineDatum: 'd87980',
  spent: false,
}

describe('discoverEscrowUtxo', () => {
  const getAddressUtxosMock = jest.mocked(getAddressUtxos)
  const getUtxosByRefMock = jest.mocked(getUtxosByRef)

  beforeEach(() => {
    jest.clearAllMocks()
    getAddressUtxosMock.mockResolvedValue([escrowOutput] as never)
    getUtxosByRefMock.mockResolvedValue([referenceOutput] as never)
  })

  it('loads an escrow output and its CWB-resolved reference script output', async () => {
    const result = await discoverEscrowUtxo(
      escrowAddress,
      'https://cwb.test',
      Chain.Network.Preprod,
    )

    expect(getAddressUtxosMock).toHaveBeenCalledWith(
      escrowAddress,
      'https://cwb.test',
      Chain.Network.Preprod,
    )
    expect(getUtxosByRefMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringMatching(/#[0-9]+$/)]),
      'https://cwb.test',
      Chain.Network.Preprod,
    )
    expect(parseEscrowDatum).toHaveBeenCalledWith('d87980')
    expect(result.referenceScriptOutput).toMatchObject({
      txHash: referenceOutput.txHash,
      txIndex: 0,
      referenceScriptHash: ESCROW_SCRIPT_HASH,
      referenceScriptCborHex: '4e010000',
    })
  })

  it('rejects empty escrow address results', async () => {
    getAddressUtxosMock.mockResolvedValue([])

    await expect(
      discoverEscrowUtxo(
        escrowAddress,
        'https://cwb.test',
        Chain.Network.Preprod,
      ),
    ).rejects.toThrow('No escrow UTxO found at address')
    expect(getUtxosByRefMock).not.toHaveBeenCalled()
  })

  it('rejects a used script address without the escrow token and datum', async () => {
    getAddressUtxosMock.mockResolvedValue([
      {...escrowOutput, assets: [], inlineDatum: undefined},
    ] as never)

    await expect(
      discoverEscrowUtxo(
        escrowAddress,
        'https://cwb.test',
        Chain.Network.Preprod,
      ),
    ).rejects.toThrow('No escrow UTxO found at address')
    expect(getUtxosByRefMock).not.toHaveBeenCalled()
  })

  it('fails closed when the live reference output has no script bytes', async () => {
    getUtxosByRefMock.mockResolvedValue([
      {
        ...referenceOutput,
        referenceScript: {...referenceOutput.referenceScript, bytes: undefined},
      },
    ] as never)

    await expect(
      discoverEscrowUtxo(
        escrowAddress,
        'https://cwb.test',
        Chain.Network.Preprod,
      ),
    ).rejects.toThrow('No live escrow reference-script UTxO with script CBOR')
  })

  it('fails closed when the live reference script byte size does not match metadata', async () => {
    getUtxosByRefMock.mockResolvedValue([
      {
        ...referenceOutput,
        referenceScript: {...referenceOutput.referenceScript, size: 5},
      },
    ] as never)

    await expect(
      discoverEscrowUtxo(
        escrowAddress,
        'https://cwb.test',
        Chain.Network.Preprod,
      ),
    ).rejects.toThrow('No live escrow reference-script UTxO with script CBOR')
  })
})
