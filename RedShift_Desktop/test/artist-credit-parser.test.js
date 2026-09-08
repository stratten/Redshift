const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeArtistKey,
  parseArtistCredit,
  parseTrackArtistCredit
} = require('../src/renderer/components/shared/ArtistCreditParser.js');

test('returns Unknown Artist for empty credits', () => {
  const credit = parseArtistCredit('  ');

  assert.deepEqual(credit.primaryArtists, ['Unknown Artist']);
  assert.deepEqual(credit.featuredArtists, []);
  assert.deepEqual(credit.allArtists, ['Unknown Artist']);
});

test('keeps plain artist credits as one primary artist', () => {
  const credit = parseArtistCredit('Eminem');

  assert.equal(credit.rawArtist, 'Eminem');
  assert.deepEqual(credit.primaryArtists, ['Eminem']);
  assert.deepEqual(credit.featuredArtists, []);
});

test('parses supported feature marker spellings', () => {
  ['feat.', 'feat', 'featuring', 'ft.', 'ft'].forEach(marker => {
    const credit = parseArtistCredit(`Lane 8 ${marker} Fractures`);
    assert.deepEqual(credit.primaryArtists, ['Lane 8']);
    assert.deepEqual(credit.featuredArtists, ['Fractures']);
  });
});

test('derives title-suffix featured artists without changing the artist credit', () => {
  const credit = parseTrackArtistCredit('Eminem', 'Love The Way You Lie (feat. Rihanna)');

  assert.equal(credit.rawArtist, 'Eminem');
  assert.deepEqual(credit.primaryArtists, ['Eminem']);
  assert.deepEqual(credit.featuredArtists, ['Rihanna']);
  assert.deepEqual(credit.allArtists, ['Eminem', 'Rihanna']);
});

test('does not let a title suffix override an explicit artist feature credit', () => {
  const credit = parseTrackArtistCredit('The Glitch Mob feat. edIT', 'You Need (feat. Someone Else)');

  assert.deepEqual(credit.featuredArtists, ['edIT']);
});

test('parses co-primary and featured artists in one credit', () => {
  const credit = parseArtistCredit('The Glitch Mob & Rob Simonsen feat. Arama');

  assert.deepEqual(credit.primaryArtists, ['The Glitch Mob', 'Rob Simonsen']);
  assert.deepEqual(credit.featuredArtists, ['Arama']);
  assert.deepEqual(credit.allArtists, ['The Glitch Mob', 'Rob Simonsen', 'Arama']);
});

test('parses comma and x-separated co-primary artists', () => {
  assert.deepEqual(
    parseArtistCredit('NUEKI, TOLCHONOV').primaryArtists,
    ['NUEKI', 'TOLCHONOV']
  );
  assert.deepEqual(
    parseArtistCredit('Dxrk ダーク x Kordhell').primaryArtists,
    ['Dxrk ダーク', 'Kordhell']
  );
});

test('parses comma, ampersand, and and-separated featured artists', () => {
  const credit = parseArtistCredit('Eminem featuring Dr. Dre, Snoop Dogg, Xzibit and Nate Dogg');

  assert.deepEqual(credit.primaryArtists, ['Eminem']);
  assert.deepEqual(credit.featuredArtists, ['Dr. Dre', 'Snoop Dogg', 'Xzibit', 'Nate Dogg']);
});

test('de-duplicates names by canonical key without changing first display casing', () => {
  const credit = parseArtistCredit('Eminem & eminem feat. Dido & dido');

  assert.deepEqual(credit.primaryArtists, ['Eminem']);
  assert.deepEqual(credit.featuredArtists, ['Dido']);
  assert.deepEqual(credit.allArtists, ['Eminem', 'Dido']);
  assert.equal(normalizeArtistKey('  POLIÇA '), 'poliça');
});

test('preserves affiliations and raw credit text for unsupported identity detail', () => {
  const credit = parseArtistCredit('Eminem featuring Bizarre from D‐12');

  assert.equal(credit.rawArtist, 'Eminem featuring Bizarre from D‐12');
  assert.deepEqual(credit.featuredArtists, ['Bizarre from D‐12']);
});
