// A experiência tem rotas próprias e compartilha o domínio com o site institucional.
export const BASE_PATH = '/interativo';

export function appPath(pathname) {
  if (pathname === BASE_PATH || pathname === BASE_PATH + '/') return '/';
  if (!pathname.startsWith(BASE_PATH + '/')) return null;
  return pathname.slice(BASE_PATH.length).replace(/\/$/, '') || '/';
}

export function sitePath(path) {
  return BASE_PATH + (path === '/' ? '' : path);
}
