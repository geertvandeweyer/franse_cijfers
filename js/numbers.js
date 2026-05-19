// Belgian French number-to-words (1–1000)
// Belgian differences from standard French:
//   70-79  → septante    (standard: soixante-dix)
//   80-89  → quatre-vingts (same — octante is Swiss, not Belgian)
//   90-99  → nonante     (standard: quatre-vingt-dix)

'use strict';

const _ones = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf'
];

const _tensNames = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function _below100(n) {
  if (n === 0) return '';
  if (n < 20) return _ones[n];

  const t = Math.floor(n / 10);
  const o = n % 10;

  if (t === 9) {                          // 90–99 : nonante (Belgisch)
    if (o === 0) return 'nonante';
    if (o === 1) return 'nonante et un';
    return 'nonante-' + _ones[o];
  }
  if (t === 8) {                          // 80–89 : quatre-vingts
    if (o === 0) return 'quatre-vingts';
    return 'quatre-vingt-' + _ones[o];
  }
  if (t === 7) {                          // 70–79 : septante (Belgisch)
    if (o === 0) return 'septante';
    if (o === 1) return 'septante et un';
    return 'septante-' + _ones[o];
  }

  // 20–69 : standard
  const tName = _tensNames[t];
  if (o === 0) return tName;
  if (o === 1) return tName + ' et un';
  return tName + '-' + _ones[o];
}

/**
 * Convert an integer 1–1000 to Belgian French words.
 * @param {number} n
 * @returns {string}
 */
function toFrenchBelgian(n) {
  if (!Number.isInteger(n) || n < 1 || n > 1000) return '';
  if (n === 1000) return 'mille';
  if (n < 100) return _below100(n);

  const h = Math.floor(n / 100);
  const rem = n % 100;

  const prefix = h === 1 ? 'cent' : _ones[h] + ' cent';

  if (rem === 0) {
    // deux cents, trois cents … (plural 's' when nothing follows)
    return prefix + (h > 1 ? 's' : '');
  }

  return prefix + ' ' + _below100(rem);
}
