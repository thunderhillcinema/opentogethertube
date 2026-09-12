import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import AudiencePlayButton from "@/components/AudiencePlayButton.vue";
import { RoomRequestType } from "ott-common/models/messages";
import { type RoomState, roomModule } from "@/stores/room";
import { mountComponent } from "./component-test-utils";

/**
 * The audience's only way to start a broadcast their browser refused to
 * autoplay.
 *
 * The button used to ask `!store.state.room.isPlaying` — the ROOM's state — and
 * that is a different question from the one it exists to answer. A projection
 * room is playing server-side whether or not any given viewer's player ever
 * started, so the reading was `true` exactly when a stalled viewer needed the
 * button, and it stayed hidden.
 *
 * On YouTube that is a closed trap. `YoutubePlayer.play()` calls `playVideo()`
 * and returns `Promise.resolve()` unconditionally, so a blocked autoplay never
 * rejects, `mediaPlaybackBlocked` in Room.vue stays false and the upstream
 * "playback blocked" prompt never renders either. Meanwhile the fork keeps
 * `#mouse-event-swallower` over the player at all times for an audience member
 * (`shieldPlayerSurface`), so the manual tap YouTube's own docs require cannot
 * reach the frame. Blank picture, correct advancing clock, no way out.
 *
 * So the button now takes a second, independent reason to appear: this viewer's
 * own player is not running while the room says it should be. `playbackStalled`
 * is that reading, measured by the parent from the player's own `playing` /
 * `paused` events.
 */
describe("AudiencePlayButton component", () => {
	// `roomModule.state` is an object literal rather than a factory, so every
	// `buildNewStore()` hands back the SAME room state: whatever a previous test
	// left in `isPlaying` is what the next one mounts on top of. That is not
	// inert here — a test that then sets it false walks the component's
	// true→false watcher and arms the 10s post-stop cooldown, hiding the overlay
	// for a reason unrelated to the case under test. The file only ever passed
	// because its one stopped-room case happened to run first.
	beforeEach(() => {
		(roomModule.state as RoomState).isPlaying = false;
	});

	function mountFor(props: Record<string, unknown> = {}) {
		return mountComponent(AudiencePlayButton, {
			props: { isProjectionMode: true, isProjectionist: false, ...props },
		});
	}

	it("offers to play while the room is stopped", () => {
		const { wrapper, store } = mountFor();
		store.state.room.isPlaying = false;

		expect(wrapper.find(".audience-play-overlay").exists()).toBe(true);
	});

	it("stays out of the way while the viewer's own player is running", async () => {
		const { wrapper, store } = mountFor();
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".audience-play-overlay").exists()).toBe(false);
	});

	// The regression. Room playing, this viewer's player stalled.
	it("offers to play when the room is playing but this viewer's player is not", async () => {
		const { wrapper, store } = mountFor({ playbackStalled: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".audience-play-overlay").exists()).toBe(true);
	});

	// The cooldown answers "the projectionist just stopped the video, don't
	// nag" — a claim about a STOPPED room. It must not suppress a stall, which
	// is a different fact about a room that is running.
	it("offers to play on a stall even inside the post-stop cooldown", async () => {
		const { wrapper, store } = mountFor();

		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();
		store.state.room.isPlaying = false;
		await wrapper.vm.$nextTick();
		expect(wrapper.find(".audience-play-overlay").exists()).toBe(false);

		store.state.room.isPlaying = true;
		await wrapper.setProps({ playbackStalled: true });
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".audience-play-overlay").exists()).toBe(true);
	});

	it("shows nothing to the projectionist, who drives playback themselves", async () => {
		const { wrapper, store } = mountFor({ isProjectionist: true, playbackStalled: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".audience-play-overlay").exists()).toBe(false);
	});

	it("shows nothing outside projection mode", async () => {
		const { wrapper, store } = mountFor({ isProjectionMode: false, playbackStalled: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".audience-play-overlay").exists()).toBe(false);
	});

	/**
	 * The two reasons the button appears need two different remedies, and only
	 * one of them was wired.
	 *
	 * A STOPPED room is started by asking the room: the server flips `isPlaying`,
	 * marks it dirty, and the sync that comes back drives every viewer's player
	 * through `applyIsPlaying`.
	 *
	 * A STALL is the opposite case — the room is already playing. `Room.play()`
	 * returns early on `if (this.isPlaying)` without marking anything dirty, so
	 * no `isPlaying` goes out on the wire, `applyIsPlaying` never runs, and the
	 * stalled player is never told to play. The tap granted the user activation
	 * the autoplay policy wanted and then nothing spent it: black picture,
	 * advancing clock, overlay still up. A remedy that cannot move its own
	 * finding is a loop.
	 *
	 * So a stall is answered LOCALLY, inside the gesture — the parent's
	 * `onClickUnblockPlayback`, which re-seeks to the true position (the viewer
	 * has been watching black while the broadcast ran on) and starts this
	 * player. The room is not asked, because asking it changes nothing and
	 * `publishRoomEvent` would announce "played the video" to every other viewer
	 * on behalf of someone who altered nothing.
	 */
	it("starts this viewer's own player when tapped on a stall", async () => {
		const { wrapper, store, connection } = mountFor({ playbackStalled: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		await wrapper.get(".audience-play-overlay").trigger("click");

		expect(wrapper.emitted("unblock")).toHaveLength(1);
		expect(connection.sent).not.toContainEqual({
			action: "req",
			request: { type: RoomRequestType.PlaybackRequest, state: true },
		});
	});

	it("asks the room to play when tapped in a stopped room", async () => {
		const { wrapper, store, connection } = mountFor();
		store.state.room.isPlaying = false;
		await wrapper.vm.$nextTick();

		await wrapper.get(".audience-play-overlay").trigger("click");

		expect(connection.sent).toContainEqual({
			action: "req",
			request: { type: RoomRequestType.PlaybackRequest, state: true },
		});
		expect(wrapper.emitted("unblock")).toBeUndefined();
	});

	/**
	 * THC fork: the third reason the button appears, and the one the live page
	 * relies on. A shielded audience cannot autoplay a nested YouTube iframe with
	 * sound — a gesture on our overlay never reaches that frame — so the player
	 * starts MUTED, which the browser's muted-autoplay policy allows. The picture
	 * rolls on its own; `playbackStalled` therefore stays false (this viewer IS
	 * playing). The only thing missing is sound, and the shield blocks the
	 * player's own unmute control, so this button carries it.
	 */
	it("offers sound when the audience's player is playing but muted", async () => {
		const { wrapper, store } = mountFor({ needsUnmute: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".audience-play-overlay").exists()).toBe(true);
		expect(wrapper.get(".play-hint").text()).toBe("Tap for sound");
	});

	// The stopped-room and stall cases are a different remedy (start the
	// picture), so they keep the play wording.
	it("keeps the play wording when there is no picture yet", async () => {
		const { wrapper, store } = mountFor({ playbackStalled: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		expect(wrapper.get(".play-hint").text()).toBe("Tap to Play");
	});

	// Unmuting is answered LOCALLY, like the stall — the room is already playing,
	// so asking it to play changes nothing and would announce a no-op to every
	// other viewer. It is NOT the stall remedy either: the picture is fine.
	it("emits unmute (and nothing else) when tapped for sound", async () => {
		const { wrapper, store, connection } = mountFor({ needsUnmute: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		await wrapper.get(".audience-play-overlay").trigger("click");

		expect(wrapper.emitted("unmute")).toHaveLength(1);
		expect(wrapper.emitted("unblock")).toBeUndefined();
		expect(connection.sent).not.toContainEqual({
			action: "req",
			request: { type: RoomRequestType.PlaybackRequest, state: true },
		});
	});

	// A stall is the stronger claim — there is no picture at all — so it wins,
	// and its remedy (re-play the now-muted player) is what runs. Unmuting a
	// player that is not playing would do nothing visible.
	it("treats a stall as taking precedence over an unmute", async () => {
		const { wrapper, store } = mountFor({ playbackStalled: true, needsUnmute: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		await wrapper.get(".audience-play-overlay").trigger("click");

		expect(wrapper.emitted("unblock")).toHaveLength(1);
		expect(wrapper.emitted("unmute")).toBeUndefined();
	});

	it("shows no sound prompt to the projectionist", async () => {
		const { wrapper, store } = mountFor({ isProjectionist: true, needsUnmute: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".audience-play-overlay").exists()).toBe(false);
	});

	it("shows no sound prompt outside projection mode", async () => {
		const { wrapper, store } = mountFor({ isProjectionMode: false, needsUnmute: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".audience-play-overlay").exists()).toBe(false);
	});
});

/**
 * The emit is only half the remedy: an event nobody listens to leaves the
 * viewer exactly where they were, and the component test cannot see that.
 *
 * Room.vue mounts this button TWICE — once in the immersive-landscape layout
 * and once in the ordinary one — and a viewer trapped by a blocked autoplay is
 * in whichever one their phone happens to be in. A listener on one of them is
 * not a listener.
 */
describe("AudiencePlayButton wiring in Room.vue", () => {
	// `import.meta.url` is an http: URL once Vite has transformed the spec, so
	// the file is found from the working directory instead — which is the client
	// workspace under `vitest run`, and the repo root under `yarn test`.
	const candidates = ["src/views/Room.vue", "client/src/views/Room.vue"].map(p =>
		resolve(process.cwd(), p),
	);
	const roomPath = candidates.find(existsSync);
	const source = roomPath ? readFileSync(roomPath, "utf-8") : "";

	it("finds the file it is auditing", () => {
		expect(roomPath, `Room.vue not found at any of ${candidates.join(", ")}`).toBeDefined();
	});

	it("handles unblock at every place it mounts the button", () => {
		const mounts = source.match(/<AudiencePlayButton[\s\S]*?\/>/g) ?? [];

		expect(mounts.length).toBeGreaterThan(0);
		for (const mount of mounts) {
			expect(mount).toContain("@unblock=");
		}
	});

	// Naming the handler rather than an inline expression: the local start has
	// to re-seek to the true position as well as play, and `onClickUnblockPlayback`
	// is the one definition of that — shared with the upstream
	// `mediaPlaybackBlocked` prompt so the two cannot drift.
	it("answers it with the same local start the blocked-playback prompt uses", () => {
		expect(source).toContain('@unblock="onClickUnblockPlayback"');
	});

	// The sound prompt has the same twice-mounted hazard as the play prompt: a
	// viewer watching a muted broadcast is in whichever layout their phone is in,
	// so an unmute handler on only one of them is no handler for half of them.
	it("handles unmute and passes the muted state at every place it mounts the button", () => {
		const mounts = source.match(/<AudiencePlayButton[\s\S]*?\/>/g) ?? [];

		expect(mounts.length).toBeGreaterThan(0);
		for (const mount of mounts) {
			expect(mount).toContain("@unmute=");
			expect(mount).toContain(":needs-unmute=");
		}
	});

	// Muted autoplay is the whole fix: a shielded YouTube iframe cannot start
	// with sound on a programmatic play, so it must start muted. Both player
	// mounts must carry it or the audience in that layout is back to a black
	// screen with a dead "Tap to Play".
	it("starts the shielded audience's player muted at every OmniPlayer mount", () => {
		const mounts = source.match(/<OmniPlayer[\s\S]*?\/>/g) ?? [];

		expect(mounts.length).toBeGreaterThan(0);
		for (const mount of mounts) {
			expect(mount).toContain(":start-muted=");
		}
	});
});
