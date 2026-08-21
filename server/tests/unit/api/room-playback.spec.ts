import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import request from "supertest";
import type { AuthToken } from "ott-common/models/types.js";
import { QueueMode } from "ott-common/models/types.js";
import { main } from "../../../app.js";
import roommanager from "../../../roommanager.js";
import infoextractor from "../../../infoextractor.js";
import tokens from "../../../auth/tokens.js";
import { UnloadReason } from "../../../generated.js";
import { Room as RoomModel } from "../../../models/index.js";

describe("POST /api/room/:name/playback", () => {
	let app;
	let token: AuthToken;

	beforeAll(async () => {
		app = (await main()).app;
		const auth = await request(app).get("/api/auth/grant");
		token = auth.body.token;
		vi.spyOn(tokens, "getSessionInfo").mockResolvedValue({
			isLoggedIn: false,
			username: "test",
		});
		vi.spyOn(tokens, "validate").mockResolvedValue(true);
	});

	afterEach(async () => {
		try {
			await roommanager.unloadRoom("channel_1", UnloadReason.Admin);
		} catch {
			/* not loaded */
		}
		await RoomModel.destroy({ where: { name: "channel_1" } });
	});

	async function materialize() {
		await request(app)
			.post("/api/room/create")
			.set("Authorization", `Bearer ${token}`)
			.send({ name: "channel_1", isTemporary: false, queueMode: QueueMode.Loop })
			.expect(201);

		vi.spyOn(infoextractor, "getVideoInfo").mockImplementation(async (service, id) => ({
			service,
			id,
			title: id,
			length: 300,
		}));

		for (const id of ["vid_a", "vid_b"]) {
			await request(app)
				.post("/api/room/channel_1/queue")
				.set("Authorization", `Bearer ${token}`)
				.send({ service: "youtube", id, credentials: { youtube_api_key: "creator-key" } })
				.expect(200);
		}
	}

	it("starts a cold room mid-item in ONE call and reports the result", async () => {
		await materialize();

		const room = (await roommanager.getRoom("channel_1")).unwrap();
		expect(room.isPlaying).toBe(false);
		expect(room.currentSource).toBeNull();

		const resp = await request(app)
			.post("/api/room/channel_1/playback")
			.set("Authorization", `Bearer ${token}`)
			.send({ action: "play", position: 137 })
			.expect(200);

		console.log("PLAYBACK RESP ->", JSON.stringify(resp.body));
		expect(resp.body.success).toBe(true);
		expect(resp.body.isPlaying).toBe(true);
		expect(resp.body.playbackPosition).toBeCloseTo(137, 0);
		expect(room.currentSource).toMatchObject({ id: "vid_a" });
	});

	it("advances from the seeked position with ZERO clients", async () => {
		await materialize();
		await request(app)
			.post("/api/room/channel_1/playback")
			.set("Authorization", `Bearer ${token}`)
			.send({ action: "play", position: 137 })
			.expect(200);

		const room = (await roommanager.getRoom("channel_1")).unwrap();
		const p1 = room.realPlaybackPosition;
		await new Promise(resolve => setTimeout(resolve, 1100));
		const p2 = room.realPlaybackPosition;
		console.log("UNATTENDED ->", "users:", room.realusers.length, "|", p1, "->", p2);
		expect(room.realusers.length).toBe(0);
		expect(p2).toBeGreaterThan(p1);
	});

	it("GET /:name reports the live playhead", async () => {
		await materialize();
		await request(app)
			.post("/api/room/channel_1/playback")
			.set("Authorization", `Bearer ${token}`)
			.send({ action: "play", position: 42 })
			.expect(200);

		const resp = await request(app)
			.get("/api/room/channel_1")
			.set("Authorization", `Bearer ${token}`)
			.expect(200);
		console.log(
			"GET READBACK ->",
			JSON.stringify({
				isPlaying: resp.body.isPlaying,
				playbackPosition: resp.body.playbackPosition,
				currentSource: resp.body.currentSource?.id,
			}),
		);
		expect(resp.body.isPlaying).toBe(true);
		expect(resp.body.playbackPosition).toBeGreaterThanOrEqual(42);
	});

	it("rejects seek with no position", async () => {
		await materialize();
		const resp = await request(app)
			.post("/api/room/channel_1/playback")
			.set("Authorization", `Bearer ${token}`)
			.send({ action: "seek" })
			.expect(400);
		console.log("SEEK-NO-POS ->", resp.body.error?.message?.slice(0, 60));
		expect(resp.body.success).toBe(false);
	});

	it("pauses", async () => {
		await materialize();
		await request(app)
			.post("/api/room/channel_1/playback")
			.set("Authorization", `Bearer ${token}`)
			.send({ action: "play", position: 10 })
			.expect(200);
		const resp = await request(app)
			.post("/api/room/channel_1/playback")
			.set("Authorization", `Bearer ${token}`)
			.send({ action: "pause" })
			.expect(200);
		expect(resp.body.isPlaying).toBe(false);
	});

	it("404s for a room that does not exist", async () => {
		const resp = await request(app)
			.post("/api/room/channel_nope/playback")
			.set("Authorization", `Bearer ${token}`)
			.send({ action: "play" })
			.expect(404);
		expect(resp.body.error.name).toBe("RoomNotFoundException");
	});
});
