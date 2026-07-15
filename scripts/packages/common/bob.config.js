module.exports = {
  source: 'src',
  output: 'lib',
  exclude: '**/{__tests__,__fixtures__,__mocks__,*.test.*,*.spec.*}{,/**}',
  targets: [
    'commonjs',
    'module',
    [
      'typescript',
      {
        project: 'tsconfig.build.json',
        tsc: './node_modules/.bin/tsc',
      },
    ],
  ],
}
