import fetch from 'node-fetch';

const BASE_URL = 'https://malicounda-api.onrender.com';

async function main() {
  console.log('Attempting to log in to production...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      identifier: 'reforest_admin',
      password: 'rpassword22'
    })
  });

  console.log(`Login status: ${loginRes.status}`);
  const loginData = await loginRes.json();
  console.log('Login response:', JSON.stringify(loginData, null, 2));

  if (!loginRes.ok) {
    console.error('Failed to log in. Trying another user...');
    return;
  }

  // Get session cookie
  const cookie = loginRes.headers.get('set-cookie');
  console.log('Cookie received:', cookie);

  const token = loginData.token; // If JWT is returned

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Fetch saisie-items
  console.log('\nFetching /api/infractions/saisie-items...');
  const res1 = await fetch(`${BASE_URL}/api/infractions/saisie-items`, { headers });
  console.log(`Status: ${res1.status}`);
  try {
    const text1 = await res1.text();
    console.log('Response body:', text1);
  } catch (e: any) {
    console.error('Error reading response body:', e.message);
  }

  // Fetch unread-count
  console.log('\nFetching /api/alerts/unread-count...');
  const res2 = await fetch(`${BASE_URL}/api/alerts/unread-count`, { headers });
  console.log(`Status: ${res2.status}`);
  try {
    const text2 = await res2.text();
    console.log('Response body:', text2);
  } catch (e: any) {
    console.error('Error reading response body:', e.message);
  }
}

main().catch(console.error);
