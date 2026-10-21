import {mountAsyncStorage} from '@yoroi/common'
import {Chain} from '@yoroi/types'

import {GovernanceApi, governanceApiMaker} from './api'
import {GovernanceAction, governanceManagerMaker} from './manager'

const apiMock: GovernanceApi = {
  getDRepById: () =>
    Promise.resolve({
      tag: 'right',
      value: {
        status: 200,
        data: {
          txId: 'tx',
          epoch: 123,
        },
      },
    } as const),
  getStakingKeyState: () =>
    Promise.resolve({
      tag: 'right',
      value: {
        status: 200,
        data: {
          drepDelegation: {tx: 'tx', slot: 123, epoch: 123, drep: 'abstain'},
        },
      },
    } as const),
}

describe('createGovernanceManager', () => {
  const network = Chain.Network.Mainnet
  const options = {
    walletId: 'walletId',
    network,
    storage: mountAsyncStorage({path: 'wallet/'}),
    api: governanceApiMaker({network}),
  } as const

  afterEach(async () => {
    await options.storage.clear()
  })

  it('should return a manager', () => {
    expect(governanceManagerMaker(options)).toBeDefined()
  })

  describe('validateDRepID', () => {
    const governanceManager = governanceManagerMaker(options)

    it('should throw an error for a wrongly formatted DRep id', async () => {
      const invalidId =
        '0123456789012345678901234567890123456789012345678901234X'
      const errorMessage =
        'Invalid DRep ID. Must have a valid key or script bech32 format'

      await expect(() =>
        governanceManager.validateDRepID(invalidId),
      ).rejects.toThrow(errorMessage)
    })

    it('should not accept key hash as DRep ID', async () => {
      const errorMessage =
        'Invalid DRep ID. Must have a valid key or script bech32 format'
      const keyHash = 'db1bc3c3f99ce68977ceaf27ab4dd917123ef9e73f85c304236eab23'

      await expect(() =>
        governanceManager.validateDRepID(keyHash),
      ).rejects.toThrow(errorMessage)
    })

    it('should throw an error when a DRep id that is not registered', async () => {
      const invalidId =
        'drep1qpf36gkmgjtdsljz48q6624hxsmmd7uaytqekgxnzhq22vfv3c2'
      const errorMessage = 'DRep ID not registered'

      await expect(() =>
        governanceManager.validateDRepID(invalidId),
      ).rejects.toThrow(errorMessage)
    })

    it('should not throw an error for a DRep id that is registered', async () => {
      const id = 'drep1qpf36gkmgjtdsljz48q6624hxsmmd7uaytqekgxnzhq22vfv3c2'

      const manager = governanceManagerMaker({
        ...options,
        api: apiMock,
      })

      await manager.validateDRepID(id)
    })

    it('should accept bech32 address as DRep ID: key hash', async () => {
      const bech32Address =
        'drep1r73ah4wa3zqhw2fpnzyyj2lnya5zwjftkakgfk094y3mkerc53c'
      const manager = governanceManagerMaker({
        ...options,
        api: apiMock,
      })

      await manager.validateDRepID(bech32Address)
    })

    it('should accept bech32 address as DRep ID: script hash', async () => {
      const bech32Address =
        'drep_script18cgl8kdnjculhww4n3h0a3ahc85ahjcsg53u0f93jnz9c0339av'
      const manager = governanceManagerMaker({
        ...options,
        api: apiMock,
      })

      await manager.validateDRepID(bech32Address)
    })

    it('should not accept wrong bech32 address as DRep ID: script hash', async () => {
      const invalidbech32Address =
        'drep_script1r73ah4wa3zqhw2fpnzyyj2lnya5zwjftkakgfk094y3mkerc53c'

      const errorMessage =
        'Invalid DRep ID. Must have a valid key or script bech32 format'

      await expect(() =>
        governanceManager.validateDRepID(invalidbech32Address),
      ).rejects.toThrow(errorMessage)
    })
    it('should not accept wrong bech32 address as DRep ID: key hash', async () => {
      const invalidbech32Address =
        'drep1r73ah4wa3zqhw2fpnzyyj2lnya5zwjftkakgfk094y3mkerc53cs'

      const errorMessage =
        'Invalid DRep ID. Must have a valid key or script bech32 format'

      await expect(() =>
        governanceManager.validateDRepID(invalidbech32Address),
      ).rejects.toThrow(errorMessage)
    })
  })

  describe('createDelegationCertificate', () => {
    it('should create delegation certificate', async () => {
      const stakingKey = stakeKey(
        'c3892366f174a76af9252f78368f5747d3055ab3568ea3b6bf40b01e',
      )

      const drepId = 'c1ba49d52822bc4ef30cbf77060251668f1a6ef15ca46d18f76cc758'
      const manager = governanceManagerMaker(options)
      const certificate = await manager.createDelegationCertificate(
        drepId,
        'key',
        stakingKey,
      )
      expect(certificate).toEqual({
        kind: 'VoteDelegation',
        stakeCredentialKeyHashHex:
          'c3892366f174a76af9252f78368f5747d3055ab3568ea3b6bf40b01e',
        drep: {
          KeyHash: 'c1ba49d52822bc4ef30cbf77060251668f1a6ef15ca46d18f76cc758',
        },
      })
    })

    it('returns plain abstain and registration certificate data', () => {
      const stakingKey = stakeKey(
        'c3892366f174a76af9252f78368f5747d3055ab3568ea3b6bf40b01e',
      )
      const manager = governanceManagerMaker(options)

      expect(manager.createVotingCertificate('abstain', stakingKey)).toEqual({
        kind: 'VoteDelegation',
        stakeCredentialKeyHashHex:
          'c3892366f174a76af9252f78368f5747d3055ab3568ea3b6bf40b01e',
        drep: 'AlwaysAbstain',
      })
      expect(
        manager.createVotingCertificate('no-confidence', stakingKey),
      ).toEqual({
        kind: 'VoteDelegation',
        stakeCredentialKeyHashHex:
          'c3892366f174a76af9252f78368f5747d3055ab3568ea3b6bf40b01e',
        drep: 'AlwaysNoConfidence',
      })
      expect(manager.createStakeRegistrationCertificate(stakingKey)).toEqual({
        kind: 'StakeRegistration',
        stakeCredentialKeyHashHex:
          'c3892366f174a76af9252f78368f5747d3055ab3568ea3b6bf40b01e',
      })
    })
  })

  describe('latestGovernanceAction', () => {
    it('should return null if there is no action', async () => {
      const manager = governanceManagerMaker(options)
      const latestGovernanceAction = await manager.getLatestGovernanceAction()
      expect(latestGovernanceAction).toBeNull()
    })

    it('should return the latest vote action that was set', async () => {
      const manager = governanceManagerMaker(options)
      const action: GovernanceAction = {
        kind: 'vote',
        txID: 'txID',
        vote: 'no-confidence',
      }
      await manager.setLatestGovernanceAction(action)
      const latestGovernanceAction = await manager.getLatestGovernanceAction()
      expect(latestGovernanceAction).toEqual(action)
    })

    it('should return the latest delegation action that was set', async () => {
      const manager = governanceManagerMaker(options)
      const action: GovernanceAction = {
        kind: 'delegate-to-drep',
        txID: 'txID',
        hash: 'drepID',
        type: 'key',
      }
      await manager.setLatestGovernanceAction(action)
      const latestGovernanceAction = await manager.getLatestGovernanceAction()
      expect(latestGovernanceAction).toEqual(action)
    })
  })
})

const stakeKey = (hash: string) => ({hash: () => ({toHex: () => hash})})
