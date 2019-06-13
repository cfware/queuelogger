import assert from 'assert';
import EventEmitter from 'events';
import {hostname} from 'os';
import mysqlClient from 'mysql2';
import {PMutex} from '@cfware/p-mutex';
import pEvent from 'p-event';

export class QueueLogger extends EventEmitter {
	#pending = new Map();
	#wantsEnd;
	#mysql;
	#partition;
	#serverID;
	#tableName;

	constructor({partition, serverID, tableName, mysql} = {}) {
		super();

		this.#partition = partition || 'P001';
		/* Default is the first part of our hostname only, up to 10 characters. */
		this.#serverID = serverID || hostname().replace(/\..*/, '').slice(0, 10);
		this.#tableName = tableName || 'queue_log';
		this.#mysql = mysqlClient.createPool({
			waitForConnections: true,
			connectionLimit: 10,
			queueLimit: 0,
			database: 'queuemetrics',
			...mysql
		}).promise();
	}

	get partition() {
		return this.#partition;
	}

	get serverID() {
		return this.#serverID;
	}

	get tableName() {
		return this.#tableName;
	}

	_checkEnd() {
		if (this.#wantsEnd && this.#mysql && this.#pending.size === 0) {
			this.#mysql.end().then(() => this.emit('end'));
			this.#mysql = null;
		}
	}

	end() {
		if (!this.#wantsEnd) {
			this.#wantsEnd = pEvent(this, 'end');
			this._checkEnd();
		}

		return this.#wantsEnd;
	}

	async writeEntry(timeID, callID, queue, agent, verb, data1, data2, data3, data4, data5) {
		const {partition, serverID} = this;
		const data = {
			partition,
			time_id: timeID,
			call_id: callID || 'NONE',
			queue: queue || 'NONE',
			agent: agent || 'NONE',
			verb,
			data1,
			data2,
			data3,
			data4,
			data5,
			serverid: serverID
		};
		const key = `${partition}-${timeID}`;

		assert.ok(verb, 'Required parameter verb not provided.');

		if (!this.#mysql) {
			throw new Error('Shutting down.');
		}

		if (!this.#pending.has(key)) {
			const mutex = new PMutex();
			this.#pending.set(key, mutex);
			mutex.on('drain', () => {
				this.#pending.delete(key);
				this._checkEnd();
			});
		}

		const lock = await this.#pending.get(key).lock();

		try {
			const connection = await this.#mysql.getConnection();

			try {
				await connection.query(`INSERT INTO ${this.#tableName} SET ?`, data);
			} finally {
				connection.release();
			}
		} finally {
			lock.release();
		}
	}
}

