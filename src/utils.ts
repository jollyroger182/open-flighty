import type { MessageInitShape } from '@bufbuild/protobuf'
import { FlightyError } from './error'
import type { TimestampSchema } from './gen/common_pb'

export function* filter<T>(iterable: Iterable<T>, predicate: (item: T, index: number) => unknown) {
	let i = 0
	for (const item of iterable) {
		if (predicate(item, i++)) {
			yield item
		}
	}
}

export function* map<T, U>(iterable: Iterable<T>, transform: (item: T, index: number) => U) {
	let i = 0
	for (const item of iterable) {
		yield transform(item, i)
	}
}

export function getJwtPayload(jwt: string) {
	const payloadSection = jwt.split('.')[1]
	if (!payloadSection) {
		throw new FlightyError('Token is not a valid JWT')
	}
	const padded = payloadSection + '='.repeat((4 - (payloadSection.length % 4)) % 4)
	const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
	return payload
}

export function toTimestamp(date: Date | number = Date.now()) {
	date = date instanceof Date ? date.getTime() : Number(date)

	return {
		seconds: BigInt(Math.trunc(date / 1000)),
		nanos: BigInt(date % 1000) * 1000000n,
	} satisfies MessageInitShape<typeof TimestampSchema>
}
