import { FlightyError } from '../error'
import type { Flighty } from '../flighty'
import type { FlightSchedule } from '../gen/entities/flight_pb'

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

	get scheduledDepartureTime() {
		try {
			return getTimeFromSchedule(this.data.core!.departure!.schedule!)
		} catch {
			throw new FlightyError('No departure time found')
		}
	}

	get scheduledArrivalTime() {
		try {
			return getTimeFromSchedule(this.data.core!.arrival!.schedule!)
		} catch {
			throw new FlightyError('No arrival time found')
		}
	}

	async delete() {
		await this.app.syncUpdate({ deleteFlight: { id: this.id } })
	}
}

function getTimeFromSchedule(schedule: FlightSchedule) {
	const timestamp =
		schedule.gateOriginal ||
		schedule.initialGateTime ||
		schedule.initialGateTime2?.value ||
		schedule.initialGateTime3?.value?.value
	if (!timestamp) {
		throw new Error('No gate time found')
	}
	return new Date(Number(timestamp.seconds) * 1000)
}
