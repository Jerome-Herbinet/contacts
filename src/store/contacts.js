/**
 * @copyright Copyright (c) 2018 John Molakvoæ <skjnldsv@protonmail.com>
 *
 * @author John Molakvoæ <skjnldsv@protonmail.com>
 *
 * @license GNU AGPL version 3 or any later version
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 */

import Vue from 'vue'
import ICAL from 'ical.js'
import Contact from '../models/contact'

const state = {
	// Using objects for performance
	// https://jsperf.com/ensure-unique-id-objects-vs-array
	contacts: {},
	sortedContacts: [],
	orderKey: 'displayName'
}

const mutations = {

	/**
	 * Store contacts into state
	 *
	 * @param {Object} state Default state
	 * @param {Array} contacts Contacts
	 */
	appendContacts(state, contacts = []) {
		state.contacts = contacts.reduce(function(list, contact) {
			if (contact instanceof Contact) {
				Vue.set(list, contact.key, contact)
			} else {
				console.error('Wrong contact object', contact)
			}
			return list
		}, state.contacts)
	},

	/**
	 * Delete a contact from the global contacts list
	 *
	 * @param {Object} state the store data
	 * @param {Contact} contact the contact to delete
	 */
	deleteContact(state, contact) {
		if (state.contacts[contact.key] && contact instanceof Contact) {

			let index = state.sortedContacts.findIndex(search => search.key === contact.key)
			state.sortedContacts.splice(index, 1)
			Vue.delete(state.contacts, contact.key)

		} else {
			console.error('Error while deleting the following contact', contact)
		}
	},

	/**
	 * Insert new contact into sorted array
	 *
	 * @param {Object} state the store data
	 * @param {Contact} contact the contact to add
	 */
	addContact(state, contact) {
		if (contact instanceof Contact) {

			let sortedContact = {
				key: contact.key,
				value: contact[state.orderKey]
			}

			// Not using sort, splice has far better performances
			// https://jsperf.com/sort-vs-splice-in-array
			for (var i = 0, len = state.sortedContacts.length; i < len; i++) {
				var nameA = state.sortedContacts[i].value.toUpperCase()	// ignore upper and lowercase
				var nameB = sortedContact.value.toUpperCase()			// ignore upper and lowercase
				if (nameA.localeCompare(nameB) >= 0) {
					state.sortedContacts.splice(i, 0, sortedContact)
					break
				} else if (i + 1 === len) {
					// we reached the end insert it now
					state.sortedContacts.push(sortedContact)
				}
			}

			// sortedContact is empty, just push it
			if (state.sortedContacts.length === 0) {
				state.sortedContacts.push(sortedContact)
			}

			// default contacts list
			Vue.set(state.contacts, contact.key, contact)

		} else {
			console.error('Error while adding the following contact', contact)
		}
	},

	/**
	 * Update a contact
	 *
	 * @param {Object} state the store data
	 * @param {Contact} contact the contact to update
	 */
	updateContact(state, contact) {
		if (state.contacts[contact.key] && contact instanceof Contact) {

			// replace contact object data
			state.contacts[contact.key].updateContact(contact.jCal)
			let sortedContact = state.sortedContacts.find(search => search.key === contact.key)

			// has the sort key changed for this contact ?
			let hasChanged = sortedContact.value !== contact[state.orderKey]
			if (hasChanged) {
				// then update the new data
				sortedContact.value = contact[state.orderKey]
				// and then we sort again
				state.sortedContacts
					.sort((a, b) => {
						var nameA = a.value.toUpperCase() // ignore upper and lowercase
						var nameB = b.value.toUpperCase() // ignore upper and lowercase
						return nameA.localeCompare(nameB)
					})
			}

		} else {
			console.error('Error while replacing the following contact', contact)
		}
	},

	/**
	 * Update a contact
	 *
	 * @param {Object} state the store data
	 * @param {Contact} contact the contact to update
	 */
	updateContactAddressbook(state, { contact, addressbook }) {
		if (state.contacts[contact.key] && contact instanceof Contact) {

			// replace contact object data
			state.contacts[contact.key].updateAddressbook(addressbook)

		} else {
			console.error('Error while replacing the addressbook of following contact', contact)
		}
	},

	/**
	 * Order the contacts list. Filters have terrible performances.
	 * We do not want to run the sorting function every time.
	 * Let's only run it on additions and create an index
	 *
	 * @param {Object} state the store data
	 */
	sortContacts(state) {
		state.sortedContacts = Object.values(state.contacts)
			// exclude groups
			.filter(contact => contact.kind !== 'group')
			.map(contact => { return { key: contact.key, value: contact[state.orderKey] } })
			.sort((a, b) => {
				var nameA = a.value.toUpperCase() // ignore upper and lowercase
				var nameB = b.value.toUpperCase() // ignore upper and lowercase
				let score = nameA.localeCompare(nameB)
				// if equal, fallback to the key
				return score !== 0
					? score
					: a.key.localeCompare(b.key)
			})
	},

	/**
	 * Set the order key
	 *
	 * @param {Object} state the store data
	 * @param {string} [orderKey='displayName'] the order key to sort by
	 */
	setOrder(state, orderKey = 'displayName') {
		state.orderKey = orderKey
	}
}

const getters = {
	getContacts: state => state.contacts,
	getSortedContacts: state => state.sortedContacts,
	getContact: (state) => (uid) => state.contacts[uid],
	getOrderKey: state => state.orderKey
}

const actions = {

	/**
	 * Delete a contact from the list and from the associated addressbook
	 *
	 * @param {Object} context the store mutations
	 * @param {Contact} contact the contact to delete
	 */
	async deleteContact(context, contact) {
		// only local delete if the contact doesn't exists on the server
		if (contact.dav) {
			await contact.dav.delete()
				.catch((error) => {
					console.error(error)
					OC.Notification.showTemporary(t('contacts', 'An error occurred'))
				})
		}
		context.commit('deleteContact', contact)
		context.commit('deleteContactFromAddressbook', contact)
	},

	/**
	 * Add a contact to the list and to the associated addressbook
	 *
	 * @param {Object} context the store mutations
	 * @param {Contact} contact the contact to delete
	 */
	async addContact(context, contact) {
		await context.commit('addContact', contact)
		await context.commit('addContactToAddressbook', contact)
	},

	/**
	 * Replac a contact by this new object
	 *
	 * @param {Object} context the store mutations
	 * @param {Contact} contact the contact to update
	 * @returns {Promise}
	 */
	async updateContact(context, contact) {
		let vData = ICAL.stringify(contact.vCard.jCal)

		// if no dav key, contact does not exists on server
		if (!contact.dav) {
			// create contact
			await contact.addressbook.dav.createVCard(vData)
				.then((response) => {
					contact.dav = response
				})
				.catch((error) => { throw error })
		}

		contact.dav.data = vData
		return contact.dav.update()
			.then((response) => context.commit('updateContact', contact))
			.catch((error) => { throw error })
	},

	/**
	 * Fetch the full vCard from the dav server
	 *
	 * @param {Object} context the store mutations
	 * @param {Contact} contact the contact to fetch
	 * @returns {Promise}
	 */
	async fetchFullContact(context, contact) {
		return contact.dav.fetchCompleteData()
			.then(() => {
				let newContact = new Contact(contact.dav.data, contact.addressbook, contact.dav.url, contact.dav.etag)
				context.commit('updateContact', newContact)
			})
	}
}

export default { state, mutations, getters, actions }
