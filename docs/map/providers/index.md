# src/providers/index.ts - Provider Re-exports

**Role:** Barrel file for the providers subsystem.

## Re-exports

```typescript
export * from './types.js';
export * from './registry.js';
export * from './router.js';
export * from './ollama.js';
```

## Note

Most internal provider modules import direct dependencies instead of this barrel to keep dependency edges explicit.
