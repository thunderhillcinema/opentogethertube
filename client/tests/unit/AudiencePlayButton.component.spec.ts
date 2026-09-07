import { describe, expect, it } from "vitest";
import AudiencePlayButton from "@/components/AudiencePlayButton.vue";
import { RoomRequestType } from "ott-common/models/messages";
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

	it("asks the room to play when tapped", async () => {
		const { wrapper, store, connection } = mountFor({ playbackStalled: true });
		store.state.room.isPlaying = true;
		await wrapper.vm.$nextTick();

		await wrapper.get(".audience-play-overlay").trigger("click");

		// A stalled viewer asks the ROOM to play, exactly as a viewer in a
		// stopped room does — the button gains a reason to appear, not a second
		// meaning when it is pressed.
		expect(connection.sent).toContainEqual({
			action: "req",
			request: { type: RoomRequestType.PlaybackRequest, state: true },
		});
	});
});
