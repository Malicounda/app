import axios from 'axios';

async function main() {
  try {
    const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
      identifier: 'thy@gmail.com',
      password: 'rpassword22',
      domain: 'CHASSE'
    });
    
    console.log('Login success! Full response:', JSON.stringify(loginRes.data, null, 2));
  } catch (err: any) {
    console.log('ERROR:', err.response?.data);
  }
}

main();
