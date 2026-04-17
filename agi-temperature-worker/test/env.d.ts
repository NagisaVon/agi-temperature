// Teach `cloudflare:test`'s ProvidedEnv about our Worker bindings
// so `import { env } from 'cloudflare:test'` is typed against Env.
declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {}
}
