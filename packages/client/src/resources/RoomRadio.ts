import { Resource } from './Resource.js';

/** `'playing'` (On Air) or `'stopped'`. */
export type RoomRadioStatus = 'playing' | 'stopped' | (string & {});

/**
 * A room's radio: IMVU's `web_radio` media player, the stream every visitor's client
 * plays while it's On Air. Get it with {@link Room.radio}.
 *
 * Reading it needs no rights. Changing it ({@link setStation}, {@link start},
 * {@link stop}) needs the room's owner or one of its moderators, as in IMVU's own
 * client. Each visitor's client connects to the stream itself, and IMVU's player
 * (mpg123) plays MP3 only.
 *
 * To follow changes others make (a moderator switching the station, turning it off),
 * watch it and refresh on `invalidate`, as with any other resource.
 */
export class RoomRadio extends Resource<RoomRadioRelations> {
	/** The player's kind: `web_radio` for a room's radio. */
	public provider = '';
	/** The stream's URL, empty when none was set. */
	public stationUrl = '';
	/** The name shown with the station, often empty. */
	public stationName = '';
	public status: RoomRadioStatus = 'stopped';

	/** True while the radio is On Air. */
	public get playing(): boolean {
		return this.status === 'playing';
	}

	public _patch(data: Record<string, any>): void {
		super._patch(data);
		if ('type' in data) this.provider = data.type?.provider ?? '';
		const state = data.current_state;
		if (state && typeof state === 'object') {
			if ('station_url' in state) this.stationUrl = state.station_url ?? '';
			if ('station_name' in state) this.stationName = state.station_name ?? '';
			if ('status' in state) this.status = state.status ?? 'stopped';
		}
	}

	/**
	 * Point the radio at another stream. It stays On Air or off as it was: call
	 * {@link start} to play it.
	 */
	public setStation(url: string, name = ''): Promise<this> {
		return this.#act({ action: 'update_radio', station_url: url, station_name: name });
	}

	/** Turn the radio on (On Air): every visitor's client starts playing the station. */
	public start(): Promise<this> {
		return this.#act({ action: 'start_radio' });
	}

	/** Turn the radio off. */
	public stop(): Promise<this> {
		return this.#act({ action: 'stop_radio' });
	}

	async #act(data: Record<string, string>): Promise<this> {
		if (!this.url) throw new Error('Cannot change a RoomRadio that has no canonical URL');
		await this.client.request(this.url, { method: 'POST', data });
		return this.refresh();
	}
}

export interface RoomRadioRelations {
	targets: string;
}
