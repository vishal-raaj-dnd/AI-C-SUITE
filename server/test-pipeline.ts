import { initDatabase, retrieveKb } from './db.js';
import { DebateOrchestrator } from './orchestrator.js';

async function test() {
  console.log('--- Initializing Database ---');
  await initDatabase();

  console.log('--- Testing KB Retrieval ---');
  const chunks = await retrieveKb('freemium conversion rate', ['marketing']);
  console.log('Retrieved chunks:', chunks);

  console.log('--- Testing Orchestrator End-to-End ---');
  const debateId = `test_deb_${Date.now()}`;
  const orchestrator = new DebateOrchestrator(debateId, 'Should we launch a freemium tier?');

  orchestrator.on('status', (event) => {
    console.log(`[STATUS] Step: ${event.step} | Message: ${event.message || ''}`);
    if (event.step === 'debate_complete') {
      console.log('--- Debate Complete! ---');
      console.log('Final Cards count:', event.cards.length);
      console.log('Total Cost:', event.total_cost);
      process.exit(0);
    }
    if (event.step === 'failed') {
      console.error('Debate failed:', event.error);
      process.exit(1);
    }
  });

  await orchestrator.run();
}

test().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
