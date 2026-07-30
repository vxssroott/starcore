// src/integrations/registry.ts

import { ProviderType } from './types';

export interface ProviderFactory {
  key: string;
  create: () => any;
}

const registry = new Map<string, ProviderFactory & { types: ProviderType[] }>();

export function registerProvider(factory: ProviderFactory, types: ProviderType[]) {
  registry.set(factory.key, { ...factory, types });
}

export function getProviderFactory(key: string) {
  return registry.get(key) ?? null;
}

export function findProvidersForType(type: ProviderType) {
  const res: ProviderFactory[] = [];
  for (const [k, v] of registry.entries()) {
    if (v.types.includes(type)) res.push({ key: v.key, create: v.create });
  }
  return res;
}
