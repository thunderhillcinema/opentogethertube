import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import request from "supertest";
import { QueueMode, BehaviorOption } from "ott-common/models/types.js";
import { main } from "../../../app.js";
import roommanager from "../../../roommanager.js";
import infoextractor from "../../../infoextractor.js";
import tokens from "../../../auth/tokens.js";
import usermanager from "../../../usermanager.js";
import { Room as RoomModel, User } from "../../../models/index.js";
import { UnloadReason } from "../../../generated.js";

const NAME = "channel_accept";

describe("room settings persistence", () => {
	let app;
	let token;
	let owner;

	beforeAll(async () => {
		app = (await main()).app;
		token = (await request(app).get("/api/auth/grant")).body.token;
		await User.destroy({ where: { username: "acceptowner" } });
		owner = await usermanager.registerUser({
			email: "accept@localhost",
			username: "acceptowner",
			password: "password1234",
		});
		vi.spyOn(tokens, "getSessionInfo").mockResolvedValue({
			isLoggedIn: true,
			user_id: owner.id,
		});
		vi.spyOn(tokens, "validate").mockResolvedValue(true);
	});

	afterEach(async () => {
		try {
			await roommanager.unloadRoom(NAME, UnloadReason.Admin);
		} catch {
			/* */
		}
		await RoomModel.destroy({ where: { name: NAME } });
	});

	it("a room created with restoreQueueBehavior Never reloads with nothing to restore", async () => {
		const auth = { Authorization: `Bearer ${token}` };

		await request(app)
			.post("/api/room/create")
			.set(auth)
			.send({
				name: NAME,
				isTemporary: false,
				queueMode: QueueMode.Loop,
				restoreQueueBehavior: BehaviorOption.Never,
			})
			.expect(201);

		vi.spyOn(infoextractor, "getVideoInfo").mockImplementation(async (service, id) => ({
			service,
			id,
			title: id,
			length: 10,
		}));
		for (const id of ["a", "b"]) {
			await request(app)
				.post(`/api/room/${NAME}/queue`)
				.set(auth)
				.send({ service: "youtube", id })
				.expect(200);
		}
		await request(app)
			.post(`/api/room/${NAME}/playback`)
			.set(auth)
			.send({ action: "play", position: 3 })
			.expect(200);

		const live = (await roommanager.getRoom(NAME)).unwrap();
		expect(live.restoreQueueBehavior).toBe(BehaviorOption.Never);

		// go off-block: room empties and unloads
		await roommanager.unloadRoom(NAME, UnloadReason.Keepalive);
		const dbRow = await RoomModel.findOne({ where: { name: NAME } });

		// next tune-in re-materializes
		const reloaded = (await roommanager.getRoom(NAME)).unwrap();

		expect(dbRow?.restoreQueueBehavior).toBe(BehaviorOption.Never);
		expect(reloaded.restoreQueueBehavior).toBe(BehaviorOption.Never);
		expect(reloaded.prevQueue).toBeNull();
		expect(reloaded.queue.length).toBe(0);
	});

	it("enableVoteSkip can be turned back off", async () => {
		const auth = { Authorization: `Bearer ${token}` };
		await request(app)
			.post("/api/room/create")
			.set(auth)
			.send({ name: NAME, isTemporary: false })
			.expect(201);
		await request(app)
			.patch(`/api/room/${NAME}`)
			.set(auth)
			.send({ enableVoteSkip: true })
			.expect(200);
		await request(app)
			.patch(`/api/room/${NAME}`)
			.set(auth)
			.send({ enableVoteSkip: false })
			.expect(200);
		await roommanager.unloadRoom(NAME, UnloadReason.Keepalive);
		const dbRow = await RoomModel.findOne({ where: { name: NAME } });
		expect(dbRow?.enableVoteSkip).toBe(false);
	});
});
