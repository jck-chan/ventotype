// There is no Developer ID on this machine, so electron-builder finds no identity
// and skips signing altogether — which does not leave the bundle merely unsigned.
// The Electron binary arrives carrying its own linker ad-hoc signature, and that
// signature declares sealed resources that then never get written, so the result
// fails `codesign --verify` outright and reports its identity as the generic
// "Electron" that every unsigned Electron app shares. That identity is what macOS
// records an Accessibility grant against, and this app is useless without one.
//
// Signing ad-hoc costs nothing and needs no certificate. Only the identity is ours:
// the rest of `opts` is what electron-builder computed — ignore rules, per-file
// entitlements, extra binaries — and @electron/osx-sign still walks the bundle
// inside-out, so this is the real signing path with `-` in place of a certificate,
// not a `codesign --deep` afterthought.
//
// `identityValidation: false` is what lets `-` through: osx-sign otherwise searches
// the keychain for a certificate by that name and finds nothing. electron-builder
// already sets it, and it is repeated here so the hook stands on its own.
//
// This is not a substitute for a Developer ID. An ad-hoc bundle still will not clear
// Gatekeeper on anyone else's Mac; it makes local builds coherent, nothing more.
const { signAsync } = require('@electron/osx-sign');

exports.default = async function signAdHoc(opts) {
  await signAsync({ ...opts, identity: '-', identityValidation: false });
};
