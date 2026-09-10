// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, set, update } from 'firebase/database';

const PROJECT_ID = 'demo-parlipro';
const ROOM = 'RULE1';
let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules: readFileSync('database.rules.json', 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), `rooms/${ROOM}`), {
      roomCode: ROOM,
      students: [{ id: 'student-1', name: 'Alice' }],
      access: { ownerUid: 'owner', controllerUid: 'po', controllerExpiresAt: Date.now() + 60000 },
      updatedAt: Date.now(),
    });
    await set(ref(context.database(), `roomSecrets/${ROOM}`), { pinHash: 'hidden' });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Realtime Database authorization', () => {
  it('allows only the active controller to write round state', async () => {
    const poDb = testEnv.authenticatedContext('po').database();
    const spectatorDb = testEnv.authenticatedContext('spectator').database();
    await assertSucceeds(update(ref(poDb, `rooms/${ROOM}`), { mode: 'question', speechCounter: 2 }));
    await assertFails(update(ref(spectatorDb, `rooms/${ROOM}`), { mode: 'speech' }));
    await assertFails(set(ref(spectatorDb, `rooms/${ROOM}`), null));
  });

  it('does not let clients alter access leases or secrets', async () => {
    const poDb = testEnv.authenticatedContext('po').database();
    await assertFails(update(ref(poDb, `rooms/${ROOM}/access`), { controllerExpiresAt: Date.now() + 3600000 }));
    await assertFails(set(ref(poDb, `roomSecrets/${ROOM}`), { poPin: '123456' }));
  });

  it('limits competitor writes to the identity they claimed', async () => {
    const aliceDb = testEnv.authenticatedContext('alice-uid').database();
    const bobDb = testEnv.authenticatedContext('bob-uid').database();
    await assertSucceeds(set(ref(aliceDb, `rooms/${ROOM}/competitorClaims/student-1`), {
      uid: 'alice-uid', claimedAt: Date.now(),
    }));
    await assertSucceeds(set(ref(aliceDb, `rooms/${ROOM}/splits/student-1/bill-1`), 'aff'));
    await assertFails(set(ref(bobDb, `rooms/${ROOM}/splits/student-1/bill-1`), 'neg'));
    await assertFails(update(ref(bobDb, `rooms/${ROOM}/competitorClaims/student-1`), { uid: 'bob-uid', claimedAt: Date.now() }));
  });

  it('allows authenticated reads but rejects unauthenticated reads', async () => {
    await assertSucceeds(set(ref(testEnv.authenticatedContext('spectator').database(), `rooms/${ROOM}/spectatorPresence/spectator`), {
      uid: 'spectator', heartbeat: Date.now(),
    }));
    await assertSucceeds(get(ref(testEnv.authenticatedContext('spectator').database(), `rooms/${ROOM}`)));
    const unauthDb = testEnv.unauthenticatedContext().database();
    await assertFails(get(ref(unauthDb, `rooms/${ROOM}`)));
  });

  it('rejects controller arrays that exceed their bounded numeric keys', async () => {
    const poDb = testEnv.authenticatedContext('po').database();
    const oversizedRoster = Array.from({ length: 101 }, (_, index) => ({
      id: `student-${index}`,
      name: `Student ${index}`,
    }));
    await assertFails(set(ref(poDb, `rooms/${ROOM}/students`), oversizedRoster));
  });

  it('rejects docket proposals containing more than 100 bills', async () => {
    const competitorDb = testEnv.authenticatedContext('competitor-uid').database();
    await assertSucceeds(set(ref(competitorDb, `rooms/${ROOM}/competitorClaims/student-1`), {
      uid: 'competitor-uid', claimedAt: Date.now(),
    }));
    await assertFails(set(ref(competitorDb, `rooms/${ROOM}/docketProposals/student-1`), {
      uid: 'competitor-uid',
      name: 'Competitor',
      submittedAt: Date.now(),
      bills: Array.from({ length: 101 }, (_, index) => `bill-${index}`),
    }));
  });
});
