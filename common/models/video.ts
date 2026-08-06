import type { ALL_VIDEO_SERVICES } from "../constants.js";

export type VideoService = (typeof ALL_VIDEO_SERVICES)[number];

export interface VideoId {
	service: VideoService;
	id: string;
}

export interface VideoMetadata {
	title: string;
	description: string;
	length: number;
	thumbnail: string;
	mime: string;
	highlight?: true;
	/**
	 * True when the source is a live stream with no fixed end, detected by the absence of an
	 * `#EXT-X-ENDLIST` tag in its HLS manifest (RFC 8216 §4.3.3.4). Live sources must not be
	 * auto-advanced when the playback position passes `length`, because `length` for a live
	 * manifest is the sliding window's duration, not the length of the stream.
	 */
	isLive?: boolean;
	hls_url?: string;
	dash_url?: string;
	src_url?: string;
	subtitleUrl?: string;
}

export type Video = VideoId & Partial<VideoMetadata>;
export interface QueueItemExtras {
	startAt?: number;
	endAt?: number;
	subtitleUrl?: string;
}

export type VideoAdd = VideoId & QueueItemExtras;
export interface QueueItem extends Video, QueueItemExtras {}
