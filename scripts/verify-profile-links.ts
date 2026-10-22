import assert from 'node:assert/strict';
import { validateArtistProfileLinks } from '../lib/artist-profile-links';
const spotifyUrl = 'https://open.spotify.com/artist/7nQW2TLxs3otw6ZgYP6cjx';
const optional = validateArtistProfileLinks({ spotifyUrl, youtubeUrl: '  ', appleUrl: null, instagramUrl: '' });
assert.deepEqual(optional.errors, {});
assert.equal(optional.links.youtubeUrl, null);
for (const youtubeUrl of ['https://www.youtube.com/@itsdrack', 'https://music.youtube.com/channel/UCexample', 'https://m.youtube.com/@itsdrack']) {
  const checked = validateArtistProfileLinks({ spotifyUrl, youtubeUrl });
  assert.deepEqual(checked.errors, {});
  assert(checked.links.youtubeUrl?.startsWith('https://www.youtube.com/'));
}
for (const youtubeUrl of ['https://youtube.com.attacker.invalid/@itsdrack', 'https://youtu.be/recording', 'https://www.youtube.com/watch?v=recording', 'javascript:alert(1)', 'https://user:pass@www.youtube.com/@itsdrack']) {
  const checked = validateArtistProfileLinks({ spotifyUrl, youtubeUrl });
  assert(checked.errors.youtubeUrl?.includes('optional'));
  assert.equal(checked.links.youtubeUrl, null);
}
const all = validateArtistProfileLinks({ spotifyUrl, appleUrl: 'https://music.apple.com/us/artist/drack/1706821844', youtubeUrl: 'https://www.youtube.com/@itsdrack?si=share', instagramUrl: 'https://www.instagram.com/drackmusic/' });
assert.deepEqual(all.errors, {});
assert.equal(all.links.youtubeUrl, 'https://www.youtube.com/@itsdrack');
assert.equal(all.links.instagramUrl, 'https://www.instagram.com/drackmusic');
assert(validateArtistProfileLinks({ spotifyUrl: 'https://open.spotify.com/album/7nQW2TLxs3otw6ZgYP6cjx' }).errors.spotifyUrl);
console.log('PASS shared artist links: optional blanks, supplied stores, canonical channel aliases, field-specific errors and rejection of video, unsafe and unrelated URLs.');
