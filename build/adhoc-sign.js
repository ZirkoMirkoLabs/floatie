// electron-builder afterPack hook, macOS only. electron-builder 25 cannot ad-hoc sign ("identity": "-" is looked up as a
// keychain certificate), and with "identity": null it leaves Electron's own linker signature, which does not cover the
// renamed bundle: `codesign --verify` fails with "code has no resources but signature indicates they must be present".
// An ad-hoc signature over the whole bundle fixes that and gives the app its own identifier (com.floatie.app), so a copy
// that picks up a quarantine flag gets Gatekeeper's "Open Anyway" instead of "damaged". It is not a Developer ID
// signature and the app is not notarized.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
