import { fromBinary, type DescMessage } from '@bufbuild/protobuf'
import { FlightyError, FlightyRequestError } from './error'

interface FlightyOptions {
	token: string
	buildToken: string
}

export class Flighty {
	private token: string
	private buildToken: string
	private userAgent: string

	constructor(options: FlightyOptions) {
		this.token = options.token
		this.buildToken = options.buildToken

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
		console.log(await resp.clone().text())
		const data = await resp.bytes()

		return fromBinary(schema, data)
	}
}
