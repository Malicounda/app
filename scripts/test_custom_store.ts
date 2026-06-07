import { CustomPGStore } from '../server/utils/sessionStore.js';

async function main() {
  const store = new CustomPGStore();
  
  // Wait a bit for table init
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Testing set...');
  try {
    await new Promise<void>((resolve, reject) => {
      store.set('test-sid', { cookie: { maxAge: 1000 } } as any, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✅ set success!');
  } catch (err: any) {
    console.error('❌ set error:', err);
  }
}

main().catch(console.error);
