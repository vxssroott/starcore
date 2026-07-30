// src/integrations/index.ts

// Import adapters so they auto-register
import './adapters/bankProvider';
import './adapters/virtualAccountProvider';

export * from './types';
export * from './registry';
export * from './manager';
