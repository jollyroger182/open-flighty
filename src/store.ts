import { create, toBinary } from '@bufbuild/protobuf'
import { FlightyError } from './error'
import type { Flighty } from './flighty'
import type { Airline } from './gen/entities/airline_pb'
import type { Airport } from './gen/entities/airport_pb'
import type { Flight } from './gen/entities/flight_pb'
import type { Entity } from './gen/entity_pb'
import { SyncRequestSchema, SyncResponseSchema } from './gen/services/sync_pb'

export class DataStore {
	airlines = new Map<string, Airline>()
	airports = new Map<string, Airport>()
	flights = new Map<string, Flight>()

	private syncUrl?: string
	#syncChain: Promise<void> = Promise.resolve()

	constructor(public client: Flighty) {}

	sync() {
		return (this.#syncChain = this.#syncChain.then(() => this.#sync()))
	}

	async #sync(): Promise<void> {
		const request = create(SyncRequestSchema, {})
		const body = toBinary(SyncRequestSchema, request)

		const url = new URL(this.syncUrl ?? 'https://api.flightyapp.com/v1/sync/full')
		url.searchParams.set('fast_flight_sync', 'true')

		const resp = await this.client.protoRequest(url, {
			method: 'POST',
			schema: SyncResponseSchema,
			body,
		})

		if (!resp.pagination) {
			throw new FlightyError('No pagination returned in sync response')
		}

		this.syncUrl = resp.pagination.nextUrl
		this.#handleItems(resp.items)

		if (resp.pagination.hasMore) {
			return this.#sync()
		}
	}

	#handleItems(items: Entity[]) {
		for (const item of items) {
			if (item.airline) {
				this.airlines.set(item.airline.id, item.airline)
			} else if (item.airport) {
				this.airports.set(item.airport.id, item.airport)
			} else if (item.flight) {
				this.flights.set(item.flight.id, item.flight)
			}
		}
	}
}
