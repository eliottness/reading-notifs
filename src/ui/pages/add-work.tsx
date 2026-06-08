import type { InferSelectModel } from 'drizzle-orm';
import { Layout } from '../layout.js';
import type { sites } from '../../db/schema.js';

export const AddWorkPage = ({
  user,
  availableSites,
  error,
}: {
  user: { email: string };
  availableSites: InferSelectModel<typeof sites>[];
  error?: string;
}) => (
  <Layout title="Add Work" user={user}>
    <h1>Add a Work</h1>
    <p class="text-muted" style="margin-bottom: 1.5rem;">
      Select the site and paste the chapter-list page URL for the manga/webtoon/novel you want to
      track.
    </p>
    {error && <div class="alert alert-error">{error}</div>}
    <form method="post" action="/works" style="max-width: 500px;">
      <label for="siteId">Site</label>
      <select id="siteId" name="siteId" required>
        <option value="">— Select a site —</option>
        {availableSites.map((site) => (
          <option value={site.id} key={site.id}>
            {site.name}
          </option>
        ))}
      </select>

      <label for="title">Title</label>
      <input
        type="text"
        id="title"
        name="title"
        placeholder="e.g. Got Dropped Into a Ghost Story"
        required
      />

      <label for="chapterListUrl">Chapter list URL</label>
      <input
        type="url"
        id="chapterListUrl"
        name="chapterListUrl"
        placeholder="https://asurascans.com/comics/..."
        required
      />

      <button type="submit">Start tracking</button>
    </form>
  </Layout>
);
