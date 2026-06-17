const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(() => {
  client.query(`SELECT id, username, matricule, role, "isSuperAdmin" FROM users WHERE username IN ('reforest_admin', 'chasse_admin')`).then(res => {
    console.log(res.rows);
    client.end();
  });
}).catch(console.error);
