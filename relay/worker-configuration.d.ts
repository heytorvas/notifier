declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CREATE_LIMITER: RateLimit;
    SEND_LIMITER: RateLimit;
    FIREBASE_PROJECT_ID: string;
    FIREBASE_CLIENT_EMAIL: string;
    FIREBASE_PRIVATE_KEY: string;
    ANDROID_PACKAGE_NAME: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}
