import fetch from 'node-fetch';

const BASE_URL = 'https://malicounda-api.onrender.com';

async function main() {
  console.log('Logging in...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '666376/D', password: 'rpassword22' })
  });

  const loginData: any = await loginRes.json();
  const token = loginData.token;
  console.log('Login status:', loginRes.status, 'Has token:', !!token, 'Login Body:', JSON.stringify(loginData, null, 2));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  console.log('\nFetching /api/infractions/saisie-items...');
  const res1 = await fetch(`${BASE_URL}/api/infractions/saisie-items`, { headers });
  console.log('Status items:', res1.status);
  const text1 = await res1.text();
  console.log('Body items (first 200 chars):', text1.substring(0, 200));

  console.log('\nFetching /api/alerts/unread-count...');
  const res2 = await fetch(`${BASE_URL}/api/alerts/unread-count`, { headers });
  console.log('Status unread:', res2.status);
  const text2 = await res2.text();
  console.log('Body unread:', text2);

  console.log('\nFetching /api/infractions/agents...');
  const res3 = await fetch(`${BASE_URL}/api/infractions/agents`, { headers });
  console.log('Status agents:', res3.status);
  const text3 = await res3.text();
  console.log('Body agents (first 200 chars):', text3.substring(0, 200));

  console.log('\nFetching /api/infractions/infractions...');
  const res4 = await fetch(`${BASE_URL}/api/infractions/infractions`, { headers });
  console.log('Status infractions:', res4.status);
  const text4 = await res4.text();
  console.log('Body infractions (first 200 chars):', text4.substring(0, 200));
}

main().catch(console.error);
