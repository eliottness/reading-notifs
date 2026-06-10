import type { InferSelectModel } from 'drizzle-orm';
import { Layout } from '../layout.js';
import type { works } from '../../db/schema.js';

type WorkWithSite = InferSelectModel<typeof works> & { siteName: string };

export const DashboardPage = ({
  user,
  isAdmin = false,
  trackedWorks,
}: {
  user: { email: string };
  isAdmin?: boolean;
  trackedWorks: WorkWithSite[];
}) => (
  <Layout title="My Works" user={user}>
    <div class="row" style="margin-bottom: 1.5rem;">
      <h1>My Works</h1>
      <a href="/add-work" class="btn">
        + Add Work
      </a>
    </div>

    {trackedWorks.length === 0 ? (
      <div class="card">
        <p class="text-muted">
          No works tracked yet. <a href="/add-work">Add your first one.</a>
        </p>
      </div>
    ) : (
      <div id="work-list">
        {trackedWorks.map((work) => (
          <div class="card" key={work.id}>
            <div class="row">
              <div>
                <strong>{work.title}</strong>
                <div class="text-muted">
                  <span class="badge">{work.siteName}</span>{' '}
                  <span>
                    {work.currentChapterCount > 0
                      ? `${work.currentChapterCount} chapters`
                      : 'Checking…'}
                  </span>
                  {work.lastCheckedAt && (
                    <span> · Last checked {new Date(work.lastCheckedAt).toLocaleString()}</span>
                  )}
                </div>
              </div>
              <div class="row" style="gap: 0.5rem; flex: 0 0 auto;">
                {isAdmin && (
                  // Admin-only manual poll. The endpoint returns JSON (see /admin/refresh/:workId),
                  // so swap nothing; on success it sends `HX-Refresh: true`, which makes htmx reload
                  // the page to surface the new chapter count and lastCheckedAt rather than dumping
                  // the JSON body into the DOM.
                  <button
                    class="btn btn-sm"
                    hx-post={`/admin/refresh/${work.id}`}
                    hx-swap="none"
                  >
                    Refresh
                  </button>
                )}
                <button
                  class="btn btn-danger btn-sm"
                  hx-delete={`/works/${work.id}`}
                  hx-target="closest .card"
                  hx-swap="delete"
                  hx-confirm="Remove this work?"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </Layout>
);
