const reactNativePreset = require('react-native/jest-preset')

module.exports = {
  ...reactNativePreset,
  rootDir: '../../..',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  roots: ['<rootDir>/mobile/packages/common'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-native-async-storage/async-storage|@testing-library/react-native|@tanstack/react-query|react-error-boundary)/)',
  ],
  setupFiles: [
    ...reactNativePreset.setupFiles,
    '<rootDir>/scripts/packages/common/jest.setup.js',
  ],
  moduleDirectories: [
    'node_modules',
    '<rootDir>/scripts/packages/common/node_modules',
  ],
  moduleNameMapper: {
    '^@yoroi/logger$': '<rootDir>/scripts/packages/logger/src',
    '^@yoroi/types$': '<rootDir>/scripts/packages/types/src',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$',
  collectCoverage: true,
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/scripts/packages/common/coverage',
  collectCoverageFrom: [
    'mobile/packages/common/**/*.{js,jsx,ts,tsx}',
    '!mobile/packages/common/**/*.d.ts',
    '!mobile/packages/common/fixtures/**',
  ],
  coverageReporters: ['text-summary', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 98,
      lines: 93,
      statements: 93,
    },
  },
  modulePathIgnorePatterns: [
    '<rootDir>/scripts/packages/common/example/node_modules',
    '<rootDir>/scripts/packages/common/lib/',
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      require.resolve('babel-jest'),
      {configFile: require.resolve('./babel.config.js')},
    ],
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$':
      reactNativePreset.transform[
        '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$'
      ],
  },
  testEnvironment: require.resolve('jest-environment-jsdom'),
}
