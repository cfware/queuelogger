'use strict';

const assert = require('assert');
const net = require('net');
const queuelogd = require('..');
const mysqlClient = require('mysql');

const mysql_client_settings = {
	host: process.env.npm_package_config_dbhost,
	user: process.env.npm_package_config_dbprivuser,
	password: process.env.npm_package_config_dbprivpassword,
	database: 'queuemetrics',
};
const mysql = {
	host: process.env.npm_package_config_dbhost,
	user: 'queuelogd',
	password: 'queuelogd',
	database: 'queuemetrics',
};

const time_id = 500000000;
const test_data = [
	'partition',
	'' + time_id,
	'callid',
	'queue',
	'agent',
	'verb',
	'data1',
	'data2',
	'data3',
	'data4',
	'data5',
	'serverid',
];

/* global describe: true, it: true, before: true */
describe('@cfware/queue_log-mysql', function() {
	this.slow(500);
	describe('basic lifecycle', () => {
		it('new config.mysql does not throw', () => assert.ok(new queuelogd({mysql}), 'Failed to create server.'));
		it('closeAll closes connections', done => {
			const server = new queuelogd({mysql});

			server.listen({port: 0}, () => {
				net.createConnection({port: server.address().port})
					.on('connect', () => server.closeAll())
					.on('close', () => done());
			});
		});
		it('listen error', done => {
			const server = new queuelogd({mysql});

			server.on('error', () => done());
			server.listen({host: '256.256.256.256', port: 0});
		});
	});

	describe('mysql tests', function() {
		const expected_data = {};

		before(() => {
			const server = new queuelogd();

			server.columns.forEach((val, idx) => expected_data[val] = test_data[idx]);
		});

		it('bad format disconnects', done => {
			const server = new queuelogd({mysql});

			server.on('close', () => done());
			server.on('listening', () => {
				const client = net.createConnection({port: server.address().port});

				client.on('close', () => server.closeAll());
				client.on('connect', () => client.write('"broken record","should disconnect"\n'));
			});
			server.listen({port: 0});
		});
		it('insert-failure works', done => {
			const server = new queuelogd({mysql: {user: 'invalid user'}});

			server.on('insert-failure', info => assert.deepEqual(info.data, expected_data));
			server.on('listening', () => {
				const client = net.createConnection({port: server.address().port});

				client.on('connect', () => {
					server.on('insert-failure', () => {
						server.close();
						client.end();
					});
					client.write(test_data.join(',') + '\n');
				});
			});
			server.on('close', () => done());
			server.listen({port: 0});
		});

		it('insert works', done => {
			const cli = mysqlClient.createConnection(mysql_client_settings);
			const server = new queuelogd({mysql});

			server.on('insert-failure', info => done(info.error));
			server.on('listening', () => {
				const {port} = server.address();
				const client = net.createConnection({port});

				client.on('connect', () => {
					client.write(test_data.join(',') + '\n');
					client.end();
				});
				client.on('close', () => server.close());
			});
			server.on('shutdown-complete', () => {
				const cols = server.columns.map(id => '`' + id + '`').join(',');
				cli.query(`SELECT ${cols} FROM queue_log WHERE time_id = ?`, time_id, (error, results) => {
					if (error) {
						done(error);
						return;
					}
					assert.deepEqual(results[0], expected_data);
					cli.end();
					done();
				});
			});

			cli.query('DELETE FROM queue_log WHERE time_id = ?', time_id, error => {
				if (error) {
					done(error);
					return;
				}
				server.listen({port: 0});
			});
		});
	});
});
