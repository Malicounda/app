import bcrypt from 'bcrypt';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/scodipp');

async function main() {
  const password = '1991A';
  const hashedPassword = await bcrypt.hash(password, 10);
  
  console.log('Hashed password:', hashedPassword);
  
  const result = await sql`
    UPDATE users 
    SET password = ${hashedPassword}
    WHERE username = '00491'
    RETURNING id, username
  `;
  
  if (result.length > 0) {
    console.log('Password updated for user:', result[0]);
  } else {
    console.log('User 00491 not found');
  }
  
  await sql.end();
}

main().catch(console.error);
