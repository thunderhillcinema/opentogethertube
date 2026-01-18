<template>
	<transition name="fade">
		<div
			v-if="shouldShowButton"
			class="audience-play-overlay"
			@click="handlePlayClick"
		>
			<div class="play-button-container">
				<v-btn
					icon
					size="x-large"
					color="primary"
					class="play-button"
					:aria-label="$t('common.play')"
				>
					<v-icon :icon="mdiPlay" :size="iconSize" />
				</v-btn>
				<div class="play-hint">Tap to Play</div>
			</div>
		</div>
	</transition>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onUnmounted } from "vue";
import { mdiPlay } from "@mdi/js";
import { useStore } from "@/store";
import { useConnection } from "@/plugins/connection";
import { useRoomApi } from "@/util/roomapi";
import { useDisplay } from "vuetify";

const props = withDefaults(
	defineProps<{
		isProjectionMode: boolean;
		isProjectionist: boolean;
	}>(),
	{
		isProjectionMode: false,
		isProjectionist: false,
	}
);

const store = useStore();
const roomapi = useRoomApi(useConnection());
const { mobile } = useDisplay();

// Responsive icon size
const iconSize = computed(() => mobile.value ? 48 : 64);

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
			console.log('[AudiencePlayButton] Video stopped, starting 10 second cooldown');

			// Start cooldown
			isInCooldown.value = true;

			// Clear any existing timer
			if (cooldownTimer.value) {
				clearTimeout(cooldownTimer.value);
			}

			// Set timer to end cooldown after 10 seconds
			cooldownTimer.value = setTimeout(() => {
				console.log('[AudiencePlayButton] Cooldown period ended, button can appear');
				isInCooldown.value = false;
				cooldownTimer.value = null;
			}, COOLDOWN_DURATION_MS);
		}
	}
);

// Clean up timer when component unmounts
onUnmounted(() => {
	if (cooldownTimer.value) {
		clearTimeout(cooldownTimer.value);
		cooldownTimer.value = null;
	}
});

// Show button only for audience members in projection mode when video is not playing AND not in cooldown
const shouldShowButton = computed(() => {
	const result =
		props.isProjectionMode &&
		!props.isProjectionist &&
		!store.state.room.isPlaying &&
		!isInCooldown.value;

	if (props.isProjectionMode) {
		console.log('[AudiencePlayButton] Visibility check:',
			'isProjectionMode=', props.isProjectionMode,
			'isProjectionist=', props.isProjectionist,
			'isPlaying=', store.state.room.isPlaying,
			'isInCooldown=', isInCooldown.value,
			'shouldShow=', result
		);
	}

	return result;
});

function handlePlayClick() {
	console.log('[AudiencePlayButton] Play button clicked by audience member');
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
