import { describe, it, expect, beforeEach, vi } from "vitest";
import VimeoAdapter from "../../../services/vimeo.js";
import { InvalidVideoIdException } from "../../../exceptions.js";

const validVideoLinks = [
	["283918572", "https://vimeo.com/283918572"],
	["283918572", "https://www.vimeo.com/283918572"],
];

const invalidLinks = [
	"https://example.com",
	"https://vimeo.com",
	"https://vimeo.com/lkjsads",
	"https://evilvimeo.com/283918572",
	"https://vimeo.com.evil.com/283918572",
];

describe("Vimeo", () => {
	describe("canHandleURL", () => {
		const adapter = new VimeoAdapter();

		it.each(validVideoLinks.map(l => l[1]))("Accepts %s", link => {
			expect(adapter.canHandleURL(link)).toBe(true);
		});

		it.each(invalidLinks)("Rejects %s", link => {
			expect(adapter.canHandleURL(link)).toBe(false);
		});
	});

	describe("isCollectionURL", () => {
		const adapter = new VimeoAdapter();

		it("Always returns false because collections aren't supported", () => {
			expect(adapter.isCollectionURL("")).toBe(false);
		});
	});

	describe("getVideoId", () => {
		const adapter = new VimeoAdapter();

		it.each(validVideoLinks)("Extracts %s from %s", (id, link) => {
			expect(adapter.getVideoId(link)).toBe(id);
		});
	});

	describe("fetchVideoInfo", () => {
		const adapter = new VimeoAdapter();
		const apiGet = vi.fn();
		apiGet.mockReturnValue({ data: {} });
		adapter.api.get = apiGet;
		const videoId = "283918572";

		beforeEach(() => {
			apiGet.mockClear();
		});

		it("Returns a promise", () => {
			expect(adapter.fetchVideoInfo(videoId)).toBeInstanceOf(Promise);
		});

		it("Queries the Vimeo API", async () => {
			await adapter.fetchVideoInfo(videoId);
			expect(apiGet).toBeCalled();
		});

		it("Throws an error if videoId is invalid", () => {
			return expect(adapter.fetchVideoInfo("")).rejects.toThrowError(InvalidVideoIdException);
		});
	});

	describe("credentials", () => {
		const videoId = "283918572";
		let adapter: VimeoAdapter;
		let oembedGet: ReturnType<typeof vi.fn>;
		let authedGet: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			adapter = new VimeoAdapter();
			oembedGet = vi.fn().mockResolvedValue({ data: {} });
			authedGet = vi.fn().mockResolvedValue({
				data: {
					name: "authed title",
					description: "authed description",
					duration: 123,
					pictures: {
						sizes: [
							{ width: 200, link: "https://i.vimeocdn.com/small.jpg" },
							{ width: 1280, link: "https://i.vimeocdn.com/large.jpg" },
							{ width: 640, link: "https://i.vimeocdn.com/medium.jpg" },
						],
					},
				},
			});
			// `ReturnType<typeof vi.fn>` is `Mock<any[], unknown>`, and `unknown`
			// does not satisfy axios's `Promise<R>` return, so a bare assignment
			// fails TS2322. That error broke `yarn workspace ott-server run build`
			// — which type-checks `tests/**` — and so broke the Docker image build
			// and every deploy with it.
			adapter.api.get = oembedGet as unknown as typeof adapter.api.get;
			adapter.authedApi.get = authedGet as unknown as typeof adapter.authedApi.get;
		});

		it("uses the unauthenticated oembed endpoint when no credentials are provided", async () => {
			await adapter.fetchVideoInfo(videoId);
			expect(oembedGet).toBeCalled();
			expect(authedGet).not.toBeCalled();
		});

		it("uses the unauthenticated oembed endpoint when credentials carry no vimeo token", async () => {
			await adapter.fetchVideoInfo(videoId, undefined, { youtube_api_key: "yt-key" });
			expect(oembedGet).toBeCalled();
			expect(authedGet).not.toBeCalled();
		});

		it("sends a bearer header to the authenticated API when a vimeo token is provided", async () => {
			await adapter.fetchVideoInfo(videoId, undefined, {
				vimeo_access_token: "vimeo-token",
			});
			expect(oembedGet).not.toBeCalled();
			expect(authedGet).toHaveBeenCalledWith(
				`/videos/${videoId}`,
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer vimeo-token",
					}),
				}),
			);
		});

		it("maps the authenticated API's differently-named fields onto a Video", async () => {
			const video = await adapter.fetchVideoInfo(videoId, undefined, {
				vimeo_access_token: "vimeo-token",
			});
			expect(video).toMatchObject({
				service: "vimeo",
				id: videoId,
				title: "authed title",
				description: "authed description",
				length: 123,
			});
		});

		it("picks the widest thumbnail regardless of the order returned", async () => {
			const video = await adapter.fetchVideoInfo(videoId, undefined, {
				vimeo_access_token: "vimeo-token",
			});
			expect(video.thumbnail).toBe("https://i.vimeocdn.com/large.jpg");
		});

		it("tolerates an authenticated response with no thumbnails", async () => {
			authedGet.mockResolvedValue({
				data: { name: "t", description: null, duration: 5 },
			});
			const video = await adapter.fetchVideoInfo(videoId, undefined, {
				vimeo_access_token: "vimeo-token",
			});
			expect(video.thumbnail).toBe("");
			expect(video.description).toBe("");
		});

		it.each([401, 403])(
			"falls back to the unauthenticated endpoint when the token is rejected with %i",
			async status => {
				authedGet.mockRejectedValue({ response: { status } });
				await adapter.fetchVideoInfo(videoId, undefined, {
					vimeo_access_token: "stale-token",
				});
				expect(authedGet).toBeCalled();
				expect(oembedGet).toBeCalled();
			},
		);

		it("does not fall back when the authenticated lookup fails for another reason", async () => {
			authedGet.mockRejectedValue({ response: { status: 500 } });
			await expect(
				adapter.fetchVideoInfo(videoId, undefined, { vimeo_access_token: "vimeo-token" }),
			).rejects.toBeDefined();
			expect(oembedGet).not.toBeCalled();
		});

		it("still rejects an invalid video id before touching either endpoint", async () => {
			await expect(
				adapter.fetchVideoInfo("", undefined, { vimeo_access_token: "vimeo-token" }),
			).rejects.toThrowError(InvalidVideoIdException);
			expect(authedGet).not.toBeCalled();
			expect(oembedGet).not.toBeCalled();
		});
	});
});
