const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { initializeDatabase } = require('../src/main/services/Database.js');
const TvMazeService = require('../src/main/services/TvMazeService.js');

function response(body, status = 200, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => body,
    arrayBuffer: async () => Buffer.from('image-data')
  };
}

async function createHarness(fetchImpl) {
  const appDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'redshift-tvmaze-'));
  const db = await initializeDatabase(path.join(appDataPath, 'test.db'));
  const manager = new EventEmitter();
  manager.db = db;
  manager.appDataPath = appDataPath;
  const service = new TvMazeService(manager, { fetchImpl, minRequestIntervalMs: 1 });
  await service.initialize();

  return {
    appDataPath,
    db,
    manager,
    service,
    async close() {
      await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
      await fs.rm(appDataPath, { recursive: true, force: true });
    }
  };
}

function getRow(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

function exactShow(id, name) {
  return {
    id,
    name,
    url: `https://www.tvmaze.com/shows/${id}`,
    premiered: '2020-01-01',
    status: 'Running',
    type: 'Scripted',
    language: 'English',
    genres: ['Drama'],
    network: { name: 'Example Network', country: { name: 'United States' } },
    image: { medium: `https://images.example/${id}.jpg` },
    summary: '<p>A <strong>plain</strong> summary.</p>',
    _embedded: {
      episodes: [
        {
          id: id * 100,
          season: 1,
          number: 2,
          name: 'Episode Two',
          summary: '<p>Episode <em>description</em>.</p>',
          airdate: '2020-01-08',
          runtime: 42,
          image: { medium: `https://images.example/${id}-episode.jpg` }
        }
      ]
    }
  };
}

test('normalizes titles and removes TVMaze summary markup', () => {
  assert.equal(TvMazeService.normalizeKey('Tést.Show!'), 'test show');
  assert.equal(TvMazeService.plainText('<p>A&nbsp;TVMaze <strong>summary</strong>.</p>'), 'A TVMaze summary.');
});

test('automatically persists a single exact series match with episode metadata and cached poster', async () => {
  const harness = await createHarness(async (url) => {
    if (url.includes('/search/shows')) return response([{ show: exactShow(11, 'Example Show') }]);
    if (url.includes('/shows/11?embed=episodes')) return response(exactShow(11, 'Example Show'));
    if (url.startsWith('https://images.example/')) return response(Buffer.from('image-data'));
    throw new Error(`Unexpected URL: ${url}`);
  });

  try {
    await harness.service.lookupSeries('example show', 'Example Show');
    const series = await getRow(harness.db, 'SELECT * FROM tvmaze_series_metadata WHERE series_key = ?', ['example show']);
    const episode = await getRow(harness.db, 'SELECT * FROM tvmaze_episode_metadata WHERE tvmaze_episode_id = ?', [1100]);

    assert.equal(series.match_status, 'matched');
    assert.equal(series.tvmaze_show_id, 11);
    assert.equal(series.summary, 'A plain summary.');
    assert.ok(series.poster_path);
    assert.equal(episode.episode_title, 'Episode Two');
    assert.equal(episode.summary, 'Episode description.');
    assert.equal(await fs.stat(series.poster_path).then(() => true), true);
  } finally {
    await harness.close();
  }
});

test('persists ambiguous candidates until the user selects a valid show', async () => {
  const harness = await createHarness(async (url) => {
    if (url.includes('/search/shows')) {
      return response([{ show: exactShow(21, 'Top Gear') }, { show: exactShow(22, 'Top Gear') }]);
    }
    if (url.includes('/shows/21?embed=episodes')) return response(exactShow(21, 'Top Gear'));
    if (url.startsWith('https://images.example/')) return response(Buffer.from('image-data'));
    throw new Error(`Unexpected URL: ${url}`);
  });

  try {
    await harness.service.lookupSeries('top gear', 'Top Gear');
    const candidates = await harness.service.getCandidates('top gear');
    assert.equal(candidates.matchStatus, 'needs_match');
    assert.deepEqual(candidates.candidates.map((candidate) => candidate.id), [21, 22]);

    await assert.rejects(() => harness.service.selectCandidate('top gear', 99), /not a valid candidate/);
    await harness.service.selectCandidate('top gear', 21);
    const series = await getRow(harness.db, 'SELECT match_status, tvmaze_show_id FROM tvmaze_series_metadata WHERE series_key = ?', ['top gear']);
    assert.deepEqual(series, { match_status: 'matched', tvmaze_show_id: 21 });
  } finally {
    await harness.close();
  }
});

test('records no-match results and retries a 429 response without external network access', async () => {
  let retryRequests = 0;
  const harness = await createHarness(async (url) => {
    if (url.includes('/search/shows?q=Missing')) return response([]);
    if (url.endsWith('/retry')) {
      retryRequests += 1;
      return retryRequests === 1
        ? response({}, 429, { 'retry-after': '0.001' })
        : response({ ok: true });
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  try {
    await harness.service.lookupSeries('missing', 'Missing');
    const series = await getRow(harness.db, 'SELECT match_status, retry_after FROM tvmaze_series_metadata WHERE series_key = ?', ['missing']);
    assert.equal(series.match_status, 'not_found');
    assert.ok(series.retry_after > Math.floor(Date.now() / 1000));
    assert.deepEqual(await harness.service.requestJson('/retry'), { ok: true });
    assert.equal(retryRequests, 2);
  } finally {
    await harness.close();
  }
});
