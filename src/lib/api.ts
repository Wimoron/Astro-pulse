/** Where the server routes live. Empty in the website; the Android app sets NEXT_PUBLIC_API_BASE to your deployed site. */
export const API = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '');

/** True in the Android build when no server address was given: skip live lookups and use the built-in sample quietly. */
export const NO_SERVER = process.env.NEXT_PUBLIC_STATIC === '1' && API === '';
