declare module "connect-pg-simple" {
  import { RequestHandler } from "express-session";
  import { Pool } from "pg";
  interface Options {
    pool?: Pool;
    createTableIfMissing?: boolean;
  }
  function connectPgSimple(session: typeof import("express-session")): new (
    options?: Options
  ) => import("express-session").Store;
  export = connectPgSimple;
}
