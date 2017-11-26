'use strict';

const net = require('net');
const mysql = require('mysql');
const csv = require('csv-parse');

class queuelogd extends net.Server {
	constructor(config) {
		super();

		this._config = {
			table: 'queue_log',
			columns: [
				'partition', 'time_id', 'call_id',
				'queue', 'agent', 'verb', 'data1', 'data2', 'data3', 'data4', 'data5',
				'serverid',
			],
			...config,
		};
		this._closing = false;
		this._queueSize = 0;
		this._sockets = [];
		this._pool = mysql.createPool({
			acquireTimeout: 10000,
			waitForConnections: true,
			connectionLimit: 10,
			queueLimit: 0,
			...this._config.mysql,
		});
		this
			.on('close', () => this._setClosing())
			.on('error', () => this._setClosing())
			.on('connection', socket => this._newConnection(socket));
	}

	get columns() {
		return this._config.columns;
	}

	closeAll() {
		this.close();
		this._sockets.forEach(socket => socket.end());
	}

	_setClosing() {
		this._closing = true;
		this._shutdownCheck();
	}

	_shutdownCheck() {
		if (this._closing && !this._queueSize && !this._sockets.length) {
			this._pool.end();
			this._closing = false;
			this.emit('shutdown-complete');
		}
	}

	_newConnection(socket) {
		this._sockets.push(socket);
		socket
			.on('finish', () => this._endConnection(socket))
			.setEncoding('utf8')
			.pipe(csv({columns: this._config.columns, rowDelimiter: '\n'}))
			.on('error', () => socket.end())
			.on('data', data => this._dataReceived(socket, data));
	}

	_endConnection(socket) {
		this._sockets.splice(this._sockets.indexOf(socket), 1);
		this._shutdownCheck();
	}

	_dataReceived(socket, data) {
		this._queueSize += 1;
		this._pool.query(`INSERT INTO ${this._config.table} SET ?`, data, error => {
			if (error) {
				this.emit('insert-failure', {data, error});
			}
			this._queueSize -= 1;
			this._shutdownCheck();
		});
	}
}

module.exports = queuelogd;
