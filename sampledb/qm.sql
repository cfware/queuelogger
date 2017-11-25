CREATE DATABASE `queuemetrics`;
CREATE TABLE `queuemetrics`.`queue_log` (
  `partition` varchar(20) NOT NULL DEFAULT '',
  `time_id` int(11) unsigned NOT NULL DEFAULT '0',
  `call_id` varchar(200) NOT NULL,
  `queue` varchar(50) NOT NULL,
  `agent` varchar(30) NOT NULL DEFAULT '',
  `verb` varchar(30) NOT NULL DEFAULT '',
  `data1` varchar(200) NOT NULL DEFAULT '',
  `data2` varchar(200) NOT NULL DEFAULT '',
  `data3` varchar(200) NOT NULL DEFAULT '',
  `data4` varchar(200) NOT NULL DEFAULT '',
  `data5` varchar(200) NOT NULL DEFAULT '',
  `serverid` varchar(10) NOT NULL DEFAULT '',
  `unique_row_count` int(10) unsigned NOT NULL AUTO_INCREMENT,
  KEY `idx_sel` (`partition`,`time_id`,`queue`(2)),
  KEY `partizione_b` (`partition`,`time_id`,`unique_row_count`),
  KEY `by_hotdesk` (`verb`,`time_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE USER 'queuelogd'@'%' IDENTIFIED BY 'queuelogd';
GRANT INSERT ON `queuemetrics`.`queue_log` TO 'queuelogd'@'%';
FLUSH PRIVILEGES;
