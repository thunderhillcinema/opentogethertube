import { describe, expect, it } from "vitest";
import TimestampDisplay from "@/components/controls/TimestampDisplay.vue";
import { mountComponent } from "./component-test-utils";

/**
 * The timestamp reads "0:00 / 3:45" — one reading, and it must lay out as one
 * unbreakable box.
 *
 * It used to be three inline children of a plain block, separated by the
 * template's own indentation whitespace, inside a flex row whose items shrink
 * by default. A crowded controls row squeezed the box until the time broke
 * across two or three lines and the whole row grew taller to fit it — worst on
 * the narrow projection embed, where the row is tightest.
 *
 * The layout half of the fix lives in CSS and jsdom has no layout engine, so it
 * cannot be asserted here. What CAN be asserted is the half a future tidy-up
 * would silently undo: the tags are deliberately butted together (`/><span`) so
 * that no whitespace text node survives between the parts to offer the browser
 * a break opportunity. Prettier is happy either way, so nothing else guards it.
 */
describe("TimestampDisplay component", () => {
	it("renders the position, the separator and the length", () => {
		const { wrapper } = mountComponent(TimestampDisplay, { props: { currentPosition: 0 } });

		expect(wrapper.find(".editable").exists()).toBe(true);
		expect(wrapper.get(".timestamp-separator").text()).toBe("/");
		expect(wrapper.find(".video-length").exists()).toBe(true);
	});

	it("carries no whitespace text node between the parts", () => {
		const { wrapper } = mountComponent(TimestampDisplay, { props: { currentPosition: 0 } });

		const textNodes = Array.from(wrapper.element.childNodes).filter(
			node => node.nodeType === Node.TEXT_NODE,
		);

		expect(textNodes.map(node => node.textContent)).toEqual([]);
	});

	it("states the length without padding it in whitespace", () => {
		const { wrapper } = mountComponent(TimestampDisplay, { props: { currentPosition: 0 } });
		const length = wrapper.get(".video-length").element.textContent ?? "";

		expect(length).toBe(length.trim());
	});

	it("stays one box under a squeezing flex row", () => {
		const { wrapper } = mountComponent(TimestampDisplay, { props: { currentPosition: 0 } });

		// The class the layout rules hang off — losing it is losing the fix.
		expect(wrapper.classes()).toContain("timestamp-display");
	});
});
