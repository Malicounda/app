import http from 'http';

http.get('http://localhost:5000/api/permit-requests', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    if (res.statusCode !== 200) {
      console.log('Response:', data);
    } else {
      console.log('Response JSON:', JSON.parse(data));
    }
  });
}).on('error', (err) => {
  console.log('Error:', err.message);
});
