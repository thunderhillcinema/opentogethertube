import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { nextTick, ref } from "vue";
import { usePlaybackStall } from "@/util/playback-stall";

/**
 * "Is the broadcast running" and "did THIS viewer's picture start" are two
 * questions, and the audience play button was reading the first to answer the
 * second. This is the second one, measured directly.
 *
 * The room's `isPlaying` comes from the server and is true for every viewer at
 * once. Whether a given browser actually started is knowable only from that
 * player's own `playing` / `paused` events, which is what `localPlaying` here
 * carries.
 *
 * A grace period is essential rather than incidental: a player that IS going to
 * start still takes a moment to load and buffer, and a stall declared during
 * that window would flash a "Tap to Play" overlay over a broadcast that was
 * about to appear on its own.
 */
describe("usePlaybackStall", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function setup(
		opts: { room?: boolean; local?: boolean; enabled?: boolean; source?: string } = {},
	) {
		const roomPlaying = ref(opts.room ?? true);
		const localPlaying = ref(opts.local ?? false);
		const enabled = ref(opts.enabled ?? true);
		const sourceKey = ref<string | undefined>(opts.source ?? "film-1");
		const { stalled } = usePlaybackStall({
			roomPlaying,
			localPlaying,
			enabled,
			sourceKey,
			graceMs: 3000,
		});
		return { roomPlaying, localPlaying, enabled, sourceKey, stalled };
	}

	it("does not call a stall before the grace period is up", async () => {
		const { stalled } = setup();
		await nextTick();

		vi.advanceTimersByTime(2999);
		expect(stalled.value).toBe(false);
	});

	it("calls a stall when the room plays on without this viewer's player", async () => {
		const { stalled } = setup();
		await nextTick();

		vi.advanceTimersByTime(3000);
		expect(stalled.value).toBe(true);
	});

	it("stays quiet when the player starts inside the grace period", async () => {
		const { localPlaying, stalled } = setup();
		await nextTick();

		vi.advanceTimersByTime(2000);
		localPlaying.value = true;
		await nextTick();
		vi.advanceTimersByTime(5000);

		expect(stalled.value).toBe(false);
	});

	it("clears a called stall as soon as the player does start", async () => {
		const { localPlaying, stalled } = setup();
		await nextTick();
		vi.advanceTimersByTime(3000);
		expect(stalled.value).toBe(true);

		localPlaying.value = true;
		await nextTick();

		expect(stalled.value).toBe(false);
	});

	// A stopped room is the OTHER reason the button appears; reporting a stall
	// there too would say the viewer's player is broken when nothing is playing.
	it("reports no stall while the room itself is stopped", async () => {
		const { roomPlaying, stalled } = setup({ room: false });
		await nextTick();

		vi.advanceTimersByTime(10_000);
		expect(stalled.value).toBe(false);

		roomPlaying.value = true;
		await nextTick();
		vi.advanceTimersByTime(3000);
		expect(stalled.value).toBe(true);
	});

	it("drops a called stall when the room stops", async () => {
		const { roomPlaying, stalled } = setup();
		await nextTick();
		vi.advanceTimersByTime(3000);
		expect(stalled.value).toBe(true);

		roomPlaying.value = false;
		await nextTick();

		expect(stalled.value).toBe(false);
	});

	// The projectionist drives playback and has every control; only a
	// projection-mode audience is shielded from the player and needs this.
	it("measures nothing while disabled", async () => {
		const { enabled, stalled } = setup({ enabled: false });
		await nextTick();

		vi.advanceTimersByTime(10_000);
		expect(stalled.value).toBe(false);

		enabled.value = true;
		await nextTick();
		vi.advanceTimersByTime(3000);
		expect(stalled.value).toBe(true);
	});

	// A film ending and the next one starting re-opens the question: the new
	// player has to start too, and it can be blocked just the same.
	it("re-arms after the player stops again", async () => {
		const { localPlaying, stalled } = setup();
		await nextTick();
		vi.advanceTimersByTime(3000);
		localPlaying.value = true;
		await nextTick();
		expect(stalled.value).toBe(false);

		localPlaying.value = false;
		await nextTick();
		vi.advanceTimersByTime(3000);

		expect(stalled.value).toBe(true);
	});
	/**
	 * A cut to the next film re-opens the question, and nothing else says so.
	 * YouTube emits `ended` at the boundary, not `paused` — and Room.vue binds
	 * only `playing` and `paused` — so `localPlaying` would otherwise stay
	 * true from the film that just finished and a blocked autoplay on the NEXT
	 * film would go unnoticed. On a looping channel that is every film after
	 * the first.
	 */
	it("re-opens the question when the film changes", async () => {
		const { localPlaying, sourceKey, stalled } = setup();
		await nextTick();
		localPlaying.value = true;
		await nextTick();
		vi.advanceTimersByTime(10_000);
		expect(stalled.value).toBe(false);

		sourceKey.value = "film-2";
		await nextTick();
		vi.advanceTimersByTime(3000);

		expect(stalled.value).toBe(true);
	});

	it("stays quiet when the next film starts on its own", async () => {
		const { localPlaying, sourceKey, stalled } = setup();
		await nextTick();
		localPlaying.value = true;
		await nextTick();

		sourceKey.value = "film-2";
		await nextTick();
		vi.advanceTimersByTime(1000);
		// The player reports the new film running, inside the grace period.
		localPlaying.value = false;
		await nextTick();
		localPlaying.value = true;
		await nextTick();
		vi.advanceTimersByTime(10_000);

		expect(stalled.value).toBe(false);
	});
});
