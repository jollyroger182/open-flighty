import {
	create,
	fromBinary,
	toBinary,
	type DescMessage,
	type MessageInitShape,
} from '@bufbuild/protobuf'
import { FlightyError, FlightyRequestError } from './error'
import { InviteResponseSchema } from './gen/services/invite_pb'
import { SearchRequestSchema, SearchResponseSchema } from './gen/services/search_pb'
import type { SyncRequestSchema } from './gen/services/sync_pb'
import { Airline, Flight, User } from './resources'
import { DataStore } from './store'
import { filter, getJwtPayload, map } from './utils'

interface FlightyOptions {
	token: string
	buildToken: string
	store?: DataStore
}

type SearchRouteEndpoint = { airport: string; city?: never } | { airport?: never; city: string }

interface GetFlightParams {
	includeDeleted?: boolean
	includeFriends?: boolean
}

export class Flighty {
	private token: string
	private buildToken: string
	store: DataStore

	private userId: string
	private userAgent: string

	constructor(options: FlightyOptions) {
		this.token = options.token
		this.buildToken = options.buildToken
		this.store = options.store || new DataStore()

		const buildPayload = getJwtPayload(this.buildToken)
		if (!buildPayload.version || !buildPayload.build) {
			throw new FlightyError('Build token provided is missing version or build field')
		}
		this.userAgent = `Flighty ${buildPayload.version} (${buildPayload.build}) com.flightyapp.flighty`

		const payload = getJwtPayload(this.token)
		if (!payload.sub) {
			throw new FlightyError('Token provided is missing sub field')
		}
		this.userId = payload.sub
	}

	get search() {
		return {
			route: this.#searchByRoute.bind(this),
			number: this.#searchByNumber.bind(this),
		}
	}

	async #searchByRoute(params: {
		departure: SearchRouteEndpoint
		arrival: SearchRouteEndpoint
		date: string
	}) {
		const {
			date,
			departure: { airport: departureAirport, city: departureCity },
			arrival: { airport: arrivalAirport, city: arrivalCity },
		} = params
		const mode = departureCity || arrivalCity ? 'ROUTE_GUIDED' : 'ROUTE'

		const request = create(SearchRequestSchema, {
			mode,
			date,
			route: {
				departure: {
					airport: departureAirport ? { id: departureAirport } : undefined,
					city: departureCity ? { id: departureCity } : undefined,
				},
				arrival: {
					airport: arrivalAirport ? { id: arrivalAirport } : undefined,
					city: arrivalCity ? { id: arrivalCity } : undefined,
				},
			},
		})
		const body = toBinary(SearchRequestSchema, request)

		return this.protoRequest('https://api.flightyapp.com/v1/search', {
			method: 'POST',
			schema: SearchResponseSchema,
			body,
		})
	}

	async #searchByNumber(params: { date: string; airlineId: string; number: string }) {
		const { date, airlineId, number } = params

		const request = create(SearchRequestSchema, {
			mode: 'FLIGHT_NUMBER',
			date,
			number: { airlineId, number },
		})
		const body = toBinary(SearchRequestSchema, request)

		return this.protoRequest('https://api.flightyapp.com/v1/search', {
			method: 'POST',
			schema: SearchResponseSchema,
			body,
		})
	}

	sync(payload?: MessageInitShape<typeof SyncRequestSchema>) {
		return this.store.sync(this, payload)
	}

	flights(params?: GetFlightParams) {
		return map(
			filter(this.store.flights.values(), (f) => {
				if (!params?.includeDeleted && f.deletedAt) return false
				if (!params?.includeFriends && f.userId !== this.userId) return false
				return true
			}),
			(f) => new Flight(this, f.id),
		)
	}

	get friends() {
		return filter(
			map(this.store.profiles.values(), (profile) => new User(this, profile.id)),
			(user) => user.isFriend,
		)
	}

	get me() {
		return this.user(this.userId)
	}

	user(id: string) {
		return new User(this, id)
	}

	airline(id: string) {
		return new Airline(this, id)
	}

	async invite() {
		return this.protoRequest('https://api.flightyapp.com/v1/connected-friends/invite-links', {
			method: 'POST',
			schema: InviteResponseSchema,
		})
	}

	async request(url: string | URL, options: RequestInit = {}) {
		const resp = await fetch(url, {
			...options,
			headers: {
				authorization: `Bearer ${this.token}`,
				'x-flighty-build-token': this.buildToken,
				'user-agent': this.userAgent,
				'accept-language': 'en-US;q=0.9,en;q=0.8',
				'x-flightly-locale': 'en_US',
				...(options.headers ?? {}),
			},
		})
		if (!resp.ok) {
			throw new FlightyRequestError(
				url.toString(),
				resp,
				`API request to ${url} failed with status code ${resp.status}`,
			)
		}
		return resp
	}

	async protoRequest<Desc extends DescMessage>(
		url: string | URL,
		options: RequestInit & { schema: Desc },
	) {
		const schema = options.schema

		const fetchOptions = { ...options, schema: undefined }
		delete fetchOptions.schema

		const resp = await this.request(url, {
			...fetchOptions,
			headers: {
				'content-type': 'application/x-protobuf',
				accept: 'application/x-protobuf',
			},
		})
		const data = await resp.bytes()

		return fromBinary(schema, data)
	}
}
