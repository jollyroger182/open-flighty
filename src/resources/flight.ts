import type { Flighty } from '../flighty'

export class Flight {
	#id: string

	constructor(
		private app: Flighty,
		id: string,
	) {
		this.#id = id
	}

	get data() {
		const data = this.app.store.flights.get(this.#id)
		if (!data) {
			throw new Error(`Flight with ID ${this.#id} not found`)
		}
		return data
	}

	get id() {
		return this.#id
	}

	get user() {
		return this.app.user(this.data.userId)
	}

	get airline() {
		return this.app.airline(this.data.core!.airlineId)
	}

	get number() {
		const airline = this.airline
		const code = airline.data.iata || airline.data.icao
		return `${code}${this.data.core!.number}`
	}
}
