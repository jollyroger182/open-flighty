import type { Flighty } from '../flighty'

export class Airline {
	#id: string

	constructor(
		private app: Flighty,
		id: string,
	) {
		this.#id = id
	}

	get data() {
		const data = this.app.store.airlines.get(this.#id)
		if (!data) {
			throw new Error(`Airline with ID ${this.#id} not found`)
		}
		return data
	}
}
