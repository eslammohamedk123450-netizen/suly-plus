export function createProductSlug(name: string, fallback: string): string {
  const normalized = name
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}
