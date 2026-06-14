<template>
	<TooltipProvider :delay-duration="200">
		<div id="app" class="relative flex min-h-screen flex-col bg-background text-foreground">
			<!-- MARQUEE HEADER -->
			<!-- THC fork: hidden entirely in projection-booth mode -->
			<header
				v-show="!fullscreen && !isProjectionMode"
				class="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md"
			>
				<div class="flex h-16 items-center gap-3 px-4 md:px-6">
					<!-- mobile menu -->
					<!-- THC fork: in embed mode, redirect to full site instead of opening drawer -->
					<Button
						variant="ghost"
						size="icon"
						class="lg:hidden"
						:aria-label="$t('common.nav-menu')"
						@click="isEmbedMode ? redirectToFullSite() : (drawer = true)"
					>
						<Icon :icon="mdiMenu" class="size-6" />
					</Button>

					<!-- THC fork: in embed mode the logo opens the full site in a new tab -->
					<router-link v-if="!isEmbedMode" to="/" class="group flex items-center gap-3">
						<img :src="logoUrl" alt="" class="size-8" />
						<span
							class="ott-text-scanlines inline-block font-display text-2xl leading-none tracking-wide text-primary text-shadow-glow-primary light:text-shadow-none marquee-flicker md:text-3xl"
							data-text="OpenTogetherTube"
						>
							OpenTogetherTube
						</span>
					</router-link>
					<a
						v-else
						class="group flex cursor-pointer items-center gap-3"
						@click="redirectToFullSite"
					>
						<img :src="logoUrl" alt="" class="size-8" />
						<span
							class="ott-text-scanlines inline-block font-display text-2xl leading-none tracking-wide text-primary text-shadow-glow-primary light:text-shadow-none marquee-flicker md:text-3xl"
							data-text="OpenTogetherTube"
						>
							OpenTogetherTube
						</span>
					</a>

					<nav v-if="display.lgAndUp.value" class="ml-6 flex items-center gap-1">
						<!-- THC fork: browse redirects to full site in embed mode -->
						<Button v-if="!isEmbedMode" variant="ghost" size="sm" as-child>
							<router-link to="/rooms">{{ $t("nav.browse") }}</router-link>
						</Button>
						<Button v-else variant="ghost" size="sm" @click="redirectToFullSite">
							{{ $t("nav.browse") }}
						</Button>
						<Button v-if="store.state.user" variant="ghost" size="sm" as-child>
							<router-link to="/my-rooms">{{ $t("nav.my-rooms") }}</router-link>
						</Button>
						<Button variant="ghost" size="sm" as-child>
							<a
								href="https://github.com/dyc3/opentogethertube/discussions/830"
								target="_blank"
								>{{ $t("nav.faq") }}</a
							>
						</Button>
						<Button variant="ghost" size="sm" as-child>
							<a
								href="https://github.com/dyc3/opentogethertube/issues/new/choose"
								target="_blank"
							>
								<Icon :icon="mdiBug" />
								{{ $t("nav.bug") }}
							</a>
						</Button>
						<Button variant="ghost" size="sm" as-child>
							<a href="https://github.com/sponsors/dyc3" target="_blank">
								<Icon :icon="mdiHeart" class="text-primary" />
								{{ $t("nav.support") }}
							</a>
						</Button>
					</nav>

					<div class="flex-1"></div>

					<div v-if="display.mdAndUp.value" class="flex items-center gap-2">
						<!-- THC fork: create redirects to full site in embed mode -->
						<DropdownMenu v-if="!isEmbedMode">
							<DropdownMenuTrigger as-child>
								<Button variant="marquee" size="sm">
									<Icon :icon="mdiPlusBox" />
									{{ $t("nav.create.title") }}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" class="w-72">
								<NavCreateRoom
									as-menu-items
									@createtemp="createTempRoom"
									@createperm="showCreateRoomForm = true"
								/>
							</DropdownMenuContent>
						</DropdownMenu>
						<Button v-else variant="marquee" size="sm" @click="redirectToFullSite">
							<Icon :icon="mdiPlusBox" />
							{{ $t("nav.create.title") }}
						</Button>
						<!-- THC fork: user + locale redirect to full site in embed mode -->
						<template v-if="!isEmbedMode">
							<NavUser @login="showLogin = true" @logout="logout" />
							<LocaleSelector />
						</template>
						<template v-else>
							<Button variant="ghost" size="sm" @click="redirectToFullSite">
								{{ store.state.user ? store.state.user.username : $t("nav.login") }}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								class="min-w-12"
								@click="redirectToFullSite"
							>
								{{ getCurrentLocaleFlag() }}
							</Button>
						</template>
					</div>
				</div>
			</header>

			<!-- MOBILE DRAWER -->
			<!-- THC fork: drawer disabled in embed + projection modes -->
			<Sheet v-if="!isEmbedMode && !isProjectionMode" v-model:open="drawer">
				<SheetContent side="left" class="w-72 bg-background">
					<SheetHeader>
						<SheetTitle
							class="font-display text-2xl text-primary text-shadow-glow-primary light:text-shadow-none"
						>
							Menu
						</SheetTitle>
					</SheetHeader>
					<nav class="flex flex-col gap-1 px-2">
						<router-link class="ott-drawer-link" to="/" @click="drawer = false">
							{{ $t("nav.home") }}
						</router-link>
						<router-link class="ott-drawer-link" to="/rooms" @click="drawer = false">
							{{ $t("nav.browse") }}
						</router-link>
						<router-link
							v-if="store.state.user"
							class="ott-drawer-link"
							to="/my-rooms"
							@click="drawer = false"
						>
							{{ $t("nav.my-rooms") }}
						</router-link>
						<a
							class="ott-drawer-link"
							href="https://github.com/dyc3/opentogethertube/discussions/830"
							target="_blank"
							>{{ $t("nav.faq") }}</a
						>
						<a
							class="ott-drawer-link"
							href="https://github.com/dyc3/opentogethertube/issues/new/choose"
							target="_blank"
						>
							<Icon :icon="mdiBug" class="size-4" /> {{ $t("nav.bug") }}
						</a>
						<a
							class="ott-drawer-link"
							href="https://github.com/sponsors/dyc3"
							target="_blank"
						>
							<Icon :icon="mdiHeart" class="size-4 text-primary" />
							{{ $t("nav.support") }}
						</a>
						<Separator class="my-2" />
						<NavCreateRoom
							@createtemp="
								() => {
									drawer = false;
									createTempRoom();
								}
							"
							@createperm="
								() => {
									drawer = false;
									showCreateRoomForm = true;
								}
							"
						/>
					</nav>
					<SheetFooter class="mt-auto flex-row items-center gap-2">
						<NavUser @login="showLogin = true" @logout="logout" />
						<LocaleSelector />
					</SheetFooter>
				</SheetContent>
			</Sheet>

			<!-- MAIN -->
			<main class="relative flex-1">
				<router-view />
			</main>

			<!-- create room dialog -->
			<Dialog v-model:open="showCreateRoomForm">
				<DialogContent class="max-w-xl gap-0 p-0 sm:max-w-xl">
					<DialogTitle class="sr-only">{{
						$t("create-room-form.card-title")
					}}</DialogTitle>
					<CreateRoomForm
						@roomCreated="showCreateRoomForm = false"
						@cancel="showCreateRoomForm = false"
					/>
				</DialogContent>
			</Dialog>

			<!-- login dialog -->
			<Dialog v-model:open="showLogin">
				<DialogContent class="max-w-xl gap-0 p-0 sm:max-w-xl">
					<DialogTitle class="sr-only">{{ $t("login-form.login") }}</DialogTitle>
					<LogInForm @shouldClose="showLogin = false" />
				</DialogContent>
			</Dialog>

			<!-- room creation loading overlay -->
			<Transition name="ott-overlay">
				<div
					v-if="store.state.misc.isLoadingCreateRoom"
					class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/90 backdrop-blur-sm"
				>
					<Spinner class="size-12 text-primary" />
					<p class="label-mono text-muted">{{ $t("nav.create.title") }}…</p>
					<Button variant="outline" size="lg" @click="cancelRoom">
						{{ $t("common.cancel") }}
					</Button>
				</div>
			</Transition>

			<Notifier />
		</div>
	</TooltipProvider>
</template>

<script lang="ts">
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDisplay } from "@/components/ui/useDisplay";
import { mdiBug, mdiHeart, mdiPlusBox, mdiMenu } from "@mdi/js";
import { defineComponent, onMounted, ref, computed } from "vue";
import { API } from "@/common-http";
import CreateRoomForm from "@/components/CreateRoomForm.vue";
import LogInForm from "@/components/LogInForm.vue";
import NavUser from "@/components/navbar/NavUser.vue";
import NavCreateRoom from "@/components/navbar/NavCreateRoom.vue";
import Notifier from "@/components/Notifier.vue";
import { loadLanguageAsync } from "@/i18n";
import { createRoomHelper } from "@/util/roomcreator";
import { useRouter, useRoute } from "vue-router";
import logoUrl from "@/assets/logo.svg";
import { useStore } from "@/store";
import LocaleSelector from "@/components/navbar/LocaleSelector.vue";

// biome-ignore lint/nursery/noVueOptionsApi: TODO: convert to setup
const App = defineComponent({
	name: "app",
	components: {
		CreateRoomForm,
		LogInForm,
		NavUser,
		NavCreateRoom,
		Notifier,
		LocaleSelector,
		Button,
		Dialog,
		DialogContent,
		DialogTitle,
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuTrigger,
		Icon,
		Separator,
		Sheet,
		SheetContent,
		SheetFooter,
		SheetHeader,
		SheetTitle,
		Spinner,
		TooltipProvider,
	},
	setup() {
		const store = useStore();
		const route = useRoute();
		const display = useDisplay();

		const showCreateRoomForm = ref(false);
		const showLogin = ref(false);
		const drawer = ref(false);

		// THC fork: embed mode (?embed=true) — OTT is iframed into thunderhillcinema,
		// so nav actions open the full site in a new tab instead of navigating the frame.
		const isEmbedMode = computed(() => route.query.embed === "true");

		// THC fork: projection-booth mode (?projection=true) — hide all site chrome.
		const isProjectionMode = computed(() => route.query.projection === "true");

		const logout = async () => {
			const res = await API.post("/user/logout");
			if (res.data.success) {
				store.commit("LOGOUT");
			}
		};

		const setLocale = async (locale: string) => {
			await loadLanguageAsync(locale);
			store.commit("settings/UPDATE", { locale });
		};

		const cancelRoom = () => {
			store.commit("misc/CANCELLED_ROOM_CREATION");
		};

		const createTempRoom = async () => {
			await createRoomHelper(store);
		};

		// THC fork: open the canonical full site in a new tab (used by embed-mode nav).
		const redirectToFullSite = () => {
			window.open("https://opentogethertube.com", "_blank");
		};

		// THC fork: flag shown on the embed-mode locale button (LocaleSelector is replaced
		// by a simple redirect button in embed mode).
		const getCurrentLocaleFlag = () => {
			const localeMap: Record<string, string> = {
				"en": "🇺🇸",
				"de": "🇩🇪",
				"fr": "🇫🇷",
				"ru": "🇷🇺",
				"es": "🇪🇸",
				"pt-br": "🇧🇷",
			};
			return localeMap[store.state.settings.locale] || "🇺🇸";
		};

		onMounted(async () => {
			const router = useRouter();

			// THC fork: suppress scrollbars when chrome-less (projection/embed).
			// .scrollbarBeGone is defined globally in styles/theme.css.
			if (isProjectionMode.value || isEmbedMode.value) {
				document.querySelector("html")?.classList.add("scrollbarBeGone");
				document.querySelector("body")?.classList.add("scrollbarBeGone");
			}

			store.subscribe(mutation => {
				if (mutation.type === "misc/ROOM_CREATED") {
					try {
						router.push(`/room/${mutation.payload.name}`);
					} catch (e) {
						if (e.name !== "NavigationDuplicated") {
							throw e;
						}
					}
				}
			});

			document.addEventListener("fullscreenchange", () => {
				if (document.fullscreenElement) {
					store.commit("SET_FULLSCREEN", true);
					document.querySelector("html")?.classList.add("scrollbarBeGone");
				} else {
					store.commit("SET_FULLSCREEN", false);
					document.querySelector("html")?.classList.remove("scrollbarBeGone");
				}
			});

			await store.dispatch("settings/load");
			await store.dispatch("users/getNewToken");
			await setLocale(store.state.settings.locale);

			// ask the server if we are logged in or not, and update the client to reflect that status.
			const resp = await API.get("/user");
			if (resp.data.loggedIn) {
				const user = resp.data;
				delete user.loggedIn;
				store.commit("LOGIN", user);
			}
		});

		const fullscreen = computed(() => store.state.fullscreen);

		return {
			showCreateRoomForm,
			showLogin,
			drawer,
			fullscreen,
			display,
			isEmbedMode,
			isProjectionMode,
			logout,
			setLocale,
			cancelRoom,
			createTempRoom,
			redirectToFullSite,
			getCurrentLocaleFlag,
			logoUrl,
			store,
			mdiBug,
			mdiHeart,
			mdiPlusBox,
			mdiMenu,
		};
	},
});

// biome-ignore lint/nursery/noVueOptionsApi: TODO: convert to setup
export default App;
</script>

<style scoped>
.ott-drawer-link {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	border-radius: var(--radius);
	padding: 0.55rem 0.65rem;
	font-family: var(--font-mono);
	font-size: 0.8rem;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--muted-foreground);
	transition: all 0.15s ease;
}
.ott-drawer-link:hover {
	background: var(--surface-2);
	color: var(--primary);
}
.ott-drawer-link.router-link-exact-active {
	color: var(--primary);
}

.ott-overlay-enter-active,
.ott-overlay-leave-active {
	transition: opacity 0.25s ease;
}
.ott-overlay-enter-from,
.ott-overlay-leave-to {
	opacity: 0;
}
</style>
