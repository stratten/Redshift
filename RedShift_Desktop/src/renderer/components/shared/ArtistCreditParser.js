(function (globalScope) {
  'use strict';

  const UNKNOWN_ARTIST = 'Unknown Artist';
  const FEATURE_MARKER = /\s+(?:feat(?:\.|uring)?|ft\.?)\s+/i;
  const PRIMARY_SEPARATOR = /\s*(?:,|&)\s*|\s+\bx\b\s+/i;
  const FEATURED_SEPARATOR = /\s*(?:,|&)\s*|\s+\band\b\s+/i;
  const TITLE_FEATURE_CREDIT = /\s*\(\s*(?:feat(?:\.|uring)?|ft\.?)\s+(.+?)\s*\)\s*$/i;

  function normalizeArtistKey(value) {
    return String(value || '').trim().toLocaleLowerCase();
  }

  function splitArtistNames(value, separator) {
    return String(value || '').split(separator).map(name => name.trim()).filter(Boolean);
  }

  function uniqueArtistNames(names) {
    const namesByKey = new Map();
    names.forEach(name => {
      const key = normalizeArtistKey(name);
      if (key && !namesByKey.has(key)) {
        namesByKey.set(key, name.trim());
      }
    });
    return Array.from(namesByKey.values());
  }

  function parseArtistCredit(rawArtist) {
    const raw = String(rawArtist || '').trim();
    if (!raw || normalizeArtistKey(raw) === normalizeArtistKey(UNKNOWN_ARTIST)) {
      return {
        rawArtist: raw || UNKNOWN_ARTIST,
        primaryArtists: [UNKNOWN_ARTIST],
        featuredArtists: [],
        allArtists: [UNKNOWN_ARTIST],
        primaryKeys: [normalizeArtistKey(UNKNOWN_ARTIST)],
        featuredKeys: [],
        allArtistKeys: [normalizeArtistKey(UNKNOWN_ARTIST)]
      };
    }

    const markerMatch = FEATURE_MARKER.exec(raw);
    const primaryRaw = markerMatch ? raw.slice(0, markerMatch.index) : raw;
    const featuredRaw = markerMatch ? raw.slice(markerMatch.index + markerMatch[0].length) : '';
    const primaryArtists = uniqueArtistNames(splitArtistNames(primaryRaw, PRIMARY_SEPARATOR));
    const featuredArtists = uniqueArtistNames(splitArtistNames(featuredRaw, FEATURED_SEPARATOR));
    const safePrimaryArtists = primaryArtists.length > 0 ? primaryArtists : [raw];
    const allArtists = uniqueArtistNames(safePrimaryArtists.concat(featuredArtists));

    return {
      rawArtist: raw,
      primaryArtists: safePrimaryArtists,
      featuredArtists,
      allArtists,
      primaryKeys: safePrimaryArtists.map(normalizeArtistKey),
      featuredKeys: featuredArtists.map(normalizeArtistKey),
      allArtistKeys: allArtists.map(normalizeArtistKey)
    };
  }

  function parseTrackArtistCredit(rawArtist, title) {
    const artistCredit = parseArtistCredit(rawArtist);
    if (artistCredit.featuredArtists.length > 0) {
      return artistCredit;
    }

    const titleFeatureMatch = TITLE_FEATURE_CREDIT.exec(String(title || ''));
    if (!titleFeatureMatch) {
      return artistCredit;
    }

    const featuredArtists = uniqueArtistNames(splitArtistNames(titleFeatureMatch[1], FEATURED_SEPARATOR));
    if (featuredArtists.length === 0) {
      return artistCredit;
    }

    const allArtists = uniqueArtistNames(artistCredit.primaryArtists.concat(featuredArtists));
    return {
      rawArtist: artistCredit.rawArtist,
      primaryArtists: artistCredit.primaryArtists,
      featuredArtists,
      allArtists,
      primaryKeys: artistCredit.primaryKeys,
      featuredKeys: featuredArtists.map(normalizeArtistKey),
      allArtistKeys: allArtists.map(normalizeArtistKey)
    };
  }

  const artistCreditApi = {
    normalizeArtistKey,
    parseArtistCredit,
    parseTrackArtistCredit
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = artistCreditApi;
  }

  Object.assign(globalScope, artistCreditApi);
})(typeof globalThis !== 'undefined' ? globalThis : window);
