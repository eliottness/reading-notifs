import { Layout } from '../layout.js';

export const LoginFormPartial = ({ message, isError }: { message?: string; isError?: boolean }) => (
  <form
    id="login-form"
    hx-post="/auth/send-magic-link"
    hx-target="#login-form"
    hx-swap="outerHTML"
    style="max-width: 400px;"
  >
    {message && (
      <div
        class={`alert ${isError ? 'alert-error' : 'alert-success'}`}
        style="margin-bottom: 1rem;"
      >
        {message}
      </div>
    )}
    <label for="email">Email address</label>
    <input type="email" id="email" name="email" placeholder="you@example.com" required />
    <button type="submit">Send login link</button>
  </form>
);

export const LoginPage = ({ message, isError }: { message?: string; isError?: boolean }) => (
  <Layout title="Login">
    <h1>Sign in</h1>
    <p class="text-muted" style="margin-bottom: 1.5rem;">
      Enter your email to receive a magic login link.
    </p>
    <LoginFormPartial message={message} isError={isError} />
  </Layout>
);
