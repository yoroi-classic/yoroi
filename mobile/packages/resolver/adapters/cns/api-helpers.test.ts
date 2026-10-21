import {Resolver} from '@yoroi/types'

import {cnsApiConfig} from './api'
import {
  resolveAddress,
  resolveDomain,
  resolveUserRecord,
  resolveVirtualSubdomain,
} from './api-helpers'
import {cnsCardanoApiMock} from './cardano-api-maker.mocks'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  resolveCnsAddressRecord: jest.fn(() => ({
    paymentCredentialKind: 'key',
    paymentCredentialHashHex:
      'a5644bcb8cd82b5e0478657e2c8feea865682a5b20db45d095807d84',
    stakingCredentialHashHex:
      'e40482bb4648fc54bffc06175c4a9e5f268b70da54bf6de4d6ad71df',
    addressBech32:
      'addr1qxjkgj7t3nvzkhsy0pjhuty0a65x26p2tvsdk3wsjkq8mp8yqjptk3jgl32tllqxzawy48jly69hpkj5hak7f44dw80sqfylvs',
  })),
}))

describe('resolveDomain', () => {
  it('resolves an address', async () => {
    const domain = 'fake.domain'

    expect(
      await resolveDomain(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.success,
      ),
    ).toBe(
      'addr1qxjkgj7t3nvzkhsyOpjhuty0a65x26p2tvsdk3wsjkq8mp8yqjptk3jg|32t|lqxzawy48jly69hpkj5hak7f44dw80sqfylvs',
    )
  })

  it('throws "not found" error: no metadata', async () => {
    const domain = 'fake.domain'

    try {
      await resolveDomain(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.noMetadata,
      )

      fail('it should crash before')
    } catch (e) {
      expect(e).toBeInstanceOf(Resolver.Errors.NotFound)
    }
  })

  it('throws "expired" error: expired domain', async () => {
    const domain = 'fake.domain'

    try {
      await resolveDomain(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.expiredDomain,
      )

      fail('it should crash before')
    } catch (e) {
      expect(e).toBeInstanceOf(Resolver.Errors.Expired)
    }
  })

  it('throws "not found" error: address doesnt exist', async () => {
    const domain = 'fake.domain'

    try {
      await resolveDomain(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.noAddress,
      )

      fail('it should crash before')
    } catch (e) {
      expect(e).toBeInstanceOf(Resolver.Errors.NotFound)
    }
  })
})

describe('resolveUserRecord', () => {
  it('resolves user record', async () => {
    const domain = 'fake.domain'

    const result = await resolveUserRecord(
      domain,
      cnsApiConfig.mainnet,
      cnsCardanoApiMock.success,
    )

    expect(result).toEqual(cnsCardanoApiMock.parsedInlineDatum)
  })

  it('resolves empty record', async () => {
    const domain = 'fake.domain'

    const result = await resolveUserRecord(
      domain,
      cnsApiConfig.mainnet,
      cnsCardanoApiMock.disabled,
    )

    expect(result).toEqual({virtualSubdomains: []})
  })

  it('throws "not found" error: no metadata', async () => {
    const domain = 'fake.domain'

    try {
      await resolveUserRecord(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.noMetadata,
      )

      fail('it should crash before')
    } catch (e) {
      expect(e).toBeInstanceOf(Resolver.Errors.NotFound)
    }
  })

  it('throws "expired" error: expired domain', async () => {
    const domain = 'fake.domain'

    try {
      await resolveUserRecord(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.expiredDomain,
      )

      fail('it should crash before')
    } catch (e) {
      expect(e).toBeInstanceOf(Resolver.Errors.Expired)
    }
  })

  it('throws "invalid domain" error: no inline datum', async () => {
    const domain = 'fake.domain'

    try {
      await resolveUserRecord(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.noInlineDatum,
      )

      fail('it should crash before')
    } catch (e) {
      expect(e).toBeInstanceOf(Resolver.Errors.InvalidDomain)
    }
  })

  it('throws "invalid domain" error: bad inline datum', async () => {
    const domain = 'fake.domain'

    try {
      await resolveUserRecord(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.badInlineDatum,
      )

      fail('it should crash before')
    } catch (e) {
      expect(e).toBeInstanceOf(Resolver.Errors.InvalidDomain)
    }
  })
})

describe('resolveVirtualSubdomain', () => {
  it('resolves virtual subdomain', async () => {
    const domain = 'aaa.fake.domain'

    const result = await resolveVirtualSubdomain(
      domain,
      cnsApiConfig.mainnet,
      cnsCardanoApiMock.success,
    )

    expect(result).toBe(
      'addr1qxjkgj7t3nvzkhsy0pjhuty0a65x26p2tvsdk3wsjkq8mp8yqjptk3jgl32tllqxzawy48jly69hpkj5hak7f44dw80sqfylvs',
    )
  })

  it('throws "not found" error: virtual subdomain does not exist', async () => {
    const domain = 'bbb.fake.domain'

    try {
      await resolveVirtualSubdomain(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.success,
      )

      fail('it should crash before')
    } catch (e) {
      expect(e).toBeInstanceOf(Resolver.Errors.NotFound)
    }
  })
})

describe('resolveAddress', () => {
  it('resolves domain', async () => {
    const domain = 'fake.domain'

    expect(
      await resolveAddress(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.success,
      ),
    ).toBe(
      'addr1qxjkgj7t3nvzkhsyOpjhuty0a65x26p2tvsdk3wsjkq8mp8yqjptk3jg|32t|lqxzawy48jly69hpkj5hak7f44dw80sqfylvs',
    )
  })

  it('resolves virtual domain', async () => {
    const domain = 'aaa.fake.domain'

    expect(
      await resolveAddress(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.success,
      ),
    ).toBe(
      'addr1qxjkgj7t3nvzkhsy0pjhuty0a65x26p2tvsdk3wsjkq8mp8yqjptk3jgl32tllqxzawy48jly69hpkj5hak7f44dw80sqfylvs',
    )
  })

  it('throws "invalid domain" error: not a domain', async () => {
    const domain = 'random'

    try {
      await resolveAddress(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.success,
      )

      fail('it should crash before')
    } catch (e) {
      expect(e).toBeInstanceOf(Resolver.Errors.InvalidDomain)
    }
  })

  it('throws "invalid domain" error: invalid subdomain', async () => {
    const domain = 'random'

    try {
      await resolveAddress(
        domain,
        cnsApiConfig.mainnet,
        cnsCardanoApiMock.success,
      )

      fail('it should crash before')
    } catch (e) {
      expect(e).toBeInstanceOf(Resolver.Errors.InvalidDomain)
    }
  })
})
