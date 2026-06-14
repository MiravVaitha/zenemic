import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Populated by the `authenticate` middleware from the Supabase JWT. */
      auth?: { userId: string; email: string; name?: string };
    }
  }
}

export {};
