'use strict';

const assert = require('assert');
const QueueLog = require('..');
const {hostname} = require('os');
const mysql = require('mysql');
const {describe, before, after, it} = require('mocha');

const mysqlClientSettings = {
	host: process.env.npm_package_config_dbhost,
	user: process.env.npm_package_config_dbprivuser,
	password: process.env.npm_package_config_dbprivpassword,
	database: 'queuemetrics'
};

const partition = 'P001';
const timeID = 500000000;
const callID = 'call_id';
const queue = 'queue';
const agent = 'agent';
const verb = 'verb';
const data1 = 'data1';
const data2 = 'data2';
const data3 = 'data3';
const data4 = 'data4';
const data5 = 'data5';
/* The mysql field is only 10 characters, trim this so we check for what mysql can
 * contain in the case of a-really-long-hostname.example.com. */
const serverID = hostname().replace(/\..*/, '').slice(0, 10);

const settings = {
	mysql: {
		host: process.env.npm_package_config_dbhost,
		user: 'queuelogd',
		password: 'queuelogd'
	}
};
const testObject1 = {
	partition,
	time_id: timeID,
	call_id: callID,
	queue,
	agent,
	verb,
	data1,
	data2,
	data3,
	data4,
	data5,
	serverid: serverID
};
const testData1 = [timeID, callID, queue, agent, verb, data1, data2, data3, data4, data5];
const testObject2 = {
	...testObject1,
	call_id: 'NONE',
	queue: 'NONE',
	agent: 'NONE',
	unique_row_count: 2
};

describe('queuelogger', () => {
	/* First run takes longer than normal, extra create to avoid slowness warnings. */
	before(() => new QueueLog());

	it('new', () => assert.ok(new QueueLog()));
	it('new contains mysql', () => assert.ok((new QueueLog()).mysql));

	describe('constructor defaults', () => {
		const ql = new QueueLog();

		it('partition', () => assert.strictEqual(ql.partition, partition));
		it('tableName', () => assert.strictEqual(ql.tableName, 'queue_log'));
		it('serverID', () => assert.strictEqual(ql.serverID, serverID));
	});

	describe('constructor arguments', () => {
		const ql = new QueueLog({
			partition: 'P002',
			tableName: 'testtable',
			serverID: 'testsrv'
		});

		it('partition', () => assert.strictEqual(ql.partition, 'P002'));
		it('tableName', () => assert.strictEqual(ql.tableName, 'testtable'));
		it('serverID', () => assert.strictEqual(ql.serverID, 'testsrv'));
	});

	describe('insert', () => {
		it('writeEntry after end throws', async () => {
			const ql = new QueueLog();

			await ql.end();
			try {
				await ql.writeEntry(...testData1);
				assert.ok(false, 'Expected an error');
			} catch (error) {
			}
		});

		it('invalid user throws', async () => {
			const ql = new QueueLog({mysql: {user: 'invalid user'}});

			try {
				await ql.writeEntry(...testData1);
				assert.ok(false, 'Expected an error');
			} catch (error) {
			}
			await ql.end();
		});

		it('unknown tableName throws', async () => {
			const ql = new QueueLog({
				...settings,
				tableName: 'unknown_table'
			});

			try {
				await ql.writeEntry(...testData1);
				assert.ok(false, 'Expected an error');
			} catch (error) {
			}
			await ql.end();
		});

		it('success with auto_inc order', async () => {
			const cli = mysql.createConnection(mysqlClientSettings);
			const pQuery = (cli, ...args) => new Promise((resolve, reject) => {
				cli.query(...args, (error, results) => {
					if (error) {
						reject(error);
					} else {
						resolve(results);
					}
				});
			});
			const ql = new QueueLog(settings);

			after(() => {
				cli.end();
				ql.end();
			});

			/* Clear records from previous test. */
			await pQuery(cli, 'DELETE FROM queue_log WHERE time_id = ?', timeID);

			ql.writeEntry(...testData1);
			await ql.writeEntry(timeID, '', '', '', verb, data1, data2, data3, data4, data5);
			await ql.end();

			const cols = Object.keys(testObject1).map(key => '`' + key + '`').join(',');
			const sqlstr = `SELECT ${cols}, unique_row_count FROM queue_log WHERE time_id = ? ORDER BY unique_row_count`;
			const results = await pQuery(cli, sqlstr, timeID);

			/* Remove prototype from results. */
			assert.deepStrictEqual(
				[results.length, {...results[0]}, {...results[1]}],
				[2, {...testObject1, unique_row_count: 1}, testObject2]
			);
		});
	});
});
