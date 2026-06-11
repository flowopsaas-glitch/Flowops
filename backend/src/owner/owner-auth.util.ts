import * as fs from 'fs';
import * as path from 'path';

export type OwnerCredentialRecord = {
  id: string;
  email: string;
  password: string;
  name: string;
};

type OwnerStoreShape = {
  owner?: Partial<OwnerCredentialRecord> & Record<string, any>;
  email?: string;
  password?: string;
  name?: string;
  audit?: any[];
  [key: string]: any;
};

const DEFAULT_OWNER: OwnerCredentialRecord = {
  id: 'flowops-owner',
  email: 'flowopsaas@gmail.com',
  password: '2026FlowOps!',
  name: 'FlowOps Owner',
};

function normalizeEmail(value: any): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeText(value: any): string {
  return String(value ?? '').trim();
}

function getStorePath(): string {
  return path.resolve(process.cwd(), 'data', 'owner-superadmin-store.json');
}

function normalizeOwnerRecord(input: any): OwnerCredentialRecord {
  const candidate = input ?? {};

  return {
    id: normalizeText(candidate.id) || DEFAULT_OWNER.id,
    email: normalizeEmail(
      candidate.email ??
      candidate.username ??
      candidate.ownerEmail ??
      DEFAULT_OWNER.email,
    ),
    password: normalizeText(
      candidate.password ??
      candidate.pass ??
      candidate.ownerPassword ??
      candidate.passwordHash ??
      DEFAULT_OWNER.password,
    ),
    name: normalizeText(
      candidate.name ??
      candidate.fullName ??
      candidate.displayName ??
      DEFAULT_OWNER.name,
    ) || DEFAULT_OWNER.name,
  };
}

function normalizeStore(store: OwnerStoreShape | null | undefined) {
  const ownerFromNested = normalizeOwnerRecord(store?.owner ?? {});
  const ownerFromRoot = normalizeOwnerRecord(store ?? {});

  const merged: OwnerCredentialRecord = {
    id: ownerFromNested.id || ownerFromRoot.id || DEFAULT_OWNER.id,
    email: ownerFromNested.email || ownerFromRoot.email || DEFAULT_OWNER.email,
    password: ownerFromNested.password || ownerFromRoot.password || DEFAULT_OWNER.password,
    name: ownerFromNested.name || ownerFromRoot.name || DEFAULT_OWNER.name,
  };

  return {
    owner: merged,
    email: merged.email,
    password: merged.password,
    name: merged.name,
    audit: Array.isArray(store?.audit) ? store!.audit : [],
  };
}

export function ensureOwnerStore() {
  const storePath = getStorePath();

  if (!fs.existsSync(storePath)) {
    const fallback = normalizeStore({});
    fs.writeFileSync(storePath, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }

  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw) as OwnerStoreShape;
    const normalized = normalizeStore(parsed);
    fs.writeFileSync(storePath, JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
  } catch {
    const fallback = normalizeStore({});
    fs.writeFileSync(storePath, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

export function readOwnerStore() {
  return ensureOwnerStore();
}

export function getOwnerStore() {
  return ensureOwnerStore();
}

export function readOwnerSuperadminStore() {
  return ensureOwnerStore();
}

export function getOwnerSuperadminStore() {
  return ensureOwnerStore();
}

export function getOwnerCredentials(): OwnerCredentialRecord {
  const store = ensureOwnerStore();
  return normalizeOwnerRecord(store.owner);
}

export function readOwnerCredentials(): OwnerCredentialRecord {
  return getOwnerCredentials();
}

export function resolveOwnerCredentials(): OwnerCredentialRecord {
  return getOwnerCredentials();
}

export function loadOwnerCredentials(): OwnerCredentialRecord {
  return getOwnerCredentials();
}

export function readHiddenOwnerCredentials(): OwnerCredentialRecord {
  return getOwnerCredentials();
}

export function getHiddenOwnerCredentials(): OwnerCredentialRecord {
  return getOwnerCredentials();
}
