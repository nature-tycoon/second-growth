// Which release is running, for the analytics: the deploy workflows (pages.yml, itch.yml) rewrite
// 'dev' to the commit's date and short hash, for example '2026-10-24-fa9fd4b', so every release
// reads differently in PostHog without anyone remembering to bump it. Local copies stay 'dev'.
export const RELEASE = 'dev';
