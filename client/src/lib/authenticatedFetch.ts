import { getApiBaseUrl } from "@/utils/environment";

export const authenticatedFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  const apiBaseUrl = getApiBaseUrl();
  let path = url || '';
  if (path.startsWith('/api/')) path = path.slice(4);
  else if (path === '/api') path = '/';
  if (!path.startsWith('/')) path = `/${path}`;
  const fullUrl = `${apiBaseUrl}${path}`;

  const headers = new Headers(init?.headers || {});
  const token = localStorage.getItem('token');
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const domain = localStorage.getItem('domain');
  if (domain && !headers.has('X-Domain')) {
    headers.set('X-Domain', domain);
  }
  
  return fetch(fullUrl, {
    credentials: 'include',
    ...init,
    headers,
  });
};
