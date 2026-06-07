import fetch from 'node-fetch';

const URL = 'https://malicounda-api.onrender.com/api/auth/login';

async function main() {
  console.log('Sending login request to live Render server...');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Domain': 'ALERTE'
      },
      body: JSON.stringify({
        identifier: '666376/D',
        password: 'rpassword22'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log('Response Status:', res.status, res.statusText);
    const text = await res.text();
    console.log('Response Body:', text);
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error('Error sending request:', err.name === 'AbortError' ? 'Timeout (10s)' : err.message);
  }
}

main().catch(console.error);
