<template>
	<div class="video-controls-wrapper">
		<div
			:class="{
				'video-controls': true,
				'in-video': mode == 'in-video',
				'outside-video': mode == 'outside-video',
				'hide': !controlsVisible,
			}"
		>
			<VideoProgressSlider v-if="showAdvancedControls" :current-position="sliderPosition" />
			<div class="controls-row2">
				<!-- Playback controls - Projectionist only -->
				<BasicControls v-if="showAdvancedControls" :current-position="truePosition" />
				<!-- Volume - Always visible -->
				<!-- eslint-disable-next-line vue/no-v-model-argument -->
				<VolumeControl />
				<!-- Timestamp - Always visible for playtime info -->
				<TimestampDisplay :current-position="truePosition" data-cy="timestamp-display" />
				<div class="grow"><!-- Spacer --></div>
				<!-- Captions - Always visible -->
				<ClosedCaptionsSwitcher />
				<!-- Playback speed - Projectionist only -->
				<PlaybackRateSwitcher v-if="showAdvancedControls" />
				<!-- Video settings - Projectionist only -->
				<VideoSettings v-if="showAdvancedControls" />
				<!-- Fullscreen/PiP - Always visible -->
				<PictureInPictureButton />
				<!-- Layout switcher - Projectionist only -->
				<LayoutSwitcher v-if="showAdvancedControls" />
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, watch } from "vue";
import BasicControls from "./BasicControls.vue";
import ClosedCaptionsSwitcher from "./ClosedCaptionsSwitcher.vue";
import LayoutSwitcher from "./LayoutSwitcher.vue";
import TimestampDisplay from "./TimestampDisplay.vue";
import VideoProgressSlider from "./VideoProgressSlider.vue";
import VolumeControl from "./VolumeControl.vue";
import PlaybackRateSwitcher from "./PlaybackRateSwitcher.vue";
import VideoSettings from "./VideoSettings.vue";
import PictureInPictureButton from "./PictureInPictureButton.vue";

const props = withDefaults(
	defineProps<{
		sliderPosition: number;
		truePosition: number;
		controlsVisible: boolean;
		mode: "in-video" | "outside-video";
		isProjectionMode?: boolean;
		isProjectionist?: boolean;
	}>(),
	{
		controlsVisible: false,
		mode: "in-video",
		isProjectionMode: false,
		isProjectionist: false,
	}
);

// Determine if audience-restricted controls should be shown
const showAdvancedControls = computed(() => {
	console.log('[VideoControls] Computing showAdvancedControls:', {
		isProjectionMode: props.isProjectionMode,
		isProjectionist: props.isProjectionist,
		result: !props.isProjectionMode ? true : props.isProjectionist === true
	});

	// If not in projection mode, show everything
	if (!props.isProjectionMode) {
		return true;
	}
	// In projection mode, only projectionist sees advanced controls
	return props.isProjectionist === true;
});

// Watch for prop changes to verify reactivity
watch(() => props.isProjectionist, (newVal, oldVal) => {
	console.log('[VideoControls] isProjectionist changed:', { oldVal, newVal });
});

watch(() => props.isProjectionMode, (newVal, oldVal) => {
	console.log('[VideoControls] isProjectionMode changed:', { oldVal, newVal });
});
</script>

<style lang="scss">
@use "./media-controls.scss";
@use "../../variables.scss";

$media-control-background: var(--v-theme-media-control-background, (0, 0, 0));

.grow {
	flex-grow: 1;
}

.video-controls {
	min-height: media-controls.$video-controls-height;
	transition: all 0.2s;
	z-index: 100;
	padding: 12px;
	width: 100%;

	// Mobile-responsive height and padding
	@media (max-width: variables.$xs-max) {
		min-height: media-controls.$video-controls-height-mobile;
		padding: 16px;
	}

	&.in-video {
		position: absolute;
		bottom: 0;

		background: linear-gradient(
			to top,
			rgba($media-control-background, 0.65),
			rgba($media-control-background, 0)
		);
		transition: all 0.2s;

		&.hide {
			opacity: 0;
			transition: all 0.5s;
			bottom: 0;
		}
	}

	&.outside-video {
		background: rgb($media-control-background);
		border-radius: 0 0 10px 10px;

		&.hide {
			opacity: 0;
			transform: scaleY(0) translateY(-50%);
			transition: all 0.5s;
			height: 0;
		}
	}

	.controls-row2 {
		display: flex;
		align-items: center;
		gap: 8px;

		// Mobile-responsive layout with horizontal scrolling
		@media (max-width: variables.$xs-max) {
			gap: 12px;
			overflow-x: auto;
			flex-wrap: nowrap; // Prevent wrapping to enable horizontal scroll
			padding-right: 8px; // Add padding for scroll area
			
			// Smooth scrolling behavior
			scroll-behavior: smooth;
			-webkit-overflow-scrolling: touch;
			
			// Hide scrollbar but keep functionality
			scrollbar-width: thin;
			&::-webkit-scrollbar {
				height: 3px;
			}
			&::-webkit-scrollbar-track {
				background: rgba(255, 255, 255, 0.1);
				border-radius: 3px;
			}
			&::-webkit-scrollbar-thumb {
				background: rgba(255, 255, 255, 0.3);
				border-radius: 3px;
			}
		}
	}
}
</style>
