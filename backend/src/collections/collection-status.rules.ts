import { CollectionStatus } from './collection-status.enum';

export const COLLECTION_STATUS_TRANSITIONS: Record<CollectionStatus, CollectionStatus[]> = {
  [CollectionStatus.PENDING]: [CollectionStatus.IN_PROGRESS],
  [CollectionStatus.IN_PROGRESS]: [CollectionStatus.COMPLETED],
  [CollectionStatus.COMPLETED]: [],
  [CollectionStatus.CANCELLED]: [],
};

export const canTransition = (from: CollectionStatus, to: CollectionStatus): boolean => {
  return COLLECTION_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
};