import { URL } from "node:url";
import axios, { type AxiosResponse } from "axios";
import { ServiceAdapter } from "../serviceadapter.js";
import { InvalidVideoIdException } from "../exceptions.js";
import type { Video, VideoMetadata } from "ott-common/models/video.js";
import type { VideoServiceCredentials } from "ott-common/models/messages.js";
import { getLogger } from "../logger.js";

const log = getLogger("vimeo");
const VIMEO_VIDEO_PATH_REGEX = /^\/\d+$/;
const VIMEO_NUMERIC_ID_REGEX = /^\d+$/;

interface VimeoApiVideo {
	title: string;
	description: string;
	thumbnail_url: string;
	duration: number;
}

/** Shape of `GET https://api.vimeo.com/videos/{id}`, which names its fields differently to oEmbed. */
interface VimeoAuthedApiVideo {
	name: string;
	description: string | null;
	duration: number;
	pictures?: {
		sizes?: { width: number; link: string }[];
	};
}

export default class VimeoAdapter extends ServiceAdapter {
	api = axios.create({
		baseURL: "https://vimeo.com/api/oembed.json",
	});

	/**
	 * The authenticated API. Unlike oEmbed it can see videos the owner has restricted
	 * (unlisted, password-gated, domain-locked), and it bills the token owner's rate
	 * limit rather than the shared unauthenticated pool.
	 */
	authedApi = axios.create({
		baseURL: "https://api.vimeo.com",
	});

	get serviceId(): "vimeo" {
		return "vimeo";
	}

	/**
	 * Never cache. An authenticated fetch can return a video that is only visible to the
	 * credential owner, so a cached copy would leak it to everyone else asking for the
	 * same id. Already false before credentials existed; now load-bearing for privacy.
	 */
	get isCacheSafe(): boolean {
		return false;
	}

	canHandleURL(link: string): boolean {
		const url = new URL(link);
		const isVimeoHost = url.hostname === "vimeo.com" || url.hostname.endsWith(".vimeo.com");
		return isVimeoHost && VIMEO_VIDEO_PATH_REGEX.test(url.pathname);
	}

	isCollectionURL(link: string): boolean {
		return false;
	}

	getVideoId(link: string): string {
		const url = new URL(link);
		return url.pathname.split("/").slice(-1)[0].trim();
	}

	async fetchVideoInfo(
		videoId: string,
		properties?: (keyof VideoMetadata)[],
		credentials?: VideoServiceCredentials,
	): Promise<Video> {
		if (!VIMEO_NUMERIC_ID_REGEX.test(videoId)) {
			throw new InvalidVideoIdException(this.serviceId, videoId);
		}

		if (credentials?.vimeo_access_token) {
			return await this.fetchAuthedVideoInfo(videoId, credentials.vimeo_access_token);
		}

		return await this.fetchOembedVideoInfo(videoId);
	}

	private async fetchOembedVideoInfo(videoId: string): Promise<Video> {
		try {
			const result: AxiosResponse<VimeoApiVideo> = await this.api.get("", {
				params: {
					url: `https://vimeo.com/${videoId}`,
				},
			});

			const video: Video = {
				service: this.serviceId,
				id: videoId,
				title: result.data.title,
				description: result.data.description,
				thumbnail: result.data.thumbnail_url,
				length: result.data.duration,
			};

			return video;
		} catch (err) {
			if (err.response && err.response.status === 403) {
				log.error("Failed to get video info: Embedding for this video is disabled!");
			}
			throw err;
		}
	}

	private async fetchAuthedVideoInfo(videoId: string, accessToken: string): Promise<Video> {
		try {
			const result: AxiosResponse<VimeoAuthedApiVideo> = await this.authedApi.get(
				`/videos/${videoId}`,
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
					params: {
						fields: "name,description,duration,pictures.sizes",
					},
				},
			);

			const video: Video = {
				service: this.serviceId,
				id: videoId,
				title: result.data.name,
				description: result.data.description ?? "",
				thumbnail: largestThumbnail(result.data),
				length: result.data.duration,
			};

			return video;
		} catch (err) {
			// Fall back rather than fail: a token that is expired, revoked, or simply scoped
			// to a different account should not make a public video unplayable.
			if (err.response && (err.response.status === 401 || err.response.status === 403)) {
				log.warn(
					`Vimeo credentials rejected (${err.response.status}) for video ${videoId}, falling back to unauthenticated lookup`,
				);
				return await this.fetchOembedVideoInfo(videoId);
			}
			throw err;
		}
	}
}

/** Vimeo returns thumbnails smallest-first, but the order is not contractual — pick by width. */
function largestThumbnail(data: VimeoAuthedApiVideo): string {
	const sizes = data.pictures?.sizes;
	if (!sizes || sizes.length === 0) {
		return "";
	}
	return sizes.reduce((best, size) => (size.width > best.width ? size : best)).link;
}
