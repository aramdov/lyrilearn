/**
 * Genius API client — song metadata + artwork.
 * Does NOT return full lyrics (only via scraping, which we avoid).
 * API docs: https://docs.genius.com/
 */

const GENIUS_BASE = "https://api.genius.com";
const GENIUS_TOKEN = Bun.env.GENIUS_ACCESS_TOKEN;

export interface GeniusSearchHit {
  id: number;
  title: string;
  artist: string;
  artworkUrl?: string;
  url: string; // genius.com song page URL
}

interface GeniusApiResponse {
  response: {
    hits: Array<{
      result: {
        id: number;
        title: string;
        primary_artist: { name: string };
        song_art_image_url?: string;
        url: string;
      };
    }>;
  };
}

/** Search Genius for song metadata */
export async function searchGenius(
  query: string
): Promise<GeniusSearchHit[]> {
  if (!GENIUS_TOKEN) {
    return []; // gracefully return empty if no token configured
  }

  const params = new URLSearchParams({ q: query });
  const res = await fetch(`${GENIUS_BASE}/search?${params}`, {
    headers: { Authorization: `Bearer ${GENIUS_TOKEN}` },
  });

  if (!res.ok) {
    throw new Error(`Genius search error (${res.status})`);
  }

  const data: GeniusApiResponse = await res.json();

  return data.response.hits.map((hit) => ({
    id: hit.result.id,
    title: hit.result.title,
    artist: hit.result.primary_artist.name,
    artworkUrl: hit.result.song_art_image_url,
    url: hit.result.url,
  }));
}
