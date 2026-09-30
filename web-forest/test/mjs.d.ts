/*
 * The LAN server and the build scripts are plain `.mjs`. Left to `allowJs`,
 * TypeScript guesses their types from JavaScript defaults (an `ip = null`
 * parameter becomes `null | undefined`) and then rejects real calls. The tests
 * exercise them at runtime; the types here say only that they exist.
 */
declare module "*.mjs";
