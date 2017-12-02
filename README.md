# @cfware/queue_log-mysql

[![Travis CI][travis-image]][travis-url]
[![Coverage Status][coverage-image]][coverage-url]
[![Greenkeeper badge](https://badges.greenkeeper.io/cfware/queue_log-mysql.svg)](https://greenkeeper.io/)
[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![MIT][license-image]](LICENSE)

CFWare queue_log mysql writer

### Install @cfware/queue_log-mysql

This module requires node.js 8 or above.

```sh
npm i --save @cfware/queue_log-mysql
```

## Usage

```js
const queue_log = require('@cfware/queue_log-mysql');

class QueueManager {
	constructor() {
		this.queue_log = new queue_log({
			/* Default is 'P001', used as value of partition column. */
			partition: 'P001',
			/* Default is least significant part of hostname, used as value of serverid column. */
			serverid: 'serverid',
			/* Default: 'queue_log', the table we insert to. */
			table_name: 'queue_log',
			/* Override default settings used by require('mysql').createPool.
			 * The default database is queuemetrics.
			 */
			mysql: {},
		});

		process.on('SIGTERM', () => this.queue_log.end().catch(() => {}));
	}

	async writeQueueLog(time_id, call_id, queue, agent, verb, data1, data2, data3, data4, data5) {
		/* This is a pointless example.  In real life a queue manager would retrieve some
		 * data from a channel or other object. */
		try {
			await this.queue_log.writeEntry(time_id, call_id, queue, agent, verb, data1, data2, data3, data4, data5);
		} catch (err) {
			/* mysql write failed, record to a file. */
		}
	}
}
```

## Running tests

Tests are provided by eslint and mocha.  Tests require access to a test mysql or
mariadb daemon.  The test database server must have a `queuemetrics` database and
a `queuelogd` user as defined by `sampledb/qm.sql`.

Default test configuration:
```sh
npm config set @cfware/queue_log-mysql:dbhost 'localhost'
npm config set @cfware/queue_log-mysql:dbprivuser 'root'
npm config set @cfware/queue_log-mysql:dbprivpassword ''
```

These settings can be changed to use a different server or to use an account less
privileged than root.  The `priv` account must have SELECT and DELETE access to
the `queuemetrics.queue_log` table.

Once the database is created and a privileged account configured the tests can be run:
```sh
npm install
npm test
```

[npm-image]: https://img.shields.io/npm/v/@cfware/queue_log-mysql.svg
[npm-url]: https://npmjs.org/package/@cfware/queue_log-mysql
[travis-image]: https://travis-ci.org/cfware/queue_log-mysql.svg?branch=master
[travis-url]: https://travis-ci.org/cfware/queue_log-mysql
[coverage-image]: https://coveralls.io/repos/github/cfware/queue_log-mysql/badge.svg
[coverage-url]: https://coveralls.io/github/cfware/queue_log-mysql
[downloads-image]: https://img.shields.io/npm/dm/@cfware/queue_log-mysql.svg
[downloads-url]: https://npmjs.org/package/@cfware/queue_log-mysql
[license-image]: https://img.shields.io/github/license/cfware/queue_log-mysql.svg
