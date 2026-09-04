export interface ApiImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface ApiArtistRef {
  id: string | null;
  name: string;
}

export interface ApiTrack {
  type?: 'track';
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  artists: ApiArtistRef[];
  album?: { name: string; images?: ApiImage[] };
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
  is_local?: boolean;
}

export interface ApiEpisode {
  type: 'episode';
  id: string;
  uri: string;
  name: string;
}

export type ApiPlayable = ApiTrack | ApiEpisode;

export interface ApiPlaylistItem {
  added_at: string | null;
  is_local?: boolean;
  /** Current field name (since February 2026). */
  item?: ApiPlayable | null;
  /** Legacy field name, still returned by some `fields` filters. */
  track?: ApiPlayable | null;
}

export interface ApiPage<T> {
  items: T[];
  total?: number;
  limit?: number;
  offset?: number;
  next?: string | null;
}

export interface ApiPlaylistSummary {
  id: string;
  name: string;
  snapshot_id: string;
  owner: { id: string };
  collaborative?: boolean;
  images?: ApiImage[] | null;
  items?: { total: number };
  tracks?: { total: number };
  external_urls?: { spotify?: string };
}

export interface ApiTopArtist {
  id: string;
  name: string;
  images?: ApiImage[];
  external_urls?: { spotify?: string };
}

export interface ApiProfile {
  id: string;
  display_name?: string | null;
}
