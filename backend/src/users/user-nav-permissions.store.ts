import * as fs from "fs";
import * as path from "path";

export type UserNavPermissions = Record<string, boolean>;

type StoreShape = Record<string, UserNavPermissions>;

const STORE_PATH = path.join(process.cwd(), "data", "tenant-user-nav-permissions.json");

function ensureStoreFile() {
  const dir = path.dirname(STORE_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({}, null, 2), "utf8");
  }
}

function readStore(): StoreShape {
  try {
    ensureStoreFile();
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed as StoreShape;
  } catch {
    return {};
  }
}

function writeStore(store: StoreShape) {
  ensureStoreFile();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function getUserNavPermissions(userId: number | string | null | undefined): UserNavPermissions | null {
  if (userId === null || userId === undefined) {
    return null;
  }

  const store = readStore();
  const key = String(userId).trim();

  if (!key) {
    return null;
  }

  return store[key] ?? null;
}

export function setUserNavPermissions(userId: number | string, permissions: unknown) {
  const key = String(userId).trim();

  if (!key) {
    return;
  }

  const next: UserNavPermissions = {};

  if (permissions && typeof permissions === "object") {
    for (const [k, v] of Object.entries(permissions as Record<string, unknown>)) {
      next[k] = v === true;
    }
  }

  const store = readStore();
  store[key] = next;
  writeStore(store);
}

export function applyUserNavPermissions<T extends Record<string, any>>(user: T | null | undefined): T | null {
  if (!user) {
    return null;
  }

  const saved = getUserNavPermissions(user.id);

  return {
    ...user,
    permissions: saved ?? null,
  };
}

export function applyUserNavPermissionsList<T extends Record<string, any>>(users: T[] | null | undefined): T[] {
  if (!Array.isArray(users)) {
    return [];
  }

  return users.map((item) => ({
    ...item,
    permissions: getUserNavPermissions(item.id) ?? null,
  }));
}
