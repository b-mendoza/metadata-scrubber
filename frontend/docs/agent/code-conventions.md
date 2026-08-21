# TypeScript design conventions

This file contains long-lived guidance for TypeScript design in the frontend. The short-lived [conventions reference](../conventions.md) records the current file names and structure.

## Validation libraries

Effect has a large runtime. Client code that uses Effect adds that runtime to the client bundle. Keep Effect out of the client bundle.
