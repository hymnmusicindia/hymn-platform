import path from "node:path";

export const CANONICAL_HOSTINGER_STORAGE_ROOT = "/home/u390865851/private-storage";
export const CANONICAL_HOSTINGER_PUBLIC_STORAGE_ROOT = `${CANONICAL_HOSTINGER_STORAGE_ROOT}/Public`;

export function managedStorageRoot(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "production") return CANONICAL_HOSTINGER_STORAGE_ROOT;
  const configured = env.HYMN_STORAGE_ROOT?.trim() || env.PRIVATE_STORAGE_ROOT?.trim();
  return configured ? path.resolve(configured) : path.resolve(".hymn-storage");
}

export function publicMediaStorageRoot(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  if (env.NODE_ENV === "production") return CANONICAL_HOSTINGER_PUBLIC_STORAGE_ROOT;
  const configured = env.STORAGE_ROOT?.trim();
  if (configured) return path.resolve(cwd, configured);
  const managed = env.HYMN_STORAGE_ROOT?.trim() || env.PRIVATE_STORAGE_ROOT?.trim();
  return managed ? path.join(path.resolve(cwd, managed), "Public") : path.resolve(cwd, "public/uploads");
}
