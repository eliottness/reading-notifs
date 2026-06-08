import type { InferSelectModel } from 'drizzle-orm';
import { Layout } from '../layout.js';
import type { notificationChannels } from '../../db/schema.js';

type Channel = InferSelectModel<typeof notificationChannels>;

export const NotificationsPage = ({
  user,
  channels,
  vapidPublicKey,
}: {
  user: { email: string };
  channels: Channel[];
  vapidPublicKey: string;
}) => {
  const emailChannel = channels.find((c) => c.type === 'email');
  const pushChannel = channels.find((c) => c.type === 'push');
  const discordChannel = channels.find((c) => c.type === 'discord');

  return (
    <Layout title="Notifications" user={user}>
      <h1>Notification Channels</h1>
      <p class="text-muted" style="margin-bottom: 1.5rem;">
        Configure how you receive chapter release notifications.
      </p>

      {/* Email */}
      <div class="card">
        <h2>Email {emailChannel?.enabled && <span class="badge badge-green">Active</span>}</h2>
        <p class="text-muted" style="margin-bottom: 0.75rem;">
          Notifications are sent to your account email: <strong>{user.email}</strong>
        </p>
        {emailChannel ? (
          <button
            class="btn btn-danger btn-sm"
            hx-delete={`/notifications/${emailChannel.id}`}
            hx-target="body"
            hx-push-url="true"
          >
            Disable email notifications
          </button>
        ) : (
          <form hx-post="/notifications" hx-target="body" hx-push-url="true">
            <input type="hidden" name="type" value="email" />
            <input type="hidden" name="address" value={user.email} />
            <button type="submit" class="btn">
              Enable email notifications
            </button>
          </form>
        )}
      </div>

      {/* Browser Push */}
      <div class="card">
        <h2>
          Browser Push {pushChannel?.enabled && <span class="badge badge-green">Active</span>}
        </h2>
        <p class="text-muted" style="margin-bottom: 0.75rem;">
          Receive push notifications in this browser, even when the tab is closed.
        </p>
        {pushChannel ? (
          <button
            class="btn btn-danger btn-sm"
            hx-delete={`/notifications/${pushChannel.id}`}
            hx-target="body"
            hx-push-url="true"
          >
            Disable push notifications
          </button>
        ) : (
          <button id="enable-push" class="btn" data-vapid-key={vapidPublicKey}>
            Enable push notifications
          </button>
        )}
      </div>

      {/* Discord */}
      <div class="card">
        <h2>
          Discord Webhook {discordChannel?.enabled && <span class="badge badge-green">Active</span>}
        </h2>
        <p class="text-muted" style="margin-bottom: 0.75rem;">
          Post notifications to a Discord channel via a webhook URL.
        </p>
        {discordChannel ? (
          <button
            class="btn btn-danger btn-sm"
            hx-delete={`/notifications/${discordChannel.id}`}
            hx-target="body"
            hx-push-url="true"
          >
            Remove Discord webhook
          </button>
        ) : (
          <form hx-post="/notifications" hx-target="body" hx-push-url="true">
            <input type="hidden" name="type" value="discord" />
            <label for="webhookUrl">Webhook URL</label>
            <input
              type="url"
              id="webhookUrl"
              name="webhookUrl"
              placeholder="https://discord.com/api/webhooks/..."
              required
            />
            <button type="submit" class="btn">
              Save Discord webhook
            </button>
          </form>
        )}
      </div>

      <script src="/push.js" />
    </Layout>
  );
};
