/* global structuredClone */
import assert from 'node:assert/strict'
import test from 'node:test'

import {parseBackendUrl, smokeBackend} from './cardano-wallet-backend-smoke.mjs'

const validTip = {
  block: 3_500_000,
  slot: 86_400_123,
  epoch: 199,
  hash: 'a'.repeat(64),
  blockTime: 1_700_000_000,
}

const validProtocolParams = {
  epoch: 199,
  minFeeA: 44,
  minFeeB: 155_381,
  maxTxSize: 16_384,
  maxBlockBodySize: 90_112,
  keyDeposit: '2000000',
  poolDeposit: '500000000',
  minPoolCost: '170000000',
  coinsPerUtxoByte: '4310',
  maxTxExMem: '14000000',
  maxTxExSteps: '10000000000',
}

function response(body, {ok = true, status = 200} = {}) {
  return {
    ok,
    status,
    async json() {
      return structuredClone(body)
    },
  }
}

test('rejects an Android loopback URL with routing guidance', () => {
  assert.throws(
    () => parseBackendUrl('http://127.0.0.1:3010'),
    /10\.0\.2\.2.*LAN\/ingress/,
  )
  assert.throws(
    () => parseBackendUrl('http://[::1]:3010'),
    /10\.0\.2\.2.*LAN\/ingress/,
  )
})

test('rejects a malformed chain tip hash', async () => {
  await assert.rejects(
    smokeBackend({
      deviceUrl: 'http://192.168.4.211:3010',
      async request(url) {
        if (url.endsWith('/health')) return response({status: 'ok'})
        if (url.endsWith('/v1/chain/tip')) {
          return response({...validTip, hash: 'not-a-hash'})
        }
        return response(validProtocolParams)
      },
    }),
    /64-character hexadecimal string/,
  )
})

test('allows a separate host-loopback smoke URL', async () => {
  const requests = []
  const result = await smokeBackend({
    deviceUrl: 'http://192.168.4.211:3010',
    smokeUrl: 'http://127.0.0.1:3010',
    async request(url) {
      requests.push(url)
      if (url.endsWith('/health')) return response({status: 'ok'})
      if (url.endsWith('/v1/chain/tip')) return response(validTip)
      return response(validProtocolParams)
    },
  })

  assert.equal(result.deviceUrl, 'http://192.168.4.211:3010')
  assert.equal(result.smokeUrl, 'http://127.0.0.1:3010')
  assert.deepEqual(requests, [
    'http://127.0.0.1:3010/health',
    'http://127.0.0.1:3010/v1/chain/tip',
    'http://127.0.0.1:3010/v1/chain/protocol-params',
  ])
})

test('checks the complete account UTxO contract when a stake address is supplied', async () => {
  const requests = []
  const result = await smokeBackend({
    deviceUrl: 'http://192.168.4.211:3010',
    smokeUrl: 'http://127.0.0.1:3010',
    stakeAddress: 'stake_test1fixture',
    async request(url) {
      requests.push(url)
      if (url.endsWith('/health')) return response({status: 'ok'})
      if (url.endsWith('/v1/chain/tip')) return response(validTip)
      if (url.endsWith('/v1/chain/protocol-params')) {
        return response(validProtocolParams)
      }
      return response({
        complete: true,
        utxos: [
          {
            txHash: 'b'.repeat(64),
            outputIndex: 2,
            address: 'addr_test1fixture',
            value: '9007199254740993',
            assets: [
              {
                policyId: 'c'.repeat(56),
                assetName: '00ff',
                quantity: '1',
              },
            ],
          },
        ],
      })
    },
  })

  assert.equal(result.completeUtxoCount, 1)
  assert.equal(
    requests.at(-1),
    'http://127.0.0.1:3010/v1/account/stake_test1fixture/utxos/complete',
  )
})

test('rejects account UTxOs the wallet parser rejects', async () => {
  const validUtxo = {
    txHash: 'b'.repeat(64),
    outputIndex: 2,
    address: 'addr_test1fixture',
    value: '1',
    assets: [
      {
        policyId: 'c'.repeat(56),
        assetName: '00ff',
        quantity: '1',
      },
    ],
  }
  const invalidUtxos = [
    {...validUtxo, outputIndex: -1},
    {...validUtxo, value: '01'},
    {...validUtxo, address: ''},
    {
      ...validUtxo,
      assets: [{...validUtxo.assets[0], policyId: 'c'.repeat(55)}],
    },
    {...validUtxo, assets: [{...validUtxo.assets[0], assetName: '0'}]},
    {...validUtxo, assets: [{...validUtxo.assets[0], quantity: '01'}]},
  ]

  for (const utxo of invalidUtxos) {
    await assert.rejects(
      smokeBackend({
        deviceUrl: 'http://192.168.4.211:3010',
        stakeAddress: 'stake_test1fixture',
        async request(url) {
          if (url.endsWith('/health')) return response({status: 'ok'})
          if (url.endsWith('/v1/chain/tip')) return response(validTip)
          if (url.endsWith('/v1/chain/protocol-params')) {
            return response(validProtocolParams)
          }
          return response({complete: true, utxos: [utxo]})
        },
      }),
      /account UTxO does not match the mobile parser contract/,
    )
  }
})

test('rejects incomplete account UTxO responses', async () => {
  await assert.rejects(
    smokeBackend({
      deviceUrl: 'http://192.168.4.211:3010',
      stakeAddress: 'stake_test1fixture',
      async request(url) {
        if (url.endsWith('/health')) return response({status: 'ok'})
        if (url.endsWith('/v1/chain/tip')) return response(validTip)
        if (url.endsWith('/v1/chain/protocol-params')) {
          return response(validProtocolParams)
        }
        return response({utxos: []})
      },
    }),
    /complete=true and include an array/,
  )
})

test('rejects a malformed backend contract', async () => {
  await assert.rejects(
    smokeBackend({
      deviceUrl: 'http://192.168.4.211:3010',
      async request(url) {
        if (url.endsWith('/health')) return response({status: 'ok'})
        if (url.endsWith('/v1/chain/tip')) {
          return response({...validTip, slot: '86400123'})
        }
        return response(validProtocolParams)
      },
    }),
    /chain tip field slot must be an integer/,
  )
})
