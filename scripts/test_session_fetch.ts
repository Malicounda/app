import fetch from 'node-fetch';

const BASE_URL = 'https://malicounda-api.onrender.com';

async function main() {
  console.log('Logging in to production...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'reforest_admin', password: 'rpassword22' })
  });

  console.log('Login status:', loginRes.status);
  console.log('Login headers:', [...loginRes.headers.entries()]);
  const cookie = loginRes.headers.get('set-cookie');
  console.log('Cookie received:', cookie);

  if (!cookie) {
    console.error('No cookie received from login!');
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cookie': cookie
  };

  console.log('\nFetching /api/infractions/saisie-items using Cookie ONLY (no Bearer token)...');
  const res1 = await fetch(`${BASE_URL}/api/infractions/saisie-items`, { headers });
  console.log('Status items:', res1.status);
  const text1 = await res1.text();
  console.log('Body items:', text1);
}

main().catch(console.error);
