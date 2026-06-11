import type { FC, Child } from 'hono/jsx';

export const Layout: FC<{ title?: string; user?: { email: string }; children?: Child }> = ({
  title = 'reading-notifs',
  user,
  children,
}) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title} — reading-notifs</title>
      <script src="https://unpkg.com/htmx.org@1.9.12" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, sans-serif; background: #0f0f0f; color: #e0e0e0; line-height: 1.5; }
        .container { max-width: 800px; margin: 0 auto; padding: 1rem; }
        nav { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #222; margin-bottom: 2rem; }
        nav a { color: #e0e0e0; text-decoration: none; }
        nav .links { display: flex; gap: 1rem; }
        h1 { font-size: 1.5rem; margin-bottom: 1rem; }
        h2 { font-size: 1.2rem; margin-bottom: 0.75rem; color: #aaa; }
        .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
        input, select { width: 100%; padding: 0.5rem; background: #111; border: 1px solid #333; border-radius: 4px; color: #e0e0e0; font-size: 1rem; margin-bottom: 0.5rem; }
        button, .btn { padding: 0.5rem 1rem; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.95rem; }
        button:hover, .btn:hover { background: #4338ca; }
        .btn-danger { background: #dc2626; }
        .btn-danger:hover { background: #b91c1c; }
        .btn-sm { padding: 0.25rem 0.6rem; font-size: 0.8rem; }
        .text-muted { color: #666; font-size: 0.85rem; }
        .badge { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.75rem; background: #2a2a2a; }
        .badge-green { background: #14532d; color: #86efac; }
        .badge-red { background: #7f1d1d; color: #fca5a5; }
        .text-error { color: #fca5a5; font-size: 0.8rem; margin-top: 0.35rem; }
        form { display: flex; flex-direction: column; gap: 0.5rem; }
        label { font-size: 0.9rem; color: #aaa; }
        .row { display: flex; gap: 0.5rem; align-items: center; justify-content: space-between; }
        .alert { padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
        .alert-error { background: #450a0a; border: 1px solid #7f1d1d; color: #fca5a5; }
        .alert-success { background: #052e16; border: 1px solid #14532d; color: #86efac; }
      `}</style>
    </head>
    <body>
      <nav>
        <a href="/" style="font-weight: bold; font-size: 1.1rem;">
          📚 reading-notifs
        </a>
        {user && (
          <div class="links">
            <a href="/dashboard">My Works</a>
            <a href="/notifications">Notifications</a>
            <a href="/add-work">+ Add Work</a>
            <span class="text-muted">{user.email}</span>
          </div>
        )}
      </nav>
      <div class="container">{children}</div>
    </body>
  </html>
);
