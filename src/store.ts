import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { FlightyError } from './error'
import type { Flighty } from './flighty'
import { DataStorageSchema, type DataStorage } from './gen/custom/store_pb'
import type { Airline } from './gen/entities/airline_pb'
import type { Airport } from './gen/entities/airport_pb'
import type { Connection } from './gen/entities/connection_pb'
import type { Flight } from './gen/entities/flight_pb'
import type { Profile } from './gen/entities/profile_pb'
import type { Ticket } from './gen/entities/ticket_pb'
import type { Entity } from './gen/entity_pb'
import { SyncRequestSchema, SyncResponseSchema } from './gen/services/sync_pb'

export class DataStore {
	airlines = new Map<string, Airline>()
	airports = new Map<string, Airport>()
	flights = new Map<string, Flight>()
	connections = new Map<string, Connection>()
	profiles = new Map<string, Profile>()
	tickets = new Map<string, Ticket>()

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
			} else if (item.ticket) {
				this.tickets.set(item.ticket.id, item.ticket)
			}
		}
	}

	serialize(): Buffer {
		const storage: DataStorage = {
			$typeName: 'DataStorage',
			v1: {
				$typeName: 'DataStorageV1',
				entities: [
					...toEntities(this.airlines, 'airline'),
					...toEntities(this.airports, 'airport'),
					...toEntities(this.flights, 'flight'),
					...toEntities(this.connections, 'connection'),
					...toEntities(this.profiles, 'profile'),
					...toEntities(this.tickets, 'ticket'),
				],
				syncUrl: this.syncUrl || '',
			},
		}
		return Buffer.from(toBinary(DataStorageSchema, storage))
	}

	static deserialize(data: Buffer | ArrayBuffer) {
		const storage = fromBinary(DataStorageSchema, new Uint8Array(data))
		if (storage.v1) {
			const store = new DataStore()
			store.#handleItems(storage.v1.entities)
			store.syncUrl = storage.v1.syncUrl || undefined
			return store
		}
		throw new FlightyError(`Unknown datastore serialization version`)
	}
}

function toEntities<K extends keyof Omit<Entity, '$typeName' | '$unknown'>>(
	map: Map<unknown, Entity[K]>,
	key: K,
) {
	return Array.from(map.values(), (x): Entity => ({ $typeName: 'Entity', [key]: x }))
}
