<template>
	<transition name="fade">
		<div v-if="shouldShowButton" class="audience-play-overlay" @click="handlePlayClick">
			<div class="play-button-container">
				<Button
					size="icon"
					variant="default"
					class="play-button"
					:aria-label="$t('common.play')"
				>
					<Icon :icon="iconGlyph" class="size-12 md:size-16" />
				</Button>
				<div class="play-hint">{{ hintText }}</div>
			</div>
		</div>
	</transition>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onUnmounted } from "vue";
import { mdiPlay, mdiVolumeHigh } from "@mdi/js";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useStore } from "@/store";
import { useConnection } from "@/plugins/connection";
import { useRoomApi } from "@/util/roomapi";

const props = withDefaults(
	defineProps<{
		isProjectionMode: boolean;
		isProjectionist: boolean;
		/**
		 * THC fork: this viewer's own player is not running while the room says
		 * it should be. Measured by the parent from the player's own events —
		 * see `playbackStalled` in Room.vue.
		 */
		playbackStalled: boolean;
		/**
		 * THC fork: this viewer's player IS running, but muted — the state a
		 * shielded YouTube iframe has to start in so the browser lets it autoplay
		 * at all (a gesture on our overlay never reaches the nested frame). The
		 * picture is fine; only sound is missing, and the shield blocks the
		 * player's own unmute, so this button carries it. Resolved by the parent —
		 * see `needsUnmute` in Room.vue.
		 */
		needsUnmute: boolean;
	}>(),
	{
		isProjectionMode: false,
		isProjectionist: false,
		playbackStalled: false,
		needsUnmute: false,
	},
);

/**
 * A stall is answered by the PARENT, which owns the player. Room.vue's
 * `onClickUnblockPlayback` is that answer and already exists — it is what the
 * upstream `mediaPlaybackBlocked` prompt calls. `unmute` is the parent's
 * counterpart for a muted-but-playing picture.
 */
const emit = defineEmits<{ unblock: []; unmute: [] }>();

const store = useStore();
const roomapi = useRoomApi(useConnection());

// Cooldown state - prevents button from appearing immediately after projectionist stops video
const isInCooldown = ref(false);
const cooldownTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const COOLDOWN_DURATION_MS = 10000; // 10 seconds

// Watch for video playback state changes
watch(
	() => store.state.room.isPlaying,
	(isPlaying, wasPlaying) => {
		// When video stops (transitions from playing to not playing)
		if (wasPlaying && !isPlaying && props.isProjectionMode && !props.isProjectionist) {
			console.log("[AudiencePlayButton] Video stopped, starting 10 second cooldown");

			// Start cooldown
			isInCooldown.value = true;

			// Clear any existing timer
			if (cooldownTimer.value) {
				clearTimeout(cooldownTimer.value);
			}

			// Set timer to end cooldown after 10 seconds
			cooldownTimer.value = setTimeout(() => {
				console.log("[AudiencePlayButton] Cooldown period ended, button can appear");
				isInCooldown.value = false;
				cooldownTimer.value = null;
			}, COOLDOWN_DURATION_MS);
		}
	},
);

// Clean up timer when component unmounts
onUnmounted(() => {
	if (cooldownTimer.value) {
		clearTimeout(cooldownTimer.value);
		cooldownTimer.value = null;
	}
});

/**
 * Two independent reasons an audience member needs this button, and they are
 * different questions:
 *
 *   * the ROOM is stopped — nothing is being broadcast to start;
 *   * the room is playing but THIS viewer's player never started — a blocked
 *     autoplay.
 *
 * It used to ask only the first, which is the reading that is `true` exactly
 * when the second case is false. A projection room is playing server-side
 * whether or not any given browser managed to start it, so a stalled viewer
 * got a blank picture, a correct advancing clock, and no control.
 *
 * On YouTube nothing else catches it: `YoutubePlayer.play()` fires
 * `playVideo()` and resolves unconditionally, so the blocked autoplay never
 * rejects and Room.vue's `mediaPlaybackBlocked` prompt never renders either —
 * that path only sees a real `NotAllowedError`, which only a media element
 * throws. The fork also holds `#mouse-event-swallower` over the player for the
 * whole of an audience member's session (`shieldPlayerSurface`), so the manual
 * tap YouTube's own player requires cannot reach the frame. This button is the
 * only way out.
 *
 * The cooldown deliberately does NOT gate the stall. It answers "the
 * projectionist just stopped the video, don't nag" — a claim about a STOPPED
 * room, which a stall is not; a stall is a fact about a room that is running.
 */
const shouldShowButton = computed(() => {
	const roomStopped = !store.state.room.isPlaying && !isInCooldown.value;
	const result =
		props.isProjectionMode &&
		!props.isProjectionist &&
		(roomStopped || props.playbackStalled || props.needsUnmute);

	if (props.isProjectionMode) {
		console.log(
			"[AudiencePlayButton] Visibility check:",
			"isProjectionMode=",
			props.isProjectionMode,
			"isProjectionist=",
			props.isProjectionist,
			"isPlaying=",
			store.state.room.isPlaying,
			"isInCooldown=",
			isInCooldown.value,
			"playbackStalled=",
			props.playbackStalled,
			"shouldShow=",
			result,
		);
	}

	return result;
});

/**
 * "Tap for sound" ONLY when sound is the one thing missing: the picture is
 * already playing (not stalled, not a stopped room), it is just muted. Every
 * other reason the button shows is about getting a picture, so it keeps the
 * play wording. A stall outranks an unmute — there is no picture to unmute.
 */
const isUnmuteOnly = computed(
	() => props.needsUnmute && !props.playbackStalled && store.state.room.isPlaying,
);
const hintText = computed(() => (isUnmuteOnly.value ? "Tap for sound" : "Tap to Play"));
const iconGlyph = computed(() => (isUnmuteOnly.value ? mdiVolumeHigh : mdiPlay));

/**
 * The reasons this button appears take different remedies, and the
 * mutually-exclusive ones are why: a stall is defined by the room ALREADY
 * playing, so it can never coincide with a stopped room.
 *
 * A stopped room is started by asking the room. The server flips `isPlaying`,
 * marks it dirty, and the sync that comes back drives every viewer's player
 * through `applyIsPlaying`.
 *
 * A stall cannot be. `Room.play()` returns early on `if (this.isPlaying)`
 * without marking anything dirty, so nothing goes out on the wire, nothing
 * calls `applyIsPlaying`, and the one player that needed starting is never
 * told to. The tap granted exactly the user activation the autoplay policy was
 * waiting for and then nothing spent it — black picture, advancing clock,
 * overlay still up. A remedy that cannot move its own finding is a loop.
 *
 * So the stall is answered locally, inside the gesture, by the parent that
 * holds the player. The room is deliberately NOT asked as well: it would
 * change nothing, and `publishRoomEvent` would announce "played the video" to
 * every other viewer on behalf of someone who altered nothing.
 */
function handlePlayClick() {
	console.log("[AudiencePlayButton] Play button clicked by audience member");

	// A stall is the stronger claim (no picture at all) and its remedy is the
	// local re-play, so it is answered first even if the player is also muted.
	if (props.playbackStalled) {
		emit("unblock");
		return;
	}

	// Playing but muted: sound is all that is missing, answered locally by the
	// parent's `unMute`. The room is NOT asked — it is already playing, so a
	// PlaybackRequest would change nothing and announce a no-op to everyone.
	if (props.needsUnmute) {
		emit("unmute");
		return;
	}

	roomapi.play();
}
</script>

<style lang="scss" scoped>
.audience-play-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.3);
	backdrop-filter: blur(4px);
	z-index: 50; // Below controls (100) but above video
	cursor: pointer;

	.play-button-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;

		.play-button {
			width: 120px !important;
			height: 120px !important;
			background: rgba(255, 255, 255, 0.95) !important;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
			transition: all 0.3s ease;

			// Smaller size on mobile
			@media (max-width: 760px) {
				width: 80px !important;
				height: 80px !important;
			}

			&:hover {
				transform: scale(1.1);
				box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
			}

			&:active {
				transform: scale(0.95);
			}
		}

		.play-hint {
			color: white;
			font-size: 18px;
			font-weight: 500;
			text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
			letter-spacing: 0.5px;
		}
	}
}

// Fade transition
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
