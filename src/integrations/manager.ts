// src/integrations/manager.ts

import { getProviderFactory } from './registry';
import { IntegrationRequest, IntegrationResponse } from './types';

export class ProviderManager {
  private instances = new Map<string, any>();

  getProvider(key: string) {
    if (this.instances.has(key)) return this.instances.get(key);
    const factory = getProviderFactory(key);
    if (!factory) throw new Error(`Provider not registered: ${key}`);
    const inst = factory.create();
    this.instances.set(key, inst);
    return inst;
  }

  async handle<T = any>(req: IntegrationRequest<T>) {
    const provider = this.getProvider(req.provider);
    if (!provider || typeof provider.handle !== 'function') {
      throw new Error('Invalid provider implementation');
    }
    return provider.handle(req);
  }
}

export const providerManager = new ProviderManager();
