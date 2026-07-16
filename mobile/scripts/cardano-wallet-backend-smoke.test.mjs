import assert from 'node:assert/strict'
import test from 'node:test'

import {parseBackendUrl, smokeBackend} from './cardano-wallet-backend-smoke.mjs'

const validTip = {
  block: 3_500_000,
  slot: 86_400_123,
  epoch: 199,
  hash: 'aa11bb22',
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
