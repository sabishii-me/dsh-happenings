/** Bindings available to the Worker. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI?: Ai;
  ADMIN_TOKEN?: string;
  /** Comma-separated collector ids to run; empty means all. */
  COLLECTORS?: string;
}
