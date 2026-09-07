import { getCurrentInstance, onUnmounted, ref, watch, type Ref } from "vue";

/**
 * THC fork: does the room think it is playing while THIS viewer's player is not?
 *
 * The two facts are independent and were being conflated. `room.isPlaying` is
 * server state, true for every viewer at once and true whether or not any given
 * browser managed to start its player. Whether a particular browser started is
 * knowable only from that player's own `playing` / `paused` events.
 *
 * The gap between them is a blocked autoplay, and on a projection embed it is a
 * closed trap. `YoutubePlayer.play()` calls `playVideo()` and returns
 * `Promise.resolve()` unconditionally, so a refusal never surfaces as the
 * `NotAllowedError` that Room.vue's `mediaPlaybackBlocked` prompt waits for —
 * that path only fires for a real media element. And the fork holds
 * `#mouse-event-swallower` over the player for the whole of an audience
 * member's session (`shieldPlayerSurface` in Room.vue), so the manual tap
 * YouTube's own player documents as the way out cannot reach the frame. The
 * viewer gets a blank picture, a correct advancing clock, and no control.
 *
 * The grace period is load-bearing, not a fudge: a player that IS going to
 * start still has to load and buffer, and a stall called during that window
 * would flash a "Tap to Play" overlay over a broadcast about to appear on its
 * own. Long enough to cover an ordinary start, short enough that a trapped
 * viewer is not left staring at black.
 */
export const PLAYBACK_STALL_GRACE_MS = 3000;

export interface PlaybackStallOptions {
	/** Server state: is the broadcast running? */
	roomPlaying: Ref<boolean>;
	/** This browser's player, from its own `playing` / `paused` events. */
	localPlaying: Ref<boolean>;
	/**
	 * Only a projection-mode audience is shielded from the player and needs
	 * this. The projectionist drives playback and keeps every control.
	 */
	enabled: Ref<boolean>;
	/**
	 * Identifies the film on screen. A cut re-opens the question: the new
	 * player has to start too, and can be blocked just the same.
	 *
	 * Nothing else says so. YouTube emits `ended` at a boundary, not `paused`,
	 * and Room.vue binds only `playing` and `paused` — so without this the
	 * finished film's `localPlaying: true` would carry over and a blocked
	 * autoplay on the next film would go unnoticed. On a looping channel that
	 * is every film after the first.
	 */
	sourceKey?: Ref<unknown>;
	graceMs?: number;
}

export function usePlaybackStall(opts: PlaybackStallOptions) {
	const graceMs = opts.graceMs ?? PLAYBACK_STALL_GRACE_MS;
	const stalled = ref(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function disarm() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	}

	function evaluate() {
		const suspect = opts.enabled.value && opts.roomPlaying.value && !opts.localPlaying.value;

		if (!suspect) {
			// Any answer other than "waiting on this player" clears the finding
			// as well as the timer: a stall must never outlive the condition
			// that produced it, or the overlay sits over a running picture.
			disarm();
			stalled.value = false;
			return;
		}

		if (stalled.value || timer) {
			return;
		}

		timer = setTimeout(() => {
			timer = null;
			// Re-ask rather than trust the reading that armed the timer — the
			// state can have moved on in the grace period.
			if (opts.enabled.value && opts.roomPlaying.value && !opts.localPlaying.value) {
				stalled.value = true;
			}
		}, graceMs);
	}

	// A new film voids the evidence gathered about the old one, so the reading
	// restarts from "not yet playing" rather than inheriting a stale true.
	if (opts.sourceKey) {
		watch(opts.sourceKey, () => {
			opts.localPlaying.value = false;
			stalled.value = false;
			disarm();
			evaluate();
		});
	}

	watch([opts.roomPlaying, opts.localPlaying, opts.enabled], evaluate, { immediate: true });

	// Guarded: this is usable outside a component (and is unit-tested that
	// way). An unguarded `onUnmounted` warns and registers nothing there.
	if (getCurrentInstance()) {
		onUnmounted(disarm);
	}

	return { stalled };
}
