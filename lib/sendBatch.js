// Runs `worker` over `items` in fixed-size concurrent batches instead of one
// at a time — a sequential await-in-a-loop over hundreds of members can
// exceed Vercel's function timeout well before a real error shows up, and a
// timed-out request looks like "nothing happened" to whoever clicked send.
async function sendInBatches(items, batchSize, worker) {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const outcomes = await Promise.allSettled(batch.map(worker));
    outcomes.forEach((outcome) => {
      if (outcome.status === "fulfilled") sent += 1;
      else failed += 1;
    });
  }

  return { sent, failed };
}

module.exports = { sendInBatches };
