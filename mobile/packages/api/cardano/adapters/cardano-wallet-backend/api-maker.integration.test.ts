import {cardanoWalletBackendV1Maker} from './api-maker'

const integrationIt = process.env.CWB_INTEGRATION_URL ? it : it.skip

integrationIt(
  'reads an address UTxO and resolves its reference through CWB',
  async () => {
    const baseUrl = process.env.CWB_INTEGRATION_URL!
    const address =
      'addr_test1qrgpjmyy8zk9nuza24a0f4e7mgp9gd6h3uayp0rqnjnkl54v4dlyj0kwfs0x4e38a7047lymzp37tx0y42glslcdtzhqzp57km'
    const api = cardanoWalletBackendV1Maker({
      config: {baseUrl, submitExpectedNetwork: 'preprod'},
    })

    const utxos = await api.getAddressUtxos(address)
    expect(utxos.length).toBeGreaterThan(0)
    expect(utxos.every((utxo) => utxo.address === address)).toBe(true)

    const first = utxos[0]
    if (!first) throw new Error('Integration address did not return a UTxO')
    const resolved = await api.getUtxosByRef([
      `${first.txHash}#${first.outputIndex}`,
    ])
    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      txHash: first.txHash,
      outputIndex: first.outputIndex,
      address,
      spent: false,
    })
  },
)

const mainnetIntegrationIt = process.env.CWB_MAINNET_INTEGRATION_URL
  ? it
  : it.skip

mainnetIntegrationIt(
  'returns reference-script bytes and an empty result for a missing ref',
  async () => {
    const api = cardanoWalletBackendV1Maker({
      config: {
        baseUrl: process.env.CWB_MAINNET_INTEGRATION_URL!,
        submitExpectedNetwork: 'mainnet',
      },
    })

    const [referenceOutput] = await api.getUtxosByRef([
      '80a146507156745632e5e4b7ae72944fd67a9cc57cb850e826c30151e825be56#0',
    ])
    if (!referenceOutput)
      throw new Error('Known reference-script UTxO was not found')
    const referenceScriptBytes = referenceOutput.referenceScript?.bytes
    if (referenceScriptBytes == null) {
      throw new Error(
        'Known reference-script UTxO did not include script bytes',
      )
    }
    expect(referenceOutput.referenceScript).toMatchObject({
      hash: '5986bfcc0cbfc60dec8df87715cc95d03817aac386b0e9d33da03b39',
      type: 'plutusV3',
      size: 4024,
    })
    expect(referenceScriptBytes).toMatch(/^[0-9a-f]+$/)
    expect(referenceScriptBytes.length).toBe(
      (referenceOutput.referenceScript?.size ?? 0) * 2,
    )

    await expect(api.getUtxosByRef([`${'f'.repeat(64)}#0`])).resolves.toEqual(
      [],
    )
  },
)
