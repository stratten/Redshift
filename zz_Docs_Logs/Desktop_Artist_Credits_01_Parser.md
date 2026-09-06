# Desktop Artist Credits: Parser Specification

## Applies
- Create `RedShift_Desktop/src/renderer/components/shared/ArtistCreditParser.js`.
- This pure renderer-side module is the sole authority for deriving canonical artist identities from the immutable raw artist credit.

## Final file content
```javascript
(function (globalScope) {
  'use strict';

  const UNKNOWN_ARTIST = 'Unknown Artist';
  const FEATURE_MARKER = /\s+(?:feat(?:\.|uring)?|ft\.?)\s+/i;
  const PRIMARY_SEPARATOR = /\s*(?:,|&)\s*|\s+\bx\b\s+/i;
  const FEATURED_SEPARATOR = /\s*(?:,|&)\s*|\s+\band\b\s+/i;

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
    const allArtists = uniqueArtistNames([...safePrimaryArtists, ...featuredArtists]);

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

  const artistCreditApi = {
    normalizeArtistKey,
    parseArtistCredit
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = artistCreditApi;
  }

  Object.assign(globalScope, artistCreditApi);
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

## Settled behavior
- Parse feature markers `feat.`, `feat`, `featuring`, `ft.`, and `ft` case-insensitively.
- Split co-primary credits only on comma, ampersand, and a whitespace-surrounded `x`.
- Split the featured suffix only on comma, ampersand, and the word `and`.
- Preserve unrecognized forms and affiliation text such as `Bizarre from D‐12` as a single canonical display name.
- Do not parse `with`; do not alter track titles; do not write derived identities to audio tags or SQLite.
