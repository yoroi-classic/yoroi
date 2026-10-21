import {Branded, Chain} from '@yoroi/types'

import {GovernanceManager} from './manager'

const mockCertificate = {
  kind: 'VoteDelegation' as const,
  stakeCredentialKeyHashHex: Branded.asKeyHash('00'.repeat(28)),
  drep: 'AlwaysAbstain' as const,
}
const mockRegistrationCertificate = {
  kind: 'StakeRegistration' as const,
  stakeCredentialKeyHashHex: Branded.asKeyHash('00'.repeat(28)),
}

export const managerMock: GovernanceManager = {
  network: Chain.Network.Mainnet,
  convertHexKeyHashToBech32Format: () =>
    'drep1r73ah4wa3zqhw2fpnzyyj2lnya5zwjftkakgfk094y3mkerc53c',
  validateDRepID: () => Promise.reject(new Error('Mock not implemented')),
  getStakingKeyState: () =>
    Promise.resolve({
      drepDelegation: {
        action: 'no-confidence',
        tx: Branded.asTransactionHash('txId'),
        slot: Branded.asSlotNumber(1),
        epoch: Branded.asEpochNumber(1),
      },
    }),
  createDelegationCertificate: () => mockCertificate,
  createLedgerDelegationPayload: () =>
    Promise.reject(new Error('Mock not implemented')),
  createVotingCertificate: () => mockCertificate,
  createLedgerVotingPayload: () =>
    Promise.reject(new Error('Mock not implemented')),
  setLatestGovernanceAction: () =>
    Promise.reject(new Error('Mock not implemented')),
  getLatestGovernanceAction: () =>
    Promise.reject(new Error('Mock not implemented')),
  createStakeRegistrationCertificate: () => mockRegistrationCertificate,
}
