import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

async function main() {
  console.log('Logging in to local server...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'reforest_admin', password: 'rpassword22' })
  });

  const loginData: any = await loginRes.json();
  const token = loginData.token;
  console.log('Login status:', loginRes.status, 'Has token:', !!token);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  console.log('\nFetching local /api/infractions/saisie-items...');
  const res1 = await fetch(`${BASE_URL}/api/infractions/saisie-items`, { headers });
  console.log('Status items:', res1.status);
  const text1 = await res1.text();
  console.log('Body items (first 200 chars):', text1.substring(0, 200));

  console.log('\nFetching local /api/alerts/unread-count...');
  const res2 = await fetch(`${BASE_URL}/api/alerts/unread-count`, { headers });
  console.log('Status unread:', res2.status);
  const text2 = await res2.text();
  console.log('Body unread:', text2);
}

main().catch(console.error);
