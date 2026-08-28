import { unstable_cache } from "next/cache";
import { listAllBeats, listProducerProfiles, listRecentGoogleAvatarUrls } from "@/lib/db";

const HOME_BEAT_LIMIT = 8;
const HOME_PRODUCER_LIMIT = 12;

export const getPublicHomePreview = unstable_cache(
  async () => {
    const [beats, producerProfiles, googleAvatarUrls] = await Promise.all([
      listAllBeats(HOME_BEAT_LIMIT),
      listProducerProfiles(HOME_PRODUCER_LIMIT),
      listRecentGoogleAvatarUrls(4)
    ]);
    return { beats, producerProfiles, googleAvatarUrls };
  },
  ["public-home-preview-v1"],
  { revalidate: 300, tags: ["public-home-preview"] }
);
