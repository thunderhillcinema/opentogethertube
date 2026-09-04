<template>
	<div class="media-control timestamp-display">
		<ClickToEdit
			:model-value="currentPosition"
			@change="value => roomapi.seek(value)"
			:value-formatter="secondsToTimestamp"
			:value-parser="timestampToSeconds"
		/><span class="timestamp-separator">/</span
		><span class="video-length">{{ lengthDisplay }}</span>
	</div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useStore } from "@/store";
import { useConnection } from "@/plugins/connection";
import { useRoomApi } from "@/util/roomapi";
import { secondsToTimestamp, timestampToSeconds } from "@/util/timestamp";
import ClickToEdit from "../ClickToEdit.vue";

withDefaults(
	defineProps<{
		currentPosition: number;
	}>(),
	{
		currentPosition: 0,
	},
);

const store = useStore();
const roomapi = useRoomApi(useConnection());

const lengthDisplay = computed(() => {
	const length = store.state.room.currentSource?.length ?? 0;
	return secondsToTimestamp(length);
});
</script>

<!-- biome-ignore lint/nursery/useScopedStyles: biome migration -->
<style lang="scss">
@use "./media-controls.scss";

// THC fork: the timestamp is "0:00 / 3:45" — one reading, so it lays out as one
// unbreakable box.
//
// It was three INLINE children of a plain block `.media-control`, separated by
// template whitespace, in a flex row whose items shrink by default. So a
// crowded controls row squeezed this box until the time broke across two or
// three lines, and the whole row grew taller to fit it — worse on the narrow
// projection embed, where the row is tightest.
//
// Three things hold it on one line, and all three are needed: `inline-flex`
// stops the children being wrappable inline boxes, `white-space: nowrap` stops
// a break inside any one of them, and `flex-shrink: 0` stops the row squeezing
// the box below its content in the first place. `.controls-row2` already
// scrolls horizontally on mobile rather than wrapping, so refusing to shrink
// is what that layout expects, not a fight with it.
.timestamp-display {
	display: inline-flex;
	align-items: center;
	flex-shrink: 0;
	white-space: nowrap;
	line-height: 1;

	// The current position ticks every 250ms. With proportional digits each new
	// number is a different width, so the box breathes and everything right of
	// it twitches once a second. Tabular figures are fixed-width by definition.
	font-variant-numeric: tabular-nums;

	.timestamp-separator {
		// The separator carries its own spacing because the markup deliberately
		// has none: the tags are butted together (`/><span`) so no whitespace
		// text node survives between them to offer a break opportunity.
		padding: 0 4px;
		opacity: 0.7;
	}
}
</style>
