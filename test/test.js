import {hostname} from 'os';

import test from 'ava';
import mysql from 'mysql2';

import {QueueLogger} from '../index.js';

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

test('new', t => t.truthy(new QueueLogger()));
test('constructor defaults', t => {
	const ql = new QueueLogger();

	t.is(ql.partition, partition);
	t.is(ql.tableName, 'queue_log');
	t.is(ql.serverID, serverID);
});

test('constructor arguments', t => {
	const ql = new QueueLogger({
		partition: 'P002',
		tableName: 'testtable',
		serverID: 'testsrv'
	});

	t.is(ql.partition, 'P002');
	t.is(ql.tableName, 'testtable');
	t.is(ql.serverID, 'testsrv');
});

test('writeEntry after end throws', async t => {
	const ql = new QueueLogger();

	await ql.end();
	await t.throwsAsync(ql.writeEntry(...testData1));
});

test('invalid user throws', async t => {
	const ql = new QueueLogger({mysql: {user: 'invalid user'}});

	await t.throwsAsync(ql.writeEntry(...testData1));
	await ql.end();
});

test('unknown tableName throws', async t => {
	const ql = new QueueLogger({
		...settings,
		tableName: 'unknown_table'
	});

	await t.throwsAsync(ql.writeEntry(...testData1));
	await ql.end();
});

test('success with auto_inc order', async t => {
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
	const ql = new QueueLogger(settings);

	// Clear records from previous test.
	await pQuery(cli, 'DELETE FROM queue_log WHERE time_id = ?', timeID);

	ql.writeEntry(...testData1);
	await ql.writeEntry(timeID, '', '', '', verb, data1, data2, data3, data4, data5);
	await ql.end();

	const cols = Object.keys(testObject1).map(key => '`' + key + '`').join(',');
	const sqlstr = `SELECT ${cols}, unique_row_count FROM queue_log WHERE time_id = ? ORDER BY unique_row_count`;
	const results = await pQuery(cli, sqlstr, timeID);

	// Remove prototype from results.
	t.is(results.length, 2);
	t.deepEqual(
		[{...results[0]}, {...results[1]}],
		[{...testObject1, unique_row_count: 1}, testObject2]
	);

	cli.end();
	ql.end();
});
