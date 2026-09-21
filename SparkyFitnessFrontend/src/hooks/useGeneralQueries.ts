import {
  getCurrentVersion,
  getGitHubRepo,
  getLatestGithubRelease,
  getLatestAnnouncement,
} from '@/api/general';
import { generalKeys } from '@/api/keys/general';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export const useCurrentVersionQuery = () => {
  return useQuery({
    queryKey: generalKeys.appVersion,
    queryFn: getCurrentVersion,
    staleTime: Infinity,
  });
};

interface CachedStarData {
  count: number;
  fetchedAt?: number;
}

const getCacheKey = (owner: string, repo: string) =>
  `github-stars-${owner}-${repo}`;

const readCachedStars = (
  owner: string,
  repo: string
): CachedStarData | undefined => {
  const cached = localStorage.getItem(getCacheKey(owner, repo));
  if (!cached) {
    return undefined;
  }
  try {
    const parsed: CachedStarData = JSON.parse(cached);
    return typeof parsed.count === 'number' ? parsed : undefined;
  } catch {
    return undefined;
  }
};

export const useGitHubStarsQuery = (owner: string, repo: string) => {
  const cached = readCachedStars(owner, repo);

  return useQuery<number, Error>({
    queryKey: generalKeys.githubStars(owner, repo),
    queryFn: async () => {
      const data = await getGitHubRepo(owner, repo);
      localStorage.setItem(
        getCacheKey(owner, repo),
        JSON.stringify({ count: data.stargazers_count, fetchedAt: Date.now() })
      );
      return data.stargazers_count;
    },
    initialData: cached?.count,
    // Without this, React Query treats the cached value as fetched "now" on
    // every mount, so staleTime never elapses and the count freezes forever.
    // Entries written before fetchedAt existed are treated as already stale.
    initialDataUpdatedAt: cached ? (cached.fetchedAt ?? 0) : undefined,
    staleTime: 1000 * 60 * 60 * 24,
    enabled: Boolean(owner && repo),
  });
};

interface UseLatestReleaseOptions {
  enabled: boolean;
}

export const useLatestReleaseQuery = ({
  enabled = true,
}: UseLatestReleaseOptions) => {
  return useQuery({
    queryKey: generalKeys.githubVersion,
    queryFn: getLatestGithubRelease,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
  });
};

export const useInvalidateGithubVersion = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: generalKeys.githubVersion });
  };
};

export const useAnnouncementQuery = ({
  enabled = true,
}: UseLatestReleaseOptions) => {
  return useQuery({
    queryKey: generalKeys.announcement,
    queryFn: getLatestAnnouncement,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
  });
};
