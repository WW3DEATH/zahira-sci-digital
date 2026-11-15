/**
 * Resolves backend API URLs cleanly across both full-stack Node hosting (same-origin `/api/...`)
 * and split static-frontend + Cloud Run backend deployments via `VITE_API_BASE_URL`.
 */
export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const envBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (envBase) {
    return `${envBase}${normalizedPath}`;
  }
  return normalizedPath;
}
