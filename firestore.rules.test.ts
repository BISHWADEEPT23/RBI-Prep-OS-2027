/**
 * Firestore Security Rules Test Suite (Dirty Dozen Adversarial Verification)
 * Verifies all 12 Dirty Dozen payloads defined in security_spec.md are rejected.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list';
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenCase[] = [
  { id: 1, name: 'Unauthenticated Write', collection: '/users/u1/topics/t1', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified Email Spoof', collection: '/users/u1', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 3, name: 'Cross-User Read (PII / Study Leak)', collection: '/users/u1/notes/n1', operation: 'get', expectedResult: 'PERMISSION_DENIED' },
  { id: 4, name: 'Identity Spoofing in Payload', collection: '/users/u1/topics/t1', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 5, name: 'Shadow / Ghost Field Injection on Create', collection: '/users/u1/topics/t1', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 6, name: 'Shadow / Ghost Field Injection on Update', collection: '/users/u1/topics/t1', operation: 'update', expectedResult: 'PERMISSION_DENIED' },
  { id: 7, name: 'Immutable Field Mutation', collection: '/users/u1/sessions/s1', operation: 'update', expectedResult: 'PERMISSION_DENIED' },
  { id: 8, name: 'Client Timestamp Forgery', collection: '/users/u1/tasks/tk1', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 9, name: 'Path ID Poisoning', collection: '/users/u1/topics/bad$id!@#', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 10, name: 'Value Poisoning / Oversized String', collection: '/users/u1/topics/t1', operation: 'update', expectedResult: 'PERMISSION_DENIED' },
  { id: 11, name: 'Orphan Subcollection Creation', collection: '/users/u1/topics/t1', operation: 'create', expectedResult: 'PERMISSION_DENIED' },
  { id: 12, name: 'Unauthorized List Scraping', collection: '/users/u1/notes', operation: 'list', expectedResult: 'PERMISSION_DENIED' },
];
