// Who is a demo person (npm run demo:seed): an email at this domain. Kept apart from the seed so pages can import it.
export const DEMO_EMAIL_DOMAIN = "demo.factorylens.test";
export const isDemoEmail = (email: string) => email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
