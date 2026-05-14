export class FlightyError extends Error {}

export class FlightyRequestError extends Error {
	status: number

	constructor(
		public url: string,
		public response: Response,
		message?: string,
		options?: ErrorOptions,
	) {
		super(message, options)
		this.status = response.status
	}
}
