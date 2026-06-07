const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

try {
  const configPath = path.join(__dirname, '..', 'server', 'db-config.json');
  console.log('Reading config from:', configPath);
  if (!fs.existsSync(configPath)) {
    console.error('Config file does not exist!');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('Config loaded. Host:', config.host, 'Database:', config.database);
  
  const connectionString = `postgres://${config.user}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;
  const sql = postgres(connectionString);
  
  (async () => {
    try {
      const result = await sql`SELECT 1 as test`;
      console.log('Success!', result);
      process.exit(0);
    } catch (err) {
      console.error('Database connection failed:', err);
      process.exit(1);
    }
  })();
} catch (err) {
  console.error('Error running test:', err);
  process.exit(1);
}
