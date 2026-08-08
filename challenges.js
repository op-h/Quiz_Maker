/**
 * Shared Data & Utilities for CTF Platform
 */

window.CTF_DATA = window.CTF_DATA || {};

// SHA-256 for new content, with legacy verification support for older 8-char hashes.
window.CTF_DATA.normalizeInput = (str) => String(str).toLowerCase().trim();

window.CTF_DATA.legacyEncodeInput = (str) => {
  let h = 0x811c9dc5;
  const s = window.CTF_DATA.normalizeInput(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

window.CTF_DATA.encodeInput = (str) => {
  const s = window.CTF_DATA.normalizeInput(str);
  const bytes = Array.from(new TextEncoder().encode(s));
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const rotateRight = (value, bits) => (value >>> bits) | (value << (32 - bits));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  const high = Math.floor(bitLen / 0x100000000);
  const low = bitLen >>> 0;
  bytes.push((high >>> 24) & 255, (high >>> 16) & 255, (high >>> 8) & 255, high & 255);
  bytes.push((low >>> 24) & 255, (low >>> 16) & 255, (low >>> 8) & 255, low & 255);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const W = new Array(64);
    for (let i = 0; i < 16; i++) {
      const base = offset + (i * 4);
      W[i] = (((bytes[base] << 24) | (bytes[base + 1] << 16) | (bytes[base + 2] << 8) | bytes[base + 3]) >>> 0);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotateRight(W[i - 15], 7) ^ rotateRight(W[i - 15], 18) ^ (W[i - 15] >>> 3)) >>> 0;
      const s1 = (rotateRight(W[i - 2], 17) ^ rotateRight(W[i - 2], 19) ^ (W[i - 2] >>> 10)) >>> 0;
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return H.map((value) => value.toString(16).padStart(8, '0')).join('');
};

window.CTF_DATA.verifyInput = (str, expectedHash) => {
  const hash = String(expectedHash || '').toLowerCase().trim();
  if (!hash) return false;
  if (/^[0-9a-f]{64}$/.test(hash)) return window.CTF_DATA.encodeInput(str) === hash;
  if (/^[0-9a-f]{8}$/.test(hash)) return window.CTF_DATA.legacyEncodeInput(str) === hash;
  return false;
};

// The hashing utilities above (normalizeInput/legacyEncodeInput/encodeInput/verifyInput)
// are the live part of this module, consumed by admin.js. The former defaultChallenges seed
// list and getChallenges/localStorage loader were dead (zero references) and have been removed.
