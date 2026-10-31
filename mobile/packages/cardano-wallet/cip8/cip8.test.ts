import {Buffer} from 'buffer'

import {makeCip8DataToSign} from './cip8'

describe('makeCip8DataToSign', () => {
  it('builds the CIP-8 Sign1 structure for the known Yoroi address vector', () => {
    const address = Buffer.from(
      '01260c2a2b09aad0061a320042c15f8985449b9e8d5ced8a45e35b37dd42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
      'hex',
    )
    const payload = Buffer.from('48656C6C6F', 'hex')
    const publicKey = Buffer.from(
      'be6a4d7e9789dd7458049c971ad783107e7f041c6f1f542b4530d63d5fe5afb1',
      'hex',
    )

    expect(
      makeCip8DataToSign(address, payload, publicKey).toString('hex'),
    ).toBe(
      '846a5369676e6174757265315869a30127045820be6a4d7e9789dd7458049c971ad783107e7f041c6f1f542b4530d63d5fe5afb16761646472657373583901260c2a2b09aad0061a320042c15f8985449b9e8d5ced8a45e35b37dd42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40404548656c6c6f',
    )
  })
})
