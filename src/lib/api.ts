/** Where the server routes live. Empty in the website; the Android app sets NEXT_PUBLIC_API_BASE to your deployed site. */
export const API = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '');
