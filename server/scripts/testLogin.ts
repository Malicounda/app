import axios from 'axios';

async function main() {
  try {
    const res = await axios.post('http://localhost:3000/api/auth/login', {
      identifier: '618834/D',
      password: '',
      domain: 'ALERTE'
    });
    console.log('SUCCESS:', res.data);
  } catch (err: any) {
    console.log('STATUS:', err.response?.status);
    console.log('ERROR:', err.response?.data);
  }
}

main();
