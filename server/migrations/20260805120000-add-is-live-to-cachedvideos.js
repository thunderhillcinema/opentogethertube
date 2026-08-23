"use strict";

/**
 * Adds `isLive` to CachedVideos so that a live source surviving a cache round-trip is still
 * recognised as live. Without it a cached live video comes back looking like VOD, and the room
 * auto-advances off it (dyc3/opentogethertube#246).
 *
 * Nullable with no default, deliberately: null means "this row predates live detection / the
 * adapter never reported either way", which is distinct from a positive `false`. Existing rows
 * are therefore left untouched and are re-populated by the adapter on their next fetch.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn("CachedVideos", "isLive", {
			type: Sequelize.BOOLEAN,
			allowNull: true,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeColumn("CachedVideos", "isLive");
	},
};
