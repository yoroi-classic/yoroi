import {Buffer} from 'buffer'

import * as cip8 from './cip8'

describe('CIP8', () => {
  it('builds a COSE_Sign1 byte-for-byte from the signature and headers', async () => {
    const address = Buffer.from(
      '01260c2a2b09aad0061a320042c15f8985449b9e8d5ced8a45e35b37dd42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
      'hex',
    )
    const signature = Buffer.from(
      '0b6a6aac7a95656ab241bf4dedec8b5ca0d4893747093f3382223b1d2e869de1b6b9809f0b974536b1191b6e193cf4ec5dc506b21b52e6bc5d352f04c60bf30d',
      'hex',
    )
    const coseSign1 = await cip8.buildCoseSign1FromSignature(
      address,
      signature,
      Buffer.from('48656C6C6F', 'hex'),
    )

    expect(Buffer.from(coseSign1.toBytes()).toString('hex')).toEqual(
      '845846a201276761646472657373583901260c2a2b09aad0061a320042c15f8985449b9e8d5ced8a45e35b37dd42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40a166686173686564f44548656c6c6f58400b6a6aac7a95656ab241bf4dedec8b5ca0d4893747093f3382223b1d2e869de1b6b9809f0b974536b1191b6e193cf4ec5dc506b21b52e6bc5d352f04c60bf30d',
    )
  })
})
