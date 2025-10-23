# Development Commands and Workflow

## Essential Development Commands

### Package Management

```bash
pnpm install                 # Install dependencies
pnpm clean:node_modules     # Clean node_modules
```

### Building

```bash
pnpm build                  # Production build
pnpm build:dev              # Development build with source maps
pnpm clean:dist             # Clean build output
```

### Running

```bash
pnpm start                  # Start production version
pnpm start:dev              # Start development version
pnpm start:dev:debug        # Start with debugging enabled
```

### Testing

```bash
pnpm build:dev              # Development build with source maps
pnpm test                   # Run all tests
pnpm test:debug             # Run tests with debugging
pnpm coverage               # Generate coverage report
pnpm coverage:html          # Generate HTML coverage report
```

### Code Quality

```bash
pnpm lint                   # Run linter
pnpm lint:fix               # Fix linting issues
pnpm format                 # Format code with Prettier and fix ESLint issues
```

### UI Development

```bash
cd ui/web
pnpm dev                    # Start web UI development server
pnpm build                  # Build web UI for production
```
