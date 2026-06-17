import { db } from './server/db.js';
import { permitRequests } from './shared/schema.js';

async function check() {
  const reqs = await db.select().from(permitRequests);
  console.log(`Total requests in DB: ${reqs.length}`);
  const statusCounts = reqs.reduce((acc: any, curr: any) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {});
  console.log('Status counts:', statusCounts);
  
  const regionCounts = reqs.reduce((acc: any, curr: any) => {
    const r = curr.region || 'null';
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});
  console.log('Region counts:', regionCounts);
  
  process.exit(0);
}

check();
