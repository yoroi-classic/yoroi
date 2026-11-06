const deviceUrlEnvironmentVariable = 'EXPO_PUBLIC_CARDANO_WALLET_BACKEND_URL'
const smokeUrlEnvironmentVariable = 'CARDANO_WALLET_BACKEND_SMOKE_URL'
const stakeAddressEnvironmentVariable =
  'CARDANO_WALLET_BACKEND_SMOKE_STAKE_ADDRESS'

const loopbackHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function parseBackendUrl(value, {allowLoopback = false} = {}) {
  if (!value) throw new Error('backend URL is required')

  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('backend URL must use http or https')
  }
  if (!allowLoopback && loopbackHostnames.has(url.hostname)) {
    throw new Error(
      'the Android backend URL cannot use loopback; use 10.0.2.2 for an emulator-to-host port-forward or a LAN/ingress address for a device',
    )
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url
}

function endpoint(baseUrl, path) {
  const url = new URL(baseUrl)
  url.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
  return url.toString()
}

async function readJson(response, name) {
  if (!response.ok) {
    throw new Error(`${name} failed with HTTP ${response.status}`)
  }
  return response.json()
}

function assertRecord(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} returned an invalid JSON object`)
  }
}

function isCanonicalQuantity(value) {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)
}

function isHex(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]*$/.test(value)
}

export async function smokeBackend({
  deviceUrl,
  smokeUrl = deviceUrl,
  stakeAddress = process.env[stakeAddressEnvironmentVariable],
  request = fetch,
}) {
  const parsedDeviceUrl = parseBackendUrl(deviceUrl)
  const parsedSmokeUrl = parseBackendUrl(smokeUrl, {allowLoopback: true})

  const health = await readJson(
    await request(endpoint(parsedSmokeUrl, '/health')),
    'health',
  )
  assertRecord(health, 'health')
  if (health.status !== 'ok') {
    throw new Error('health did not report status=ok')
  }

  const tip = await readJson(
    await request(endpoint(parsedSmokeUrl, '/v1/chain/tip')),
    'chain tip',
  )
  assertRecord(tip, 'chain tip')
  for (const field of ['block', 'slot', 'epoch', 'blockTime']) {
    if (!Number.isInteger(tip[field])) {
      throw new Error(`chain tip field ${field} must be an integer`)
    }
  }
  if (typeof tip.hash !== 'string' || !/^[0-9a-f]{64}$/i.test(tip.hash)) {
    throw new Error('chain tip hash must be a 64-character hexadecimal string')
  }

  const protocolParams = await readJson(
    await request(endpoint(parsedSmokeUrl, '/v1/chain/protocol-params')),
    'protocol parameters',
  )
  assertRecord(protocolParams, 'protocol parameters')
  for (const field of [
    'epoch',
    'minFeeA',
    'minFeeB',
    'maxTxSize',
    'maxBlockBodySize',
  ]) {
    if (!Number.isInteger(protocolParams[field])) {
      throw new Error(`protocol parameters field ${field} must be an integer`)
    }
  }
  for (const field of [
    'keyDeposit',
    'poolDeposit',
    'minPoolCost',
    'coinsPerUtxoByte',
    'maxTxExMem',
    'maxTxExSteps',
  ]) {
    if (
      typeof protocolParams[field] !== 'string' ||
      !/^\d+$/.test(protocolParams[field])
    ) {
      throw new Error(
        `protocol parameters field ${field} must be a decimal string`,
      )
    }
  }

  let completeUtxoCount
  if (stakeAddress) {
    const accountUtxos = await readJson(
      await request(
        endpoint(
          parsedSmokeUrl,
          `/v1/account/${encodeURIComponent(stakeAddress)}/utxos/complete`,
        ),
      ),
      'complete account UTxOs',
    )
    assertRecord(accountUtxos, 'complete account UTxOs')
    if (accountUtxos.complete !== true || !Array.isArray(accountUtxos.utxos)) {
      throw new Error(
        'complete account UTxOs must prove complete=true and include an array',
      )
    }
    for (const utxo of accountUtxos.utxos) {
      assertRecord(utxo, 'account UTxO')
      if (
        typeof utxo.txHash !== 'string' ||
        !/^[0-9a-f]{64}$/i.test(utxo.txHash) ||
        !Number.isInteger(utxo.outputIndex) ||
        utxo.outputIndex < 0 ||
        typeof utxo.address !== 'string' ||
        utxo.address.length === 0 ||
        !isCanonicalQuantity(utxo.value) ||
        !Array.isArray(utxo.assets) ||
        (utxo.datumHash !== undefined &&
          (typeof utxo.datumHash !== 'string' ||
            !/^[0-9a-f]{64}$/i.test(utxo.datumHash))) ||
        (utxo.inlineDatum !== undefined &&
          (!isHex(utxo.inlineDatum) || utxo.inlineDatum.length % 2 !== 0)) ||
        (utxo.referenceScriptHash !== undefined &&
          (typeof utxo.referenceScriptHash !== 'string' ||
            !/^[0-9a-f]{56}$/i.test(utxo.referenceScriptHash)))
      ) {
        throw new Error(
          'account UTxO does not match the mobile parser contract',
        )
      }
      for (const asset of utxo.assets) {
        assertRecord(asset, 'account UTxO asset')
        if (
          typeof asset.policyId !== 'string' ||
          !/^[0-9a-f]{56}$/i.test(asset.policyId) ||
          !isHex(asset.assetName) ||
          asset.assetName.length > 64 ||
          asset.assetName.length % 2 !== 0 ||
          !isCanonicalQuantity(asset.quantity)
        ) {
          throw new Error(
            'account UTxO does not match the mobile parser contract',
          )
        }
      }
    }
    completeUtxoCount = accountUtxos.utxos.length
  }

  const result = {
    deviceUrl: parsedDeviceUrl.toString().replace(/\/$/, ''),
    smokeUrl: parsedSmokeUrl.toString().replace(/\/$/, ''),
    tip: {
      block: tip.block,
      slot: tip.slot,
      epoch: tip.epoch,
      hash: tip.hash,
    },
    protocolParamsEpoch: protocolParams.epoch,
  }
  if (completeUtxoCount !== undefined) {
    result.completeUtxoCount = completeUtxoCount
  }
  return result
}

async function main() {
  const result = await smokeBackend({
    deviceUrl: process.env[deviceUrlEnvironmentVariable],
    smokeUrl:
      process.env[smokeUrlEnvironmentVariable] ??
      process.env[deviceUrlEnvironmentVariable],
  })

  console.log('cardano-wallet-backend mobile smoke passed')
  console.log(JSON.stringify(result, null, 2))
}

if (import.meta.filename === process.argv[1]) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'unknown backend smoke error',
    )
    process.exitCode = 1
  })
}
