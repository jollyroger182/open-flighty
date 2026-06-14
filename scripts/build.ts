import { rmSync } from 'fs'

rmSync('./dist', { recursive: true, force: true })

await Promise.all([
	Bun.$`bun check`,
	Bun.build({
		entrypoints: ['./index.ts'],
		outdir: './dist/esm',
		format: 'esm',
		splitting: true,
	}),
	Bun.build({
		entrypoints: ['./index.ts'],
		outdir: './dist/cjs',
		format: 'cjs',
		splitting: true,
	}),
])
