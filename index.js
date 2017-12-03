'use strict';

const assert = require('assert');
const events = require('events');
const {hostname} = require('os');
const mysqlClient = require('mysql');
const PMutex = require('@cfware/p-mutex');
const pEvent = require('p-event');

class queue_log extends events {
	constructor({partition, serverid, table_name, mysql} = {}) {
		super();

		this.partition = partition || 'P001';
		/* Default is the first part of our hostname only, up to 10 characters. */
		this.serverid = serverid || hostname().replace(/\..*/, '').slice(0, 10);
		this.table_name = table_name || 'queue_log';
		this.mysql = mysqlClient.createPool({
			acquireTimeout: 10000,
			waitForConnections: true,
			connectionLimit: 10,
			queueLimit: 0,
			database: 'queuemetrics',
			...mysql,
		});
		this.pendingCount = 0;
		this.pending = {};
		this.wantsEnd = null;
	}

	checkEnd() {
		if (this.wantsEnd && this.mysql && !this.pendingCount) {
			this.mysql.end(() => this.emit('end'));
			this.mysql = null;
		}
	}

	end() {
		if (!this.wantsEnd) {
			this.wantsEnd = pEvent(this, 'end');
			this.checkEnd();
		}

		return this.wantsEnd;
	}

	_getConnection() {
		return new Promise((resolve, reject) => {
			this.mysql.getConnection((err, connection) => {
				if (err) {
					reject(err);
				} else {
					resolve(connection);
				}
			});
		});
	}

	_doQuery(connection, data) {
		return new Promise((resolve, reject) => {
			connection.query(`INSERT INTO ${this.table_name} SET ?`, data, error => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	async _actualInsert(key, data) {
		if (!(key in this.pending)) {
			this.pendingCount++;
			this.pending[key] = new PMutex();
			this.pending[key].on('drain', () => {
				delete this.pending[key];
				this.pendingCount--;
				this.checkEnd();
			});
		}

		const lock = await this.pending[key].lock();

		try {
			const connection = await this._getConnection();

			try {
				await this._doQuery(connection, data);
			} finally {
				connection.release();
			}
		} finally {
			lock.release();
		}
	}

	async writeEntry(time_id, call_id, queue, agent, verb, data1, data2, data3, data4, data5) {
		const {partition, serverid} = this;
		const data = {
			partition,
			time_id,
			call_id: call_id || 'NONE',
			queue: queue || 'NONE',
			agent: agent || 'NONE',
			verb,
			data1,
			data2,
			data3,
			data4,
			data5,
			serverid,
		};
		const key = `${partition}-${time_id}`;

		assert.ok(verb, 'Required parameter verb not provided.');

		if (!this.mysql) {
			throw new Error('Shutting down.');
		}

		await this._actualInsert(key, data);
	}
}

module.exports = queue_log;
