# @yoroi/types

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

The Types package of Yoroi SDK - A collection of TypeScript type definitions and interfaces used across the Yoroi ecosystem.

## Installation

This package is maintained in the Yoroi Classic repository at
`scripts/packages/types`. To consume an owned GitHub ref, pin a branch, tag, or
commit of `yoroi-classic/yoroi` and use this package directory as the package
root in your dependency update process.

Build and pack from the package directory before publishing the tarball or
copying it into a downstream dependency cache:

```bash
cd scripts/packages/types
npm ci --legacy-peer-deps
npm run build
npm pack --dry-run
```

## Requirements

- Node.js >= 22.12.0
- npm >= 10.9.0
- TypeScript >= 5.8.3

## Usage

```typescript
import { /* your imports */ } from '@yoroi/types';
```

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Build for development
npm run build:dev

# Build for release
npm run build:release
```

## Dependency Graph

Below is a visualization of the package's internal dependencies:

![Dependency Graph](./dependency-graph.svg)

## Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/yoroi-classic/yoroi/blob/develop/CONTRIBUTING.md) for more details.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](https://github.com/yoroi-classic/yoroi/blob/develop/LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/yoroi-classic/yoroi/tree/develop/scripts/packages/types)
- [Issue Tracker](https://github.com/yoroi-classic/yoroi/issues)
