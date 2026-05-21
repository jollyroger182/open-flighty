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
