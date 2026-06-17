import postgres from 'postgres';

const databaseUrl = 'postgresql://postgres.botmsymjatdnizqtneoi:jesuisN0ir%4014@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function main() {
  console.log('Connecting to Supabase...');
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const permitRequestsCount = await sql`SELECT COUNT(*) FROM permit_requests`;
    console.log('SUPABASE permit_requests COUNT:', permitRequestsCount[0]?.count);

    if (Number(permitRequestsCount[0]?.count) > 0) {
      const allReqs = await sql`
        SELECT pr.id, pr.status, pr.region, pr.created_at, h.first_name, h.last_name 
        FROM permit_requests pr
        LEFT JOIN hunters h ON pr.hunter_id = h.id
      `;
      console.log('SUPABASE REQUESTS:', allReqs);
    }
  } catch (err: any) {
    console.error('Error querying Supabase:', err.message);
  }

  await sql.end();
}

main().catch(console.error);
