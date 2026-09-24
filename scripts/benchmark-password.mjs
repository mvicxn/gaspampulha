const encoder = new TextEncoder();

async function once(iterations) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const started = performance.now();
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    await crypto.subtle.importKey("raw", encoder.encode("benchmark-password"), "PBKDF2", false, ["deriveBits"]),
    256,
  );
  return { ms: performance.now() - started, bytes: bits.byteLength };
}

const candidates = [10_000, 20_000, 40_000, 80_000, 120_000];
const budgetMs = 8;
const results = [];
for (const iterations of candidates) {
  const samples = [];
  for (let i = 0; i < 5; i += 1) samples.push((await once(iterations)).ms);
  samples.sort((a, b) => a - b);
  const median = samples[2];
  results.push({ iterations, medianMs: Number(median.toFixed(2)), maxMs: Number(samples[4].toFixed(2)) });
  if (median > budgetMs) break;
}
const fit = results.filter((item) => item.medianMs <= budgetMs);
const chosen = fit.length > 0 ? fit[fit.length - 1] : results[0];
console.log(JSON.stringify({ algorithm: "PBKDF2-SHA-256", budgetMs, results, chosenIterations: chosen.iterations }, null, 2));
