/**
 * YouTube Data API v3 client — video search.
 * Each search costs 100 quota units (10,000 units/day = 100 searches/day free).
 * Cache aggressively!
 */

const YOUTUBE_API_KEY = Bun.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL =
  "https://www.googleapis.com/youtube/v3/search";

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl?: string;
}

interface YouTubeApiResponse {
  items: Array<{
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails?: { medium?: { url: string } };
    };
  }>;
}

/** Search YouTube for a music video. Returns top result. */
export async function searchYouTube(
  query: string
): Promise<YouTubeSearchResult | null> {
  if (!YOUTUBE_API_KEY) {
    return null; // gracefully return null if no API key
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    videoCategoryId: "10", // Music category
    maxResults: "1",
    key: YOUTUBE_API_KEY,
  });

  const res = await fetch(`${YOUTUBE_SEARCH_URL}?${params}`);

  if (!res.ok) {
    throw new Error(`YouTube search error (${res.status})`);
  }

  const data: YouTubeApiResponse = await res.json();

  if (!data.items?.length) return null;

  const item = data.items[0];
  return {
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url,
  };
}
