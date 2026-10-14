export type RecommendationContext = { genre?: string | null; mood?: string | null; releaseType?: string | null };
export type RecommendationListing = { id: number; name: string; slug: string; genres: string; isHymn: boolean; feeMinor: number };
const themes: Record<string, { tags: string[]; reason: string; image: string }> = {
  'dusk-till-dawn': { tags: ['romantic','mellow','chill','sad','acoustic','r&b','soul'], reason: 'Explore a late-night listening mood', image: '1' },
  'indie-hits': { tags: ['indie','alternative','folk','singer-songwriter','acoustic'], reason: 'Explore independent voices', image: '2' },
  'ungatekept-gems': { tags: ['hip hop','hip-hop','rap','experimental','electronic'], reason: 'Explore discovery-led listening', image: '4' },
  'fresh-releases': { tags: ['pop','dance','single'], reason: 'Explore a new-release showcase', image: '3' },
};
export function recommendPlaylists(listings: RecommendationListing[], context: RecommendationContext) {
  const genre = (context.genre || '').toLowerCase();
  const mood = (context.mood || '').toLowerCase();
  const type = (context.releaseType || '').toLowerCase();
  return listings.map(listing => {
    const theme = listing.isHymn ? themes[listing.slug] : undefined;
    const declaredGenres = listing.genres.toLowerCase().split(/[,/|]/).map(v => v.trim()).filter(v => v.length > 2 && v !== 'explore playlist');
    const declaredMatch = declaredGenres.some(tag => genre.includes(tag));
    const genreMatch = theme?.tags.some(tag => genre.includes(tag));
    const moodMatch = theme?.tags.some(tag => mood.includes(tag));
    const typeMatch = theme?.tags.includes(type) && Boolean(type);
    return { ...listing, image: theme?.image || null, reason: declaredMatch ? `Listed for ${context.genre}` : theme?.reason || 'Explore this curator’s playlist', score: (declaredMatch ? 6 : 0) + (genreMatch ? 3 : 0) + (moodMatch ? 4 : 0) + (typeMatch ? 1 : 0) };
  }).sort((a,b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0,2).map(({ score: _score, ...row }) => row);
}
