import {hostname} from 'os';

import t from 'libtap';
import mysql from 'mysql2';

// eslint-disable-next-line import/no-unresolved
import {QueueLogger} from '@aqm/queuelogger';

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
const serverID = hostname()
	.replace(/\..*/u, '')
	.slice(0, 10);

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

t.test('new', async t => {
	t.ok(new QueueLogger());
});

t.test('constructor defaults', async t => {
	const ql = new QueueLogger();

	t.equal(ql.partition, partition);
	t.equal(ql.tableName, 'queue_log');
	t.equal(ql.serverID, serverID);
});

t.test('constructor arguments', async t => {
	const ql = new QueueLogger({
		partition: 'P002',
		tableName: 'testtable',
		serverID: 'testsrv'
	});

	t.equal(ql.partition, 'P002');
	t.equal(ql.tableName, 'testtable');
	t.equal(ql.serverID, 'testsrv');
});

t.test('writeEntry after end throws', async t => {
	const ql = new QueueLogger();

	await ql.end();
	await t.rejects(ql.writeEntry(...testData1));
});

t.test('invalid user throws', async t => {
	const ql = new QueueLogger({mysql: {user: 'invalid user'}});

	await t.rejects(ql.writeEntry(...testData1));
	await ql.end();
});

t.test('unknown tableName throws', async t => {
	const ql = new QueueLogger({
		...settings,
		tableName: 'unknown_table'
	});

	await t.rejects(ql.writeEntry(...testData1));
	await ql.end();
});

t.test('success with auto_inc order', async t => {
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

	const backtick = '`';
	const cols = Object.keys(testObject1)
		.map(key => `${backtick}${key}${backtick}`)
		.join(',');
	const sqlstr = `SELECT ${cols}, unique_row_count FROM queue_log WHERE time_id = ? ORDER BY unique_row_count`;
	const results = await pQuery(cli, sqlstr, timeID);

	// Remove prototype from results.
	t.equal(results.length, 2);
	t.same(
		[{...results[0]}, {...results[1]}],
		[{...testObject1, unique_row_count: 1}, testObject2]
	);

	cli.end();
	ql.end();
});
