import postgres from 'postgres';

const databaseUrl = 'postgresql://postgres.botmsymjatdnizqtneoi:jesuisN0ir%4014@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function main() {
  console.log('Connecting to database...');
  const sql = postgres(databaseUrl, { prepare: false });

  // Query 1: getCodesInfractions
  try {
    console.log('\nTesting getCodesInfractions query...');
    const res = await sql`SELECT * FROM code_infractions ORDER BY code ASC`;
    console.log(`✅ Success! Retrieved ${res.length} rows.`);
  } catch (err: any) {
    console.error('❌ getCodesInfractions failed:', err.message);
  }

  // Query 2: getSaisieGroups
  try {
    console.log('\nTesting getSaisieGroups query...');
    const res = await sql`SELECT id, key, label, color, is_active FROM saisie_groups ORDER BY label ASC`;
    console.log(`✅ Success! Retrieved ${res.length} rows.`);
  } catch (err: any) {
    console.error('❌ getSaisieGroups failed:', err.message);
  }

  // Query 3: getSaisieItems
  try {
    console.log('\nTesting getSaisieItems query...');
    const res = await sql`
      SELECT id, key, label, is_active, quantity_enabled, unit_mode, unit_fixed_key, unit_allowed, group_key 
      FROM saisie_items 
      ORDER BY group_key NULLS LAST, label ASC
    `;
    console.log(`✅ Success! Retrieved ${res.length} rows.`);
  } catch (err: any) {
    console.error('❌ getSaisieItems failed:', err.message);
  }

  // Query 4: getAgentsVerbalisateurs
  try {
    console.log('\nTesting getAgentsVerbalisateurs query...');
    const res = await sql`
      SELECT
         av.*,
         creator.id AS created_by_user_id,
         creator.first_name AS created_by_prenom,
         creator.last_name AS created_by_nom,
         creator.role AS created_by_role,
         creator.region AS created_by_region,
         creator.departement AS created_by_departement
       FROM agents_verbalisateurs av
       LEFT JOIN users creator ON creator.id = av.created_by
       ORDER BY av.nom, av.prenom ASC
    `;
    console.log(`✅ Success! Retrieved ${res.length} rows.`);
  } catch (err: any) {
    console.error('❌ getAgentsVerbalisateurs failed:', err.message);
  }

  // Query 5: getInfractions
  try {
    console.log('\nTesting getInfractions query...');
    const res = await sql`
      SELECT i.*,
             ci.code,
             cii.nature AS item_nature,
             cii.article_code AS item_article,
             l.region, l.departement, l.commune,
             av.nom as agent_nom, av.prenom as agent_prenom,
             creator.id AS created_by_user_id,
             creator.first_name AS created_by_prenom,
             creator.last_name AS created_by_nom,
             creator.role AS created_by_role,
             creator.region AS created_by_region,
             creator.departement AS created_by_departement,
             array_agg(json_build_object(
               'id', c.id,
               'nom', c.nom,
               'prenom', c.prenom,
               'numero_piece', c.numero_piece,
               'type_piece', c.type_piece
             ) ORDER BY c.date_creation DESC NULLS LAST) AS contrevenants
      FROM infractions i
      LEFT JOIN code_infractions ci ON i.code_infraction_id = ci.id
      LEFT JOIN code_infraction_items cii ON i.code_item_id = cii.id
      LEFT JOIN lieux l ON i.lieu_id = l.id
      LEFT JOIN agents_verbalisateurs av ON i.agent_id = av.id
      LEFT JOIN users creator ON creator.id = i.created_by
      LEFT JOIN contrevenants_infractions ci2 ON i.id = ci2.infraction_id
      LEFT JOIN contrevenants c ON ci2.contrevenant_id = c.id
      GROUP BY i.id, ci.code, cii.nature, cii.article_code, l.region, l.departement, l.commune, av.nom, av.prenom,
               creator.id, creator.first_name, creator.last_name, creator.role, creator.region, creator.departement
      ORDER BY i.date_infraction DESC
    `;
    console.log(`✅ Success! Retrieved ${res.length} rows.`);
  } catch (err: any) {
    console.error('❌ getInfractions failed:', err.message);
  }

  // Query 6: getUnreadAlertsCount
  try {
    console.log('\nTesting getUnreadAlertsCount query...');
    // We get a user first
    const users = await sql`SELECT id FROM users LIMIT 1`;
    if (users.length > 0) {
      const userId = users[0].id;
      const res = await sql`
        SELECT count(*)::int as count 
        FROM notifications 
        WHERE user_id = ${userId} AND is_read = false
      `;
      console.log(`✅ Success! Count: ${res[0].count}`);
    } else {
      console.log('No users to test count with.');
    }
  } catch (err: any) {
    console.error('❌ getUnreadAlertsCount failed:', err.message);
  }

  await sql.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
});
