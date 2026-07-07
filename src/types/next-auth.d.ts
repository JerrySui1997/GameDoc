import type { DefaultSession } from 'next-auth';

// src/auth.config.ts's session() callback always sets session.user.id from
// token.sub — this augmentation makes that guarantee visible to the type
// checker (the built-in Session type doesn't declare `id` on `user`).
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}
