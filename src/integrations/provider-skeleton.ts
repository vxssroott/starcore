// src/integrations/provider-skeleton.ts

import { IntegrationRequest, IntegrationResponse } from './types';

export interface Provider {
  handle: (req: IntegrationRequest) => Promise<IntegrationResponse>;
  health?: () => Promise<boolean>;
}

export function createSkeletonProvider(name: string): Provider {
  return {
    async handle(req: IntegrationRequest) {
      // placeholder behaviour — real providers should implement
      return { requestId: req.id, status: 'pending' };
    },
    async health() {
      return true;
    },
  };
}
