declare global {
  interface Window {
    __SEE_WIDGET__?: {
      contentType?: string;
      tmdbID?: string;
    };
  }
}

export {};
