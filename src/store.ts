import { create, fromBinary, toBinary, type MessageInitShape } from '@bufbuild/protobuf'
import { FlightyError } from './error'
import type { Flighty } from './flighty'
import { DataStorageSchema } from './gen/custom/store_pb'
import type { Airline } from './gen/entities/airline_pb'
import type { Airport } from './gen/entities/airport_pb'
import type { City } from './gen/entities/city_pb'
import type { Connection } from './gen/entities/connection_pb'
import type { Flight } from './gen/entities/flight_pb'
import type { Model } from './gen/entities/model_pb'
import type { Profile } from './gen/entities/profile_pb'
import type { Sharing } from './gen/entities/sharing_pb'
import type { Ticket } from './gen/entities/ticket_pb'
import { type Entity } from './gen/entity_pb'
import { SyncRequestSchema, SyncResponseSchema } from './gen/services/sync_pb'

export class DataStore {
	airlines = new Map<string, Airline>()
	airports = new Map<string, Airport>()
	flights = new Map<string, Flight>()
	connections = new Map<string, Connection>()
	profiles = new Map<string, Profile>()
	tickets = new Map<string, Ticket>()
	cities = new Map<string, City>()
	models = new Map<string, Model>()
	sharing = new Map<string, Sharing>()

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
			} else if (item.city) {
				this.cities.set(item.city.id, item.city)
			} else if (item.model) {
				this.models.set(item.model.id, item.model)
			} else if (item.sharing) {
				this.sharing.set(item.sharing.id, item.sharing)
			}
			// unhandled entity types:
			// 3 = friend added
			// 10 = ???
			// 14 = session info?
			// 16 = login info?
			// 17 = ???, just a boolean and created/updated
			// 20 = ???, list of uuids in 1 and same in 2 and created/updated
			// 24 = ... current location?
		}
	}

	serialize(): Buffer {
		const storage: MessageInitShape<typeof DataStorageSchema> = {
			v1: {
				entities: [
					...toEntities(this.airlines, 'airline'),
					...toEntities(this.airports, 'airport'),
					...toEntities(this.flights, 'flight'),
					...toEntities(this.connections, 'connection'),
					...toEntities(this.profiles, 'profile'),
					...toEntities(this.tickets, 'ticket'),
					...toEntities(this.cities, 'city'),
					...toEntities(this.models, 'model'),
					...toEntities(this.sharing, 'sharing'),
				],
				syncUrl: this.syncUrl || '',
			},
		}
		return Buffer.from(toBinary(DataStorageSchema, create(DataStorageSchema, storage)))
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
