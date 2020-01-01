import assert from 'assert';
import {EventEmitter, once} from 'events';
import {hostname} from 'os';
import mysqlClient from 'mysql2';
import {PMutex} from '@cfware/p-mutex';

function defaultServerID() {
	return hostname()
		.replace(/\..*/u, '')
		.slice(0, 10);
}

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
		this.#serverID = serverID || defaultServerID();
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

	async _checkEnd() {
		try {
			if (this.#wantsEnd && this.#mysql && this.#pending.size === 0) {
				const mysql = this.#mysql;
				this.#mysql = null;

				await mysql.end();
				this.emit('end');
			}
		} catch (error) {
			this.emit('error', error);
		}
	}

	end() {
		if (!this.#wantsEnd) {
			this.#wantsEnd = once(this, 'end');
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

