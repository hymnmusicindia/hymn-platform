// One release command increments the Android version, builds, then publishes matching download metadata.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'android/team-release.json');
const directory = path.join(root, 'public/downloads/hymn-team');
const manifest = path.join(directory, 'release.json');
const stageOnly = process.argv.includes('--stage-only');
const keepVersion = process.argv.includes('--keep-version');

function findGradle(directory, depth = 0) {
  if (!fs.existsSync(directory) || depth > 5) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === (process.platform === 'win32' ? 'gradle.bat' : 'gradle')) return file;
    if (entry.isDirectory()) { const found = findGradle(file, depth + 1); if (found) return found; }
  }
  return null;
}

function main() {
  let version = JSON.parse(fs.readFileSync(source, 'utf8'));
  if (!stageOnly && !keepVersion) {
    const parts = version.versionName.split('.').map(Number); parts[2]++;
    version = { versionCode: version.versionCode + 1, versionName: parts.join('.') };
  }
  const previous = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : null;
  if (previous && version.versionCode <= previous.versionCode) throw Error('A release must increase versionCode. Run without --keep-version to build the next release.');
  if (!stageOnly) {
    const gradle = process.env.TEAM_APP_GRADLE || findGradle(path.join(os.homedir(), '.gradle/wrapper/dists')) || 'gradle';
    const env = { ...process.env };
    const studioJava = 'C:/Program Files/Android/Android Studio/jbr';
    if (!env.JAVA_HOME && fs.existsSync(studioJava)) env.JAVA_HOME = studioJava;
    const sdk = path.join(os.homedir(), 'AppData/Local/Android/Sdk');
    if (!env.ANDROID_HOME && fs.existsSync(sdk)) env.ANDROID_HOME = sdk;
    if (!env.GOOGLE_CLIENT_ID) {
      const file = path.join(root, '.env.hostinger');
      if (fs.existsSync(file)) env.GOOGLE_CLIENT_ID = require('dotenv').parse(fs.readFileSync(file)).GOOGLE_CLIENT_ID;
    }
    if (!env.GOOGLE_CLIENT_ID) throw Error('Set GOOGLE_CLIENT_ID to the existing HYMN Web OAuth client ID before building.');
    const old = fs.readFileSync(source);
    fs.writeFileSync(source, JSON.stringify(version, null, 2) + '\n');
    try {
      if (process.platform === 'win32' && gradle.endsWith('.bat')) {
        const lib = path.resolve(path.dirname(gradle), '../lib');
        const launcher = fs.readdirSync(lib).find(name => /^gradle-gradle-cli-main-.*\.jar$/.test(name));
        if (!launcher || !env.JAVA_HOME) throw Error('Set JAVA_HOME and use a Gradle 8.14+ installation.');
        execFileSync(path.join(env.JAVA_HOME, 'bin/java.exe'), ['-jar', path.join(lib, launcher), '--no-daemon', 'assembleDebug', 'testDebugUnitTest'], { cwd: path.join(root, 'android'), env, stdio: 'inherit', windowsHide: true });
      } else execFileSync(gradle, ['--no-daemon', 'assembleDebug', 'testDebugUnitTest'], { cwd: path.join(root, 'android'), env, stdio: 'inherit', windowsHide: true });
    } catch (error) { fs.writeFileSync(source, old); throw error; }
  }
  const apkDirectory = path.join(root, 'android/app/build/outputs/apk/debug');
  const metadata = JSON.parse(fs.readFileSync(path.join(apkDirectory, 'output-metadata.json'), 'utf8'));
  const artifact = metadata.elements?.[0];
  if (metadata.applicationId !== 'fun.hymnmusic.team' || artifact?.versionCode !== version.versionCode || artifact?.versionName !== version.versionName) throw Error('APK metadata does not match the release version. Rebuild before publishing.');
  const bytes = fs.readFileSync(path.join(apkDirectory, artifact.outputFile));
  if (bytes.length < 100000 || bytes.readUInt32LE(0) !== 0x04034b50) throw Error('Expected a built Android APK.');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const file = `hymn-team-${version.versionName}-${sha256.slice(0, 12)}.apk`;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, file), bytes);
  const release = { version: version.versionName, versionCode: version.versionCode, file, size: bytes.length, sha256, publishedAt: new Date().toISOString() };
  fs.writeFileSync(manifest + '.tmp', JSON.stringify(release, null, 2) + '\n');
  fs.renameSync(manifest + '.tmp', manifest);
  console.log(`Prepared HYMN Team ${release.version} (Android versionCode ${release.versionCode}), ${(bytes.length / 1048576).toFixed(1)} MB. Deploy the application and public/downloads/hymn-team together.`);
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
