import {isMidnightAirdropAvailable} from './feature-state'

describe('isMidnightAirdropAvailable', () => {
  it('requires both remote enablement and a configured CWB endpoint', () => {
    expect(
      isMidnightAirdropAvailable(true, 'https://wallet-backend.example'),
    ).toBe(true)
    expect(isMidnightAirdropAvailable(true, undefined)).toBe(false)
    expect(isMidnightAirdropAvailable(true, '  ')).toBe(false)
    expect(
      isMidnightAirdropAvailable(false, 'https://wallet-backend.example'),
    ).toBe(false)
    expect(
      isMidnightAirdropAvailable(undefined, 'https://wallet-backend.example'),
    ).toBe(false)
  })
})
