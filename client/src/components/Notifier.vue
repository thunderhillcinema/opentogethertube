<template>
	<transition-group
		v-if="!shouldHideNotifications"
		appear
		name="toast-list"
		tag="div"
		class="toast-list"
	>
		<div v-for="(t, index) in store.state.toast.notifications" :key="t.id" class="toast-item">
			<ToastNotification :toast="t" :number="index" />
		</div>
		<v-btn
			block
			color="primary"
			key="closeall"
			@click="closeAll"
			v-if="store.state.toast.notifications.length > 1"
			data-cy="toast-close-all"
		>
			{{ $t("common.close-all") }}
		</v-btn>
	</transition-group>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import ToastNotification from "@/components/ToastNotification.vue";
import { useStore } from "@/store";
import toast from "@/util/toast";

const store = useStore();
const route = useRoute();
toast.setStore(store);

// Detect mobile devices (screen width <= 760px)
const isMobile = computed(() => window.matchMedia("only screen and (max-width: 760px)").matches);

// Detect embed mode via query parameter
const isEmbedMode = computed(() => route.query.embed === "true");

// Hide notifications on mobile embed to prevent covering play button
const shouldHideNotifications = computed(() => isMobile.value && isEmbedMode.value);

function closeAll() {
	store.commit("toast/CLEAR_ALL_TOASTS");
}
</script>

<style lang="scss" scoped>
.toast-list {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	position: fixed;
	padding: 0;
	bottom: 0;
	right: 0;
	pointer-events: none;
	z-index: 1000;

	.toast,
	button {
		pointer-events: auto;
	}
}

// define the animations for individual toasts
.toast-list-move {
	transition: all 0.25s ease;
}

.toast-list-enter-active,
.toast-list-leave-active {
	transition: all 0.25s;
}
.toast-list-enter,
.toast-list-leave-to {
	opacity: 0;
	transform: translateY(50px);
	// bottom: -50px;
}
</style>
