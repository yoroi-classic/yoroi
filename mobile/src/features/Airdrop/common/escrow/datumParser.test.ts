import {
  escrowDatumInfoJson,
  updatedEscrowDatumCborHex,
} from '@yoroi-classic/cml-mobile-bridge'

import {buildUpdatedDatumHex, parseEscrowDatum} from './datumParser'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  escrowDatumInfoJson: jest.fn(),
  updatedEscrowDatumCborHex: jest.fn(),
}))

const datumInfo = {
  paymentCredHash: 'ab'.repeat(28),
  stakingCredHash: null,
  nightPerThaw: '900719925474099312345',
  nextThawTime: '900719925474099312346',
  thawsRemaining: '2',
  interval: '86400000',
}

describe('escrow datum CML boundary', () => {
  beforeEach(() => jest.clearAllMocks())

  it('converts bridge decimal strings to exact bigint fields', () => {
    jest.mocked(escrowDatumInfoJson).mockReturnValue(JSON.stringify(datumInfo))

    expect(parseEscrowDatum('fixture-cbor')).toEqual({
      paymentCredHash: datumInfo.paymentCredHash,
      stakingCredHash: null,
      nightPerThaw: 900719925474099312345n,
      nextThawTime: 900719925474099312346n,
      thawsRemaining: 2n,
      interval: 86400000n,
    })
    expect(escrowDatumInfoJson).toHaveBeenCalledWith('fixture-cbor')
  })

  it('updates the original datum CBOR through the CML bridge', () => {
    jest.mocked(updatedEscrowDatumCborHex).mockReturnValue('updated-cbor')

    expect(buildUpdatedDatumHex('original-cbor')).toBe('updated-cbor')
    expect(updatedEscrowDatumCborHex).toHaveBeenCalledWith('original-cbor')
  })
})
