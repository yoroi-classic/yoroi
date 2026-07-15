module.exports = {
  rootDir: '../../..',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  roots: ['<rootDir>/scripts/packages/types'],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$',
  collectCoverage: true,
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/scripts/packages/types/coverage',
  collectCoverageFrom: ['mobile/packages/types/branded/validation.ts'],
  coverageReporters: ['text-summary', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 86,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  moduleDirectories: [
    'node_modules',
    '<rootDir>/scripts/packages/types/node_modules',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/scripts/packages/types/example/node_modules',
    '<rootDir>/scripts/packages/types/lib/',
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      require.resolve('babel-jest'),
      {presets: ['@react-native/babel-preset']},
    ],
  },
  testEnvironment: 'node',
}
