import { create, fromBinary, toBinary, type DescMessage } from '@bufbuild/protobuf'
import { FlightyError, FlightyRequestError } from './error'
import { SearchRequestSchema, SearchResponseSchema } from './gen/services/search_pb'
import { SyncRequestSchema, SyncResponseSchema } from './gen/services/sync_pb'
import { DataStore } from './store'
import { filter } from './utils'

interface FlightyOptions {
	token: string
	buildToken: string
	store?: DataStore
}

type SearchRouteEndpoint = { airport: string; city?: never } | { airport?: never; city: string }

export class Flighty {
	private token: string
	private buildToken: string
	store: DataStore

	private userAgent: string

	constructor(options: FlightyOptions) {
		this.token = options.token
		this.buildToken = options.buildToken
		this.store = options.store || new DataStore()

		const payloadSection = this.buildToken.split('.')[1]
		if (!payloadSection) {
			throw new FlightyError('Build token provided is not a valid JWT')
		}
		const padded = payloadSection + '='.repeat((4 - (payloadSection.length % 4)) % 4)
		const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
		if (!payload.version || !payload.build) {
			throw new FlightyError('Build token provided is missing version or build field')
		}
		this.userAgent = `Flighty ${payload.version} (${payload.build}) com.flightyapp.flighty`
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

	sync() {
		return this.store.sync(this)
	}

	get flights() {
		return filter(this.store.flights.values(), (f) => f.isMyFlight)
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
		console.log(resp.status)
		const data = await resp.bytes()

		return fromBinary(schema, data)
	}
}
