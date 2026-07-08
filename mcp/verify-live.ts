// Throwaway local verification script for the remote/live dispatch path in
// data.ts. Run with GAMEDOC_APP_URL/GAMEDOC_COLLAB_URL/GAMEDOC_AGENT_TOKEN
// already set as real env vars (before the process starts, so data.ts's
// module-level consts pick them up) — not deleted from disk as part of the
// feature; deleted after this verification pass.
//
// testId is unique per run (not a fixed name): a REST DELETE only removes
// the content.json entry — it never clears the doc's Yjs room from LevelDB.
// A fixed id would let the *previous* run's leftover room content silently
// win over this run's fresh createDoc body (existing CRDT state always
// beats the on-disk seed — see ydoc.ts's seedYDoc), producing bogus results
// on every run after the first.
import { loadDocs, createDoc, updateDoc, deleteDoc } from './src/data.js';

async function main() {
  console.log('--- 1. loadDocs (remote mode) ---');
  const docs = await loadDocs();
  console.log('doc count:', docs.length, 'has main-crew:', docs.some((d) => d.id === 'main-crew'));

  console.log('--- 2. createDoc ---');
  const testId = `mcp-live-verify-tmp-${Date.now()}`;
  const created = await createDoc({
    id: testId,
    title: 'MCP Live Verify Tmp',
    parentId: null,
    order: 9999,
    body: JSON.stringify({
      v: 2,
      blocks: [
        { id: 'p1', type: 'paragraph', text: 'hello from live verify' },
        { id: 'w1', type: 'characterCard', props: { sourcePageId: 'main-crew', hideJson: false } },
      ],
    }),
  });
  console.log('created:', created.id);

  console.log('--- 3. loadDocs reflects the create ---');
  const docs2 = await loadDocs();
  console.log('now has test doc:', docs2.some((d) => d.id === testId));

  console.log('--- 4. updateDoc: tree-only change (order), via PATCH ---');
  const r1 = await updateDoc(testId, { order: 1 });
  console.log('tree update ok:', r1.ok, r1.ok ? r1.doc.order : r1.error);

  console.log('--- 5. updateDoc: content change via collab (title) ---');
  const r2 = await updateDoc(testId, { title: 'MCP Live Verify Tmp (renamed)' });
  console.log('content update ok:', r2.ok, r2.ok ? r2.doc.title : r2.error);

  console.log('--- 6. widget-drop guard: plain markdown body, no dropWidgets -> must refuse ---');
  const r3 = await updateDoc(testId, { body: 'just plain markdown, no widgets' }, { dropWidgets: false });
  console.log('guard result ok (expect false):', r3.ok, r3.ok ? '' : r3.error);

  console.log('--- 7. confirm widget still present after refused update ---');
  const docs3 = await loadDocs();
  const stillThere = docs3.find((d) => d.id === testId);
  console.log('body still has characterCard:', stillThere?.body.includes('characterCard'));

  console.log('--- 8. id-preserving update -> must NOT trip guard ---');
  const preserved = JSON.stringify({
    v: 2,
    blocks: [
      { id: 'p1', type: 'paragraph', text: 'hello EDITED' },
      { id: 'w1', type: 'characterCard', props: { sourcePageId: 'main-crew', hideJson: true } },
    ],
  });
  const r4 = await updateDoc(testId, { body: preserved });
  console.log('id-preserving update ok (expect true):', r4.ok, r4.ok ? '' : r4.error);

  console.log('--- 9. dropWidgets:true -> must succeed and actually drop ---');
  const r5 = await updateDoc(testId, { body: 'now really plain markdown' }, { dropWidgets: true });
  console.log('drop-confirmed update ok (expect true):', r5.ok, r5.ok ? r5.doc.body : r5.error);

  console.log('--- 10. deleteDoc + liveRoomWarning ---');
  const r6 = await deleteDoc(testId);
  console.log('delete ok:', r6.ok, r6.ok ? { reparentedChildren: r6.reparentedChildren, liveRoomWarning: r6.liveRoomWarning } : r6.error);

  console.log('--- 11. confirm gone ---');
  const docs4 = await loadDocs();
  console.log('gone:', !docs4.some((d) => d.id === testId));

  process.exit(0);
}

main().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
