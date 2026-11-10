// See https://svelte.dev/docs/kit/types#app.d.ts for the App namespace.

declare global {
  interface ImportMetaEnv {
    /** Set by `define` in vite.config.ts: the short commit hash (empty outside git). */
    readonly BUILD_COMMIT: string;
    /** Set by `define` in vite.config.ts: the build date, YYYY-MM-DD. */
    readonly BUILD_DATE: string;
  }
}

export {};
