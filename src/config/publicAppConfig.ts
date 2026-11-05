import {
  PLACEHOLDER_EAS_PROJECT_ID as placeholderProjectId,
  PLACEHOLDER_EXPO_OWNER as placeholderOwner,
  resolveExpoIdentity as resolve,
} from './publicAppConfig.js';

export type ExpoIdentitySource = {
  projectId?: string;
  updatesUrl?: string;
  owner?: string;
};

export type ExpoIdentity = {
  projectId: string;
  updatesUrl: string;
  owner: string;
};

export const PLACEHOLDER_EAS_PROJECT_ID: string = placeholderProjectId;
export const PLACEHOLDER_EXPO_OWNER: string = placeholderOwner;

export function resolveExpoIdentity(source: ExpoIdentitySource = {}): ExpoIdentity {
  return resolve(source);
}
