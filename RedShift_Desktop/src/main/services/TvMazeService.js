// src/main/services/TvMazeService.js - Background TVMaze metadata and artwork cache.

const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');

const TVMAZE_BASE_URL = 'https://api.tvmaze.com';
const MATCHED = 'matched';
const NEEDS_MATCH = 'needs_match';
const NOT_FOUND = 'not_found';
const FAILED = 'failed';
const RETRY_DELAY_SECONDS = 60 * 60;
const NOT_FOUND_RETRY_SECONDS = 7 * 24 * 60 * 60;

class TvMazeService {
  constructor(manager, options = {}) {
    this.manager = manager;
    this.fetchImpl = options.fetchImpl || global.fetch;
    this.baseUrl = options.baseUrl || TVMAZE_BASE_URL;
    this.minRequestIntervalMs = options.minRequestIntervalMs || 600;
    this.cacheDir = options.cacheDir || path.join(manager.appDataPath, 'video-metadata', 'tvmaze');
    this.lastRequestAt = 0;
    this.requestQueue = Promise.resolve();
    this.enrichmentPromise = null;
    this.pendingSeries = new Map();
  }

  get db() {
    return this.manager.db;
  }

  async initialize() {
    await fs.ensureDir(this.cacheDir);
  }

  runSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function onRun(error) {
        if (error) reject(error);
        else resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }

  allSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => {
        if (error) reject(error);
        else resolve(rows);
      });
    });
  }

  getSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (error, row) => {
        if (error) reject(error);
        else resolve(row || null);
      });
    });
  }

  emitUpdate(seriesKey, stage) {
    this.manager.emit('tvmaze-metadata-updated', { seriesKey, stage });
  }

  async enrichRecognizedSeries() {
    if (this.enrichmentPromise) return this.enrichmentPromise;

    this.enrichmentPromise = this.performEnrichment();
    try {
      return await this.enrichmentPromise;
    } finally {
      this.enrichmentPromise = null;
    }
  }

  async performEnrichment() {
    const now = Math.floor(Date.now() / 1000);
    const series = await this.allSql(
      `SELECT DISTINCT videos.series_key AS series_key, videos.series_title AS series_title
       FROM videos
       LEFT JOIN tvmaze_series_metadata AS metadata ON metadata.series_key = videos.series_key
       WHERE videos.content_kind = 'tv'
         AND videos.series_key IS NOT NULL
         AND (
           metadata.series_key IS NULL
           OR (
             metadata.match_status IN (?, ?, ?)
             AND (metadata.retry_after IS NULL OR metadata.retry_after <= ?)
           )
         )
       ORDER BY videos.series_title COLLATE NOCASE ASC`,
      ['pending', FAILED, NOT_FOUND, now]
    );

    for (const entry of series) {
      try {
        await this.lookupSeries(entry.series_key, entry.series_title);
      } catch (error) {
        await this.recordFailure(entry.series_key, entry.series_title, error);
      }
    }
  }

  async lookupSeries(seriesKey, seriesTitle, forcePicker = false) {
    return this.runForSeries(seriesKey, () => this.performLookupSeries(seriesKey, seriesTitle, forcePicker));
  }

  async performLookupSeries(seriesKey, seriesTitle, forcePicker = false) {
    const candidates = await this.searchShows(seriesTitle);
    const exactMatches = candidates.filter((candidate) => normalizeKey(candidate.name) === seriesKey);

    if (!forcePicker && exactMatches.length === 1) {
      await this.hydrateSeries(seriesKey, seriesTitle, exactMatches[0].id);
      return;
    }

    if (candidates.length === 0) {
      await this.upsertSeries({
        seriesKey,
        localTitle: seriesTitle,
        matchStatus: NOT_FOUND,
        candidates: [],
        retryAfter: currentUnixTime() + NOT_FOUND_RETRY_SECONDS,
        lastError: null
      });
      this.emitUpdate(seriesKey, NOT_FOUND);
      return;
    }

    await this.upsertSeries({
      seriesKey,
      localTitle: seriesTitle,
      matchStatus: NEEDS_MATCH,
      candidates,
      retryAfter: null,
      lastError: null
    });
    this.emitUpdate(seriesKey, NEEDS_MATCH);
  }

  async getCandidates(seriesKey) {
    const row = await this.getSql(
      `SELECT local_title, match_status, candidate_json
       FROM tvmaze_series_metadata
       WHERE series_key = ?`,
      [seriesKey]
    );
    if (!row) return { localTitle: null, matchStatus: 'pending', candidates: [] };

    return {
      localTitle: row.local_title,
      matchStatus: row.match_status,
      candidates: parseCandidates(row.candidate_json)
    };
  }

  async selectCandidate(seriesKey, showId) {
    const metadata = await this.getCandidates(seriesKey);
    const candidate = metadata.candidates.find((item) => item.id === showId);
    if (!candidate) {
      throw new Error('The selected TVMaze show is not a valid candidate for this series.');
    }
    return this.runForSeries(seriesKey, () => this.hydrateSeries(seriesKey, metadata.localTitle, showId));
  }

  async refreshSeries(seriesKey, forcePicker = false) {
    return this.runForSeries(seriesKey, () => this.performRefreshSeries(seriesKey, forcePicker));
  }

  async performRefreshSeries(seriesKey, forcePicker) {
    const metadata = await this.getSql(
      `SELECT local_title, tvmaze_show_id
       FROM tvmaze_series_metadata
       WHERE series_key = ?`,
      [seriesKey]
    );
    const localRow = metadata || await this.getSql(
      `SELECT series_title AS local_title
       FROM videos
       WHERE content_kind = 'tv' AND series_key = ?
       LIMIT 1`,
      [seriesKey]
    );
    if (!localRow?.local_title) throw new Error('No local TV series exists for this metadata refresh.');

    if (metadata?.tvmaze_show_id && !forcePicker) {
      await this.hydrateSeries(seriesKey, localRow.local_title, metadata.tvmaze_show_id);
      return;
    }

    if (metadata?.tvmaze_show_id && forcePicker) {
      const candidates = await this.searchShows(localRow.local_title);
      if (candidates.length === 0) throw new Error('TVMaze did not return replacement candidates for this series.');
      await this.runSql(
        `UPDATE tvmaze_series_metadata
         SET candidate_json = ?, last_lookup_at = strftime('%s', 'now'), last_error = NULL, updated_at = strftime('%s', 'now')
         WHERE series_key = ?`,
        [JSON.stringify(candidates), seriesKey]
      );
      this.emitUpdate(seriesKey, NEEDS_MATCH);
      return;
    }

    await this.runSql(
      `DELETE FROM tvmaze_series_metadata
       WHERE series_key = ?`,
      [seriesKey]
    );
    await this.performLookupSeries(seriesKey, localRow.local_title, forcePicker);
  }

  async cacheEpisodeArtwork(seriesKey) {
    const rows = await this.allSql(
      `SELECT episode.tvmaze_episode_id, episode.image_url
       FROM tvmaze_episode_metadata AS episode
       INNER JOIN tvmaze_series_metadata AS series ON series.tvmaze_show_id = episode.tvmaze_show_id
       WHERE series.series_key = ?
         AND episode.image_url IS NOT NULL
         AND episode.image_path IS NULL`,
      [seriesKey]
    );

    for (const row of rows) {
      const imagePath = await this.cacheArtwork(row.image_url, `episode-${row.tvmaze_episode_id}`);
      if (imagePath) {
        await this.runSql(
          'UPDATE tvmaze_episode_metadata SET image_path = ? WHERE tvmaze_episode_id = ?',
          [imagePath, row.tvmaze_episode_id]
        );
        this.emitUpdate(seriesKey, 'episode-artwork');
      }
    }
  }

  async hydrateSeries(seriesKey, localTitle, showId) {
    const show = await this.requestJson(`/shows/${showId}?embed=episodes`);
    if (!show?.id || show.id !== showId) {
      throw new Error('TVMaze did not return the selected show.');
    }

    const posterUrl = show.image?.medium || show.image?.original || null;
    const posterPath = posterUrl ? await this.cacheArtwork(posterUrl, `show-${show.id}`) : null;
    const episodes = Array.isArray(show._embedded?.episodes) ? show._embedded.episodes : [];

    await this.runSql('DELETE FROM tvmaze_episode_metadata WHERE tvmaze_show_id = ?', [show.id]);
    await this.upsertSeries({
      seriesKey,
      localTitle,
      matchStatus: MATCHED,
      show,
      candidates: [],
      posterUrl,
      posterPath,
      retryAfter: null,
      lastError: null
    });

    for (const episode of episodes) {
      if (!Number.isInteger(episode.id)) continue;
      await this.runSql(
        `INSERT OR REPLACE INTO tvmaze_episode_metadata
          (tvmaze_episode_id, tvmaze_show_id, season_number, episode_number, episode_title, summary, airdate, runtime, image_url, image_path, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, strftime('%s', 'now'))`,
        [
          episode.id,
          show.id,
          integerOrNull(episode.season),
          integerOrNull(episode.number),
          plainText(episode.name),
          plainText(episode.summary),
          episode.airdate || null,
          integerOrNull(episode.runtime),
          episode.image?.medium || episode.image?.original || null
        ]
      );
    }

    this.emitUpdate(seriesKey, MATCHED);
  }

  async searchShows(query) {
    const response = await this.requestJson(`/search/shows?q=${encodeURIComponent(query)}`);
    if (!Array.isArray(response)) return [];
    return response
      .map((result) => result.show)
      .filter((show) => Number.isInteger(show?.id) && show?.name)
      .map((show) => ({
        id: show.id,
        name: show.name,
        premiered: show.premiered || null,
        country: show.network?.country?.name || show.webChannel?.country?.name || null,
        posterUrl: show.image?.medium || show.image?.original || null,
        url: show.url || null
      }));
  }

  async upsertSeries({
    seriesKey,
    localTitle,
    matchStatus,
    show = null,
    candidates = [],
    posterUrl = null,
    posterPath = null,
    retryAfter = null,
    lastError = null
  }) {
    const now = currentUnixTime();
    await this.runSql(
      `INSERT INTO tvmaze_series_metadata
        (series_key, local_title, match_status, tvmaze_show_id, candidate_json, show_name, show_url, premiered, ended, show_status, show_type, language, genres_json, network_name, summary, poster_url, poster_path, last_lookup_at, last_refreshed_at, retry_after, last_error, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(series_key) DO UPDATE SET
         local_title = excluded.local_title,
         match_status = excluded.match_status,
         tvmaze_show_id = excluded.tvmaze_show_id,
         candidate_json = excluded.candidate_json,
         show_name = excluded.show_name,
         show_url = excluded.show_url,
         premiered = excluded.premiered,
         ended = excluded.ended,
         show_status = excluded.show_status,
         show_type = excluded.show_type,
         language = excluded.language,
         genres_json = excluded.genres_json,
         network_name = excluded.network_name,
         summary = excluded.summary,
         poster_url = excluded.poster_url,
         poster_path = excluded.poster_path,
         last_lookup_at = excluded.last_lookup_at,
         last_refreshed_at = excluded.last_refreshed_at,
         retry_after = excluded.retry_after,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
      [
        seriesKey,
        localTitle,
        matchStatus,
        show?.id || null,
        JSON.stringify(candidates),
        show ? plainText(show.name) : null,
        show?.url || null,
        show?.premiered || null,
        show?.ended || null,
        show?.status || null,
        show?.type || null,
        show?.language || null,
        show ? JSON.stringify(Array.isArray(show.genres) ? show.genres : []) : null,
        show?.network?.name || show?.webChannel?.name || null,
        show ? plainText(show.summary) : null,
        posterUrl,
        posterPath,
        now,
        show ? now : null,
        retryAfter,
        lastError,
        now
      ]
    );
  }

  async recordFailure(seriesKey, seriesTitle, error) {
    await this.upsertSeries({
      seriesKey,
      localTitle: seriesTitle,
      matchStatus: FAILED,
      candidates: [],
      retryAfter: currentUnixTime() + RETRY_DELAY_SECONDS,
      lastError: error.message
    });
    this.emitUpdate(seriesKey, FAILED);
  }

  async runForSeries(seriesKey, work) {
    if (this.pendingSeries.has(seriesKey)) return this.pendingSeries.get(seriesKey);

    const pending = Promise.resolve().then(work);
    this.pendingSeries.set(seriesKey, pending);
    try {
      return await pending;
    } finally {
      this.pendingSeries.delete(seriesKey);
    }
  }

  enqueueRequest(task) {
    const request = this.requestQueue.catch(() => undefined).then(task);
    this.requestQueue = request;
    return request;
  }

  async requestJson(route) {
    return this.enqueueRequest(async () => {
      if (typeof this.fetchImpl !== 'function') {
        throw new Error('Global fetch is unavailable for TVMaze metadata requests.');
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await this.waitForRateLimit();
        const response = await this.fetchImpl(`${this.baseUrl}${route}`, {
          headers: { 'User-Agent': 'Redshift/1.0 TVMaze metadata cache' }
        });
        this.lastRequestAt = Date.now();

        if (response.status === 429 && attempt < 2) {
          await delay(retryAfterMs(response.headers?.get?.('retry-after')));
          continue;
        }
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`TVMaze request failed with HTTP ${response.status}.`);
        return response.json();
      }

      throw new Error('TVMaze rate limit retry budget was exhausted.');
    });
  }

  async waitForRateLimit() {
    const remaining = this.minRequestIntervalMs - (Date.now() - this.lastRequestAt);
    if (remaining > 0) await delay(remaining);
  }

  async cacheArtwork(url, prefix) {
    try {
      const hash = crypto.createHash('sha256').update(url).digest('hex');
      const extension = imageExtension(url);
      const filePath = path.join(this.cacheDir, `${prefix}-${hash}${extension}`);
      if (await fs.pathExists(filePath)) return filePath;

      const response = await this.fetchImpl(url);
      if (!response.ok) return null;
      await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
      return filePath;
    } catch (_) {
      return null;
    }
  }
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim() || null;
}

function parseCandidates(value) {
  try {
    const candidates = JSON.parse(value || '[]');
    return Array.isArray(candidates) ? candidates : [];
  } catch (_) {
    return [];
  }
}

function integerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function imageExtension(url) {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension) ? extension : '.jpg';
}

function retryAfterMs(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 2000;
}

function currentUnixTime() {
  return Math.floor(Date.now() / 1000);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = TvMazeService;
module.exports.normalizeKey = normalizeKey;
module.exports.plainText = plainText;
module.exports.parseCandidates = parseCandidates;
