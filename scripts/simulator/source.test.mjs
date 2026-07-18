import assert from 'node:assert/strict';
import http from 'node:http';
import { inferCadence, loadSeriesSource, parseSourceText } from './source.mjs';

const expected = [
  { date: '2024-01-02', price: 1 },
  { date: '2024-01-03', price: 1.01 },
  { date: '2024-01-04', price: 1.02 },
];

assert.deepEqual(parseSourceText('date,price\n2024-01-02,1\n2024-01-03,1.01\n2024-01-04,1.02'), expected);
assert.deepEqual(
  parseSourceText(JSON.stringify({ points: expected }), { contentType: 'application/json' }),
  expected,
);

const html = `<!doctype html><table><thead><tr><th>Date</th><th>NAV</th></tr></thead><tbody>
  <tr><td>Jan 4, 2024</td><td>$1.02</td></tr>
  <tr><td>Jan 3, 2024</td><td>$1.01</td></tr>
  <tr><td>Jan 2, 2024</td><td>$1.00</td></tr>
</tbody></table>`;
assert.deepEqual(parseSourceText(html, { contentType: 'text/html' }), expected);
assert.equal(inferCadence(expected), 'daily');
assert.equal(
  inferCadence([
    { date: '2024-01-01', price: 1 },
    { date: '2024-02-01', price: 1.01 },
    { date: '2024-03-01', price: 1.02 },
  ]),
  'monthly',
);

const server = http.createServer((_, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const address = server.address();
  const imported = await loadSeriesSource(`http://127.0.0.1:${address.port}/prices`);
  assert.deepEqual(imported.series, expected);
  assert.equal(imported.sourceType, 'url');
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

assert.throws(
  () => parseSourceText('<html><p>No historical table here.</p></html>', { contentType: 'text/html' }),
  /Could not find a date\/price series/,
);

console.log('website source importer PASS');
