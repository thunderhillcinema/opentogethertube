import URL from "node:url";
import axios from "axios";
import { Parser as M3u8Parser, type PlaylistItem } from "m3u8-parser";
import { OttException } from "ott-common/exceptions.js";
import type { Video } from "ott-common/models/video.js";
import { LocalFileException, UnsupportedMimeTypeException } from "../exceptions.js";
import { getLogger } from "../logger.js";
import { getMimeType, isSupportedMimeType } from "../mime.js";
import { ServiceAdapter } from "../serviceadapter.js";

const log = getLogger("hls");
const HLS_URL_REGEX = /\/*\.(m3u8?)$/;

export default class HlsVideoAdapter extends ServiceAdapter {
	get serviceId(): "hls" {
		return "hls";
	}

	get isCacheSafe(): boolean {
		return false;
	}

	isCollectionURL(link: string): boolean {
		return false;
	}

	getVideoId(link: string): string {
		return link;
	}

	canHandleURL(link: string): boolean {
		const url = URL.parse(link);
		return HLS_URL_REGEX.test((url.path ?? "/").split("?")[0]);
	}

	async fetchVideoInfo(link: string): Promise<Video> {
		const url = URL.parse(link);
		if (url.protocol === "file:") {
			throw new LocalFileException();
		}
		const fileName = (url.pathname ?? "").split("/").slice(-1)[0].trim();
		const extension = fileName.split(".").slice(-1)[0];
		const mime = getMimeType(extension) ?? "unknown";
		if (!isSupportedMimeType(mime)) {
			throw new UnsupportedMimeTypeException(mime);
		}
		return await this.handleM3u8(url);
	}

	async handleM3u8(url: URL.UrlWithStringQuery): Promise<Video> {
		const parser = new M3u8Parser();
		const resp = await axios.get(url.href);
		parser.push(resp.data);
		parser.end();
		const manifest = parser.manifest;
		// log.silly(`Got m3u8 manifest with ${JSON.stringify(manifest)}`);

		let duration = 0;
		let title: string | undefined;
		// A master playlist carries no segments and no `#EXT-X-ENDLIST`, so liveness can only be
		// read off the media playlist. Determining it from the master would report every VOD as
		// live.
		let isLive: boolean;

		// The m3u8 manifest can be a master playlist containing other playlists or a media playlist containing segments.
		// If it has playlists, we find the lowest bitrate one and extract the duration from it.
		// Otherwise, we assume it's a media playlist and calculate the duration from its segments.
		if (manifest.playlists && manifest.playlists?.length > 0) {
			const lowestBitratePlaylist = manifest.playlists.reduce(
				(acc, cur) => {
					if ((cur.attributes?.BANDWIDTH ?? 0) < (acc.attributes?.BANDWIDTH ?? 0)) {
						return cur;
					} else {
						return acc;
					}
				},
				{ attributes: { BANDWIDTH: Infinity } } as PlaylistItem,
			);
			const playlistUrl = URL.resolve(url.href, lowestBitratePlaylist.uri);
			log.silly(`new playlist path ${playlistUrl}`);
			const respStreams = await axios.get(playlistUrl);
			const parser2 = new M3u8Parser();
			parser2.push(respStreams.data);
			parser2.end();
			const manifest2 = parser2.manifest;
			// log.silly(`Got m3u8 manifest with ${JSON.stringify(manifest2)}`);
			isLive = isManifestLive(manifest2);
			duration = manifest2.segments.reduce((acc, cur) => acc + cur.duration, 0);
			title = manifest2.segments[0]?.title;
		} else {
			isLive = isManifestLive(manifest);
			duration = manifest.segments.reduce((acc, cur) => acc + cur.duration, 0);
			title = manifest.segments[0]?.title;
		}

		// For a live stream `duration` is just the length of the current sliding window, so it
		// carries no information about the stream and is not a reason to reject the playlist.
		if (duration === 0 && !isLive) {
			throw new M3u8ParseError("Duration of the selected playlist is 0");
		}

		return {
			service: "hls",
			id: url.href,
			title: title ?? url.href,
			description: `Full Link: ${url.href}`,
			mime: "application/x-mpegURL",
			length: duration,
			isLive,
			hls_url: url.href,
		};
	}
}

/**
 * Determines whether a parsed HLS *media* playlist describes a live stream.
 *
 * Per RFC 8216 §4.3.3.4, `#EXT-X-ENDLIST` indicates that no more segments will be added. A VOD
 * playlist always carries it; a live playlist does not, and only gains one when the broadcast
 * ends. Its absence is therefore the discriminator.
 *
 * Deliberately not inferred from duration: a live playlist reports the duration of its sliding
 * window, which is a plausible-looking non-zero number that changes as the window slides, so
 * duration-based detection misfires in both directions.
 *
 * Must be given a media playlist. A master playlist carries neither segments nor
 * `#EXT-X-ENDLIST`, so it would always be reported as live.
 */
export function isManifestLive(manifest: { endList?: boolean }): boolean {
	return !manifest.endList;
}

export class M3u8ParseError extends OttException {
	constructor(public readonly message: string) {
		super(message);
		this.name = "M3u8ParseError";
	}
}
