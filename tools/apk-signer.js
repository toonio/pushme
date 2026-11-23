/* apk-signer — print the certificate an APK is signed with.
 * Run: node tools/apk-signer.js path/to.apk
 *
 * This exists because 0.1.0 and 0.3.0 were signed by different throwaway keys and
 * nothing said so until Android refused the install, by which point the only way
 * forward was an uninstall that takes the recorded sessions with it. A signing key
 * is not something to discover on the phone.
 *
 * Modern APKs carry no v1 JAR signature, so the certificate lives in the APK Signing
 * Block: a run of length-prefixed id/value pairs sitting between the file entries and
 * the central directory.
 */
const fs = require('fs');
const crypto = require('crypto');

const MAGIC = Buffer.from('APK Sig Block 42');
const SCHEMES = { 0x7109871a: 'v2', 0xf05368c0: 'v3' };

function signingBlock(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (!buf.slice(cdOffset - 16, cdOffset).equals(MAGIC)) {
    throw new Error('no APK signing block (is this an unsigned or v1-only APK?)');
  }
  const size = Number(buf.readBigUInt64LE(cdOffset - 24));
  return buf.slice(cdOffset - 8 - size + 8, cdOffset - 24);
}

function* pairs(block) {
  let o = 0;
  while (o + 12 <= block.length) {
    const len = Number(block.readBigUInt64LE(o));
    if (len <= 0 || o + 8 + len > block.length) break;
    yield { id: block.readUInt32LE(o + 8), value: block.slice(o + 12, o + 8 + len) };
    o += 8 + len;
  }
}

/* signers -> signer -> signed data -> [digests][certificates] */
function firstCertificate(value) {
  let o = 4 + 4 + 4;                       // signers seq, first signer, signed data
  o += 4 + value.readUInt32LE(o);          // skip the digests
  o += 4;                                  // certificates sequence length
  const len = value.readUInt32LE(o);
  return value.slice(o + 4, o + 4 + len);
}

function describe(file) {
  const buf = fs.readFileSync(file);
  const out = [];
  for (const { id, value } of pairs(signingBlock(buf))) {
    if (!SCHEMES[id]) continue;
    const der = firstCertificate(value);
    const cert = new crypto.X509Certificate(der);
    out.push({
      scheme: SCHEMES[id],
      sha256: crypto.createHash('sha256').update(der).digest('hex'),
      subject: cert.subject.replace(/\n/g, ', '),
      expires: cert.validTo
    });
  }
  if (!out.length) throw new Error('signing block has no v2 or v3 signature');
  return out;
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/apk-signer.js <apk>'); process.exit(2); }
  try {
    describe(file).forEach(s => {
      console.log(`${s.scheme}  ${s.subject}  expires ${s.expires}`);
      console.log(`    sha256 ${s.sha256}`);
    });
  } catch (e) {
    console.error('could not read the signature: ' + e.message);
    process.exit(1);
  }
}

module.exports = { describe };
