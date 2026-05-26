import type { Flighty } from '../flighty'

export class User {
	#id: string

	constructor(
		private app: Flighty,
		id: string,
	) {
		this.#id = id
	}

	get data() {
		const data = this.app.store.profiles.get(this.#id)
		if (!data) {
			throw new Error(`User with ID ${this.#id} not found`)
		}
		return data
	}
}
