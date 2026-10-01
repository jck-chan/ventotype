// electron-builder finds no Developer ID on this machine and skips signing
// altogether — which does not leave the bundle merely unsigned. The Electron
// binary arrives carrying its own linker ad-hoc signature, and that signature
// declares sealed resources that then never get written, so the result fails
// `codesign --verify` outright and reports its identity as the generic
// "Electron" that every unsigned Electron app shares. That identity is what
// macOS records an Accessibility grant against, and this app is useless
// without one. So we always sign; only the identity varies.
//
// CSC_NAME picks the certificate. Without it we fall back to `-`, which costs
// nothing and needs no certificate, but pins TCC's designated requirement to a
// bare cdhash: every rebuild is then a new program to macOS and every grant has
// to be given again. Any real certificate — self-signed is enough — moves that
// requirement onto the certificate, and the grants survive rebuilds.
//
// Only the identity is ours: the rest of `opts` is what electron-builder
// computed — ignore rules, per-file entitlements, extra binaries — and
// @electron/osx-sign still walks the bundle inside-out, so this is the real
// signing path with a substituted identity, not a `codesign --deep`
// afterthought.
//
// `identityValidation: false` is what lets `-` through: osx-sign otherwise
// searches the keychain for a certificate by that name and finds nothing.
// A named certificate is worth validating, so the flag follows the identity.
//
// Neither path is a substitute for a Developer ID. A bundle signed by a
// self-signed root still will not clear Gatekeeper on anyone else's Mac; this
// makes local builds coherent and their permissions durable, nothing more.
const { signAsync } = require('@electron/osx-sign');

exports.default = async function signMac(opts) {
  const identity = process.env.CSC_NAME || '-';
  const adHoc = identity === '-';

  console.log(
    adHoc
      ? '  • signing ad-hoc — grants reset on every rebuild; set CSC_NAME to keep them'
      : `  • signing with ${identity}`,
  );

  await signAsync({ ...opts, identity, identityValidation: !adHoc });
};
