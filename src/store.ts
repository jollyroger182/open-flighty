import { create, toBinary } from '@bufbuild/protobuf'
import { FlightyError } from './error'
import type { Flighty } from './flighty'
import type { Airline } from './gen/entities/airline_pb'
import type { Airport } from './gen/entities/airport_pb'
import type { Connection } from './gen/entities/connection_pb'
import type { Flight } from './gen/entities/flight_pb'
import type { Profile } from './gen/entities/profile_pb'
import type { Entity } from './gen/entity_pb'
import { SyncRequestSchema, SyncResponseSchema } from './gen/services/sync_pb'

interface DataStoreDataV1 {
	version: 1
	airlines: Airline[]
	airports: Airport[]
	flights: Flight[]
	connections: Connection[]
	profiles: Profile[]
	syncUrl?: string
}

export type DataStoreData = DataStoreDataV1

export class DataStore {
	airlines = new Map<string, Airline>()
	airports = new Map<string, Airport>()
	flights = new Map<string, Flight>()
	connections = new Map<string, Connection>()
	profiles = new Map<string, Profile>()

	private syncUrl?: string
	#syncChain: Promise<void> = Promise.resolve()

	constructor() {}

	sync(client: Flighty) {
		return (this.#syncChain = this.#syncChain.then(() => this.#sync(client)))
	}

	async #sync(client: Flighty): Promise<void> {
		const request = create(SyncRequestSchema, {})
		const body = toBinary(SyncRequestSchema, request)

		const url = new URL(this.syncUrl ?? 'https://api.flightyapp.com/v1/sync/full')
		url.searchParams.set('fast_flight_sync', 'true')

		const resp = await client.protoRequest(url, {
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
			return this.#sync(client)
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
			} else if (item.connection) {
				this.connections.set(item.connection.id, item.connection)
			} else if (item.profile) {
				this.profiles.set(item.profile.id, item.profile)
			}
		}
	}

	serialize(): DataStoreDataV1 {
		return {
			version: 1,
			airlines: Array.from(this.airlines.values()),
			airports: Array.from(this.airports.values()),
			flights: Array.from(this.flights.values()),
			connections: Array.from(this.connections.values()),
			profiles: Array.from(this.profiles.values()),
			syncUrl: this.syncUrl,
		}
	}

	static deserialize(data: DataStoreData) {
		if (data.version === 1) {
			const store = new DataStore()
			data.airlines.forEach((x) => store.airlines.set(x.id, x))
			data.airports.forEach((x) => store.airports.set(x.id, x))
			data.flights.forEach((x) => store.flights.set(x.id, x))
			data.connections.forEach((x) => store.connections.set(x.id, x))
			data.profiles.forEach((x) => store.profiles.set(x.id, x))
			store.syncUrl = data.syncUrl
			return store
		}
		throw new FlightyError(`Unknown datastore serialization version ${data.version}`)
	}
}
