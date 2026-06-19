import type { Flighty } from '../flighty'

export class User {
	#id: string

	constructor(
		private app: Flighty,
		id: string,
	) {
		this.#id = id
	}

	get data() {
		const data = this.app.store.profiles.get(this.#id)
		if (!data) {
			throw new Error(`User with ID ${this.#id} not found`)
		}
		return data
	}

	get id() {
		return this.#id
	}

	get isMe() {
		return this.id === this.app.me.id
	}

	get isSharingWithMe() {
		const sharing = this.app.store.sharing.get(`${this.id}.${this.app.me.id}`)
		return sharing && !sharing.isPaused && !sharing.deletedAt
	}

	get isSharing() {
		const sharing = this.app.store.sharing.get(`${this.app.me.id}.${this.id}`)
		return sharing && !sharing.isPaused && !sharing.deletedAt
	}

	get isFriend() {
		const sharing = this.app.store.sharing.get(`${this.app.me.id}.${this.id}`)
		return sharing && !sharing.deletedAt
	}

	async setSharing(isSharing: boolean = true) {
		await this.app.syncUpdate({
			updateSharing: { userId: this.#id, isPaused: !isSharing },
		})
	}
}
