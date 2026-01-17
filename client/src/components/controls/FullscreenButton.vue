<template>
	<v-btn
		variant="text"
		icon
		@click="toggleFullscreen()"
		class="media-control"
		:aria-label="$t('room.toggle-fullscreen')"
	>
		<v-icon :icon="mdiFullscreenExit" />
		<v-tooltip activator="parent" location="bottom">
			<span>{{ $t("room.toggle-fullscreen") }}</span>
		</v-tooltip>
	</v-btn>
</template>

<script lang="ts" setup>
import { mdiFullscreenExit } from "@mdi/js";
import { computed, onMounted } from "vue";
import { useRoomKeyboardShortcuts } from "@/util/keyboard-shortcuts";

const isMobile = computed(() => {
	return window.matchMedia("only screen and (max-width: 760px)").matches;
});

function toggleFullscreen() {
	if (document.fullscreenElement) {
		document.exitFullscreen();
	} else {
		document.documentElement.requestFullscreen();
		if (isMobile.value) {
			// force the device into landscape mode to get the user to rotate the device
			// but still allow exiting fullscreen by rotating the device back to portrait
			if (screen.orientation) {
				screen.orientation.lock("landscape").then(() => screen.orientation.unlock());
			}
		}
	}
}

const shortcuts = useRoomKeyboardShortcuts();
onMounted(() => {
	if (shortcuts) {
		shortcuts.bind({ code: "KeyF" }, () => toggleFullscreen());
	} else {
		console.warn("No keyboard shortcuts available");
	}
});
</script>

<style lang="scss">
@use "./media-controls.scss";
</style>
