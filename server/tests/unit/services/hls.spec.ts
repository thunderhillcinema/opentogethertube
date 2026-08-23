/**
 * Unit tests for HlsVideoAdapter's live-stream detection.
 *
 * These cover detection and the shape of the resulting Video only. Actual live playback cannot
 * be exercised here — it needs a real encoder, the ingest relay, and a browser.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import axios, { AxiosError } from "axios";
import URL from "node:url";
import HlsVideoAdapter, { isManifestLive, M3u8ParseError } from "../../../services/hls.js";
import { VideoNotFoundException } from "../../../exceptions.js";

vi.mock("axios");

/** A media playlist that has finished: carries #EXT-X-ENDLIST. */
const VOD_MEDIA_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:4.000,
seg0.ts
#EXTINF:4.000,
seg1.ts
#EXT-X-ENDLIST
`;

/** A live media playlist: same shape, no #EXT-X-ENDLIST. */
const LIVE_MEDIA_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:127
#EXTINF:4.000,
seg127.ts
#EXTINF:4.000,
seg128.ts
`;

/** A master playlist. Carries no segments and never an #EXT-X-ENDLIST. */
const MASTER_PLAYLIST = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
media.m3u8
`;

describe("isManifestLive", () => {
	it("reports a playlist with #EXT-X-ENDLIST as not live", () => {
		expect(isManifestLive({ endList: true })).toBe(false);
	});

	it("reports a playlist without #EXT-X-ENDLIST as live", () => {
		expect(isManifestLive({ endList: false })).toBe(true);
	});

	it("treats an absent endList as live", () => {
		// m3u8-parser omits the property entirely when the tag is not present.
		expect(isManifestLive({})).toBe(true);
	});
});

describe("HlsVideoAdapter live detection", () => {
	let adapter: HlsVideoAdapter;
	let mockAxiosGet;

	beforeEach(() => {
		adapter = new HlsVideoAdapter();
		vi.resetAllMocks();
		mockAxiosGet = axios.get;
	});

	it("marks a media playlist without #EXT-X-ENDLIST as live", async () => {
		mockAxiosGet.mockResolvedValue({ data: LIVE_MEDIA_PLAYLIST });

		const video = await adapter.handleM3u8(URL.parse("https://example.com/live/a/index.m3u8"));

		expect(video.isLive).toBe(true);
	});

	it("marks a media playlist with #EXT-X-ENDLIST as not live", async () => {
		mockAxiosGet.mockResolvedValue({ data: VOD_MEDIA_PLAYLIST });

		const video = await adapter.handleM3u8(URL.parse("https://example.com/vod/index.m3u8"));

		expect(video.isLive).toBe(false);
		expect(video.length).toBe(8);
	});

	it("reads liveness from the media playlist, not the master playlist", async () => {
		// The master carries no #EXT-X-ENDLIST of its own. Reading liveness from it would report
		// this finished VOD as live.
		mockAxiosGet
			.mockResolvedValueOnce({ data: MASTER_PLAYLIST })
			.mockResolvedValueOnce({ data: VOD_MEDIA_PLAYLIST });

		const video = await adapter.handleM3u8(URL.parse("https://example.com/vod/index.m3u8"));

		expect(mockAxiosGet).toHaveBeenCalledTimes(2);
		expect(video.isLive).toBe(false);
	});

	it("marks a live stream behind a master playlist as live", async () => {
		mockAxiosGet
			.mockResolvedValueOnce({ data: MASTER_PLAYLIST })
			.mockResolvedValueOnce({ data: LIVE_MEDIA_PLAYLIST });

		const video = await adapter.handleM3u8(URL.parse("https://example.com/live/a/index.m3u8"));

		expect(video.isLive).toBe(true);
	});

	it("does not reject a live playlist whose window sums to zero duration", async () => {
		const emptyLive = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n";
		mockAxiosGet.mockResolvedValue({ data: emptyLive });

		const video = await adapter.handleM3u8(URL.parse("https://example.com/live/a/index.m3u8"));

		expect(video.isLive).toBe(true);
	});

	it("still rejects a non-live playlist with zero duration", async () => {
		const emptyVod = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ENDLIST\n";
		mockAxiosGet.mockResolvedValue({ data: emptyVod });

		await expect(
			adapter.handleM3u8(URL.parse("https://example.com/vod/index.m3u8")),
		).rejects.toThrow(M3u8ParseError);
	});

	it("reports the sliding window duration as length for a live stream", async () => {
		// Recorded to document the behaviour the auto-advance fix has to tolerate: `length` is a
		// plausible-looking small number, which is exactly why it must not drive auto-advance.
		mockAxiosGet.mockResolvedValue({ data: LIVE_MEDIA_PLAYLIST });

		const video = await adapter.handleM3u8(URL.parse("https://example.com/live/a/index.m3u8"));

		expect(video.length).toBe(8);
		expect(video.isLive).toBe(true);
	});
});

describe("HlsVideoAdapter live probe", () => {
	const PROBE_HOST = "cinema.example.com";
	const LIVE_URL = `https://${PROBE_HOST}/livehls/live/my-stream/index.m3u8`;
	let adapter: HlsVideoAdapter;
	let mockAxiosGet;

	beforeEach(() => {
		adapter = new HlsVideoAdapter();
		// Set directly rather than through initialize() so the test does not depend on config
		// loading, which is what initialize() does with this value.
		adapter.liveProbeHosts = [PROBE_HOST];
		vi.resetAllMocks();
		mockAxiosGet = axios.get;
	});

	describe("getLiveProbeSlug", () => {
		it("extracts the slug from a playback URL on a probe host", () => {
			expect(adapter.getLiveProbeSlug(URL.parse(LIVE_URL))).toBe("my-stream");
		});

		it("returns null for the same path on a host that is not configured", () => {
			expect(
				adapter.getLiveProbeSlug(
					URL.parse("https://elsewhere.example.com/livehls/live/my-stream/index.m3u8"),
				),
			).toBeNull();
		});

		it("returns null for an unrelated path on a probe host", () => {
			expect(
				adapter.getLiveProbeSlug(URL.parse(`https://${PROBE_HOST}/media/movie.m3u8`)),
			).toBeNull();
		});
	});

	it("resolves a live stream through the probe without fetching the manifest", async () => {
		mockAxiosGet.mockResolvedValue({
			data: { live: true, status: "live", title: "Opening Night" },
		});

		const video = await adapter.fetchVideoInfo(LIVE_URL);

		expect(mockAxiosGet).toHaveBeenCalledTimes(1);
		expect(mockAxiosGet).toHaveBeenCalledWith(
			`https://${PROBE_HOST}/api/stream/manifest_info/my-stream`,
		);
		expect(video).toMatchObject({
			service: "hls",
			id: LIVE_URL,
			title: "Opening Night",
			isLive: true,
			hls_url: LIVE_URL,
		});
	});

	it("does not set a length for a probed stream", async () => {
		// The auto-advance check reads `endAt ?? length ?? 0`; inventing a length here would put
		// a meaningless number into that comparison.
		mockAxiosGet.mockResolvedValue({
			data: { live: true, status: "live", title: "Opening Night" },
		});

		const video = await adapter.fetchVideoInfo(LIVE_URL);

		expect(video.length).toBeUndefined();
	});

	it("reports a stream the probe says is not live", async () => {
		mockAxiosGet.mockResolvedValue({
			data: { live: false, status: "ended", title: "Last Night" },
		});

		const video = await adapter.fetchVideoInfo(LIVE_URL);

		expect(video.isLive).toBe(false);
	});

	it("falls back to the URL when the probe returns an empty title", async () => {
		mockAxiosGet.mockResolvedValue({ data: { live: true, status: "live", title: "" } });

		const video = await adapter.fetchVideoInfo(LIVE_URL);

		expect(video.title).toBe(LIVE_URL);
	});

	it("throws VideoNotFoundException when the probe 404s", async () => {
		// The host returns 404 both for an unknown slug and for a stream the caller may not
		// watch, deliberately, so this is the only thing it can mean here.
		const err = new AxiosError("Not Found");
		err.response = { status: 404 } as never;
		mockAxiosGet.mockRejectedValue(err);
		vi.mocked(axios.isAxiosError).mockReturnValue(true);

		await expect(adapter.fetchVideoInfo(LIVE_URL)).rejects.toThrow(VideoNotFoundException);
	});

	it("still fetches the manifest for hosts that are not probe hosts", async () => {
		mockAxiosGet.mockResolvedValue({ data: VOD_MEDIA_PLAYLIST });

		const video = await adapter.fetchVideoInfo("https://other.example.com/vod/index.m3u8");

		expect(mockAxiosGet).toHaveBeenCalledWith("https://other.example.com/vod/index.m3u8");
		expect(video.isLive).toBe(false);
	});
});
