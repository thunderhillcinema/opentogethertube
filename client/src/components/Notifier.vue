<template>
	<transition-group
		v-if="!shouldHideNotifications"
		appear
		tag="div"
		class="pointer-events-none fixed bottom-0 right-0 z-1000 flex flex-col items-end p-0"
		move-class="transition-all duration-[250ms] ease-in-out"
		enter-active-class="transition-all duration-[250ms]"
		leave-active-class="transition-all duration-[250ms]"
		enter-from-class="translate-y-[50px] opacity-0"
		leave-to-class="translate-y-[50px] opacity-0"
	>
		<div
			v-for="(t, index) in store.state.toast.notifications"
			:key="t.id"
			class="pointer-events-auto"
		>
			<ToastNotification :toast="t" :number="index" />
		</div>
		<Button
			variant="default"
			class="pointer-events-auto mx-2 mb-2 w-full max-w-2xl"
			key="closeall"
			@click="closeAll"
			v-if="store.state.toast.notifications.length > 1"
			data-cy="toast-close-all"
		>
			{{ $t("common.close-all") }}
		</Button>
	</transition-group>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Button } from "@/components/ui/button";
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

// Detect projection mode via query parameter
const isProjectionMode = computed(() => route.query.projection === "true");

// Hide notifications on mobile embed OR projection mode
const shouldHideNotifications = computed(
	() => (isMobile.value && isEmbedMode.value) || isProjectionMode.value,
);

function closeAll() {
	store.commit("toast/CLEAR_ALL_TOASTS");
}
</script>
